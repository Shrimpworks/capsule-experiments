#define _DARWIN_C_SOURCE

#include <CommonCrypto/CommonDigest.h>
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#ifndef C5B1_ROOT_SHA256
#error C5B1_ROOT_SHA256 must be supplied by the deterministic build
#endif

extern char **environ;

typedef int32_t (*create_ctx_fn)(void);
typedef int32_t (*set_vm_config_fn)(uint32_t, uint8_t, uint32_t);
typedef int32_t (*ctx_only_fn)(uint32_t);
typedef int32_t (*add_root_fd_fn)(uint32_t, int32_t, uint64_t, uint64_t, uint64_t);
typedef int32_t (*remount_fn)(uint32_t, const char *, const char *, const char *);
typedef int32_t (*add_port_fn)(uint32_t, const char *, int32_t, int32_t);
typedef int32_t (*set_string_fn)(uint32_t, const char *);
typedef int32_t (*set_exec_fn)(uint32_t, const char *, const char *const *, const char *const *);

struct api {
    create_ctx_fn create_ctx;
    set_vm_config_fn set_vm_config;
    ctx_only_fn disable_vsock;
    add_root_fd_fn add_root_fd;
    remount_fn remount;
    ctx_only_fn disable_console;
    ctx_only_fn add_multiport;
    add_port_fn add_port;
    set_string_fn set_kernel_console;
    set_exec_fn set_exec;
    ctx_only_fn start;
};

static int refuse(const char *message) {
    dprintf(STDERR_FILENO, "capsule-c5b1-host-runner: %s\n", message);
    return 78;
}

static int require_access_mode(int fd, int expected) {
    int flags = fcntl(fd, F_GETFL);
    return flags >= 0 && (flags & O_ACCMODE) == expected;
}

static int digest_fd(int fd, char output[65]) {
    CC_SHA256_CTX context;
    unsigned char digest[CC_SHA256_DIGEST_LENGTH];
    unsigned char buffer[32768];
    CC_SHA256_Init(&context);
    off_t offset = 0;
    for (;;) {
        ssize_t count = pread(fd, buffer, sizeof(buffer), offset);
        if (count < 0 && errno == EINTR) continue;
        if (count < 0) return -1;
        if (count == 0) break;
        CC_SHA256_Update(&context, buffer, (CC_LONG)count);
        offset += count;
    }
    CC_SHA256_Final(digest, &context);
    static const char hex[] = "0123456789abcdef";
    for (size_t i = 0; i < sizeof(digest); ++i) {
        output[i * 2] = hex[digest[i] >> 4];
        output[i * 2 + 1] = hex[digest[i] & 15];
    }
    output[64] = 0;
    return 0;
}

static void *symbol(void *library, const char *name) {
    void *value = dlsym(library, name);
    if (value == NULL) {
        dprintf(STDERR_FILENO, "capsule-c5b1-host-runner: missing governed symbol %s\n", name);
        _exit(78);
    }
    return value;
}

static struct api load_api(void) {
    void *library = dlopen("./lib/libkrun.1.dylib", RTLD_NOW | RTLD_LOCAL);
    if (library == NULL) {
        dprintf(STDERR_FILENO, "capsule-c5b1-host-runner: governed libkrun unavailable\n");
        _exit(78);
    }
    struct api result = {
        .create_ctx = (create_ctx_fn)symbol(library, "krun_create_ctx"),
        .set_vm_config = (set_vm_config_fn)symbol(library, "krun_set_vm_config"),
        .disable_vsock = (ctx_only_fn)symbol(library, "krun_disable_implicit_vsock"),
        .add_root_fd = (add_root_fd_fn)symbol(library, "krun_add_read_only_raw_root_fd"),
        .remount = (remount_fn)symbol(library, "krun_set_root_disk_remount"),
        .disable_console = (ctx_only_fn)symbol(library, "krun_disable_implicit_console"),
        .add_multiport = (ctx_only_fn)symbol(library, "krun_add_virtio_console_multiport"),
        .add_port = (add_port_fn)symbol(library, "krun_add_console_port_inout"),
        .set_kernel_console = (set_string_fn)symbol(library, "krun_set_kernel_console"),
        .set_exec = (set_exec_fn)symbol(library, "krun_set_exec"),
        .start = (ctx_only_fn)symbol(library, "krun_start_enter"),
    };
    return result;
}

static int call_ok(int32_t result, const char *operation) {
    if (result == 0) return 1;
    dprintf(STDERR_FILENO, "capsule-c5b1-host-runner: %s refused (%d)\n", operation, result);
    return 0;
}

int main(int argc, char **argv) {
    (void)argv;
    const int access[8] = {O_RDONLY, O_WRONLY, O_WRONLY, O_RDONLY, O_RDONLY, O_RDONLY, O_RDONLY, O_WRONLY};
    if (argc != 1) return refuse("caller arguments are forbidden");
    if (environ != NULL && environ[0] != NULL) return refuse("caller environment is forbidden");
    for (int fd = 0; fd <= 7; ++fd) {
        if (!require_access_mode(fd, access[fd])) return refuse("descriptor manifest mismatch");
    }
    for (int fd = 8; fd < 4096; ++fd) {
        errno = 0;
        if (fcntl(fd, F_GETFD) >= 0 || errno != EBADF) return refuse("unexpected descriptor 8 or greater");
    }

    struct stat root;
    char root_digest[65];
    if (fstat(4, &root) != 0 || !S_ISREG(root.st_mode) || (root.st_mode & 0777) != 0400 ||
        root.st_uid != geteuid() || root.st_nlink != 0 || digest_fd(4, root_digest) != 0 ||
        strcmp(root_digest, C5B1_ROOT_SHA256) != 0) {
        return refuse("runtime root identity/custody mismatch");
    }
    unsigned char authorization = 0, trailing = 0;
    if (read(3, &authorization, 1) != 1 || authorization != 'G' || read(3, &trailing, 1) != 0) {
        return refuse("record-before-start authorization is missing or malformed");
    }

    struct api api = load_api();
    int32_t context = api.create_ctx();
    if (context < 0) return refuse("governed context creation failed");
    uint32_t ctx = (uint32_t)context;
    if (!call_ok(api.set_vm_config(ctx, 1, 256), "set_vm_config") ||
        !call_ok(api.disable_vsock(ctx), "disable_implicit_vsock") ||
        !call_ok(api.add_root_fd(ctx, 4, (uint64_t)root.st_dev, (uint64_t)root.st_ino, (uint64_t)root.st_size), "add_read_only_raw_root_fd") ||
        !call_ok(api.remount(ctx, "/dev/vda", "ext4", "ro,nosuid,nodev"), "set_root_disk_remount") ||
        !call_ok(api.disable_console(ctx), "disable_implicit_console") ||
        !call_ok(api.add_multiport(ctx), "add_virtio_console_multiport") ||
        !call_ok(api.add_port(ctx, "capsule.source", 5, -1), "add_source_port") ||
        !call_ok(api.add_port(ctx, "capsule.input", 6, -1), "add_input_port") ||
        !call_ok(api.add_port(ctx, "capsule.completion", -1, 7), "add_completion_port") ||
        !call_ok(api.set_kernel_console(ctx, ""), "set_kernel_console") ) {
        return 78;
    }
    const char *const environment[] = {"HOME=/", "KRUN_DIRECT_BLOCK_ROOT=1", "TERM=linux", NULL};
    if (!call_ok(api.set_exec(ctx, "/usr/local/libexec/capsule-init.krun", NULL, environment), "set_exec")) return 78;
    if (!call_ok(api.start(ctx), "start_enter")) return 78;
    return refuse("governed VMM returned unexpectedly");
}
