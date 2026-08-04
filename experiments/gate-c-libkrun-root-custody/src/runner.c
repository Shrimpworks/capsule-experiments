#define _DARWIN_C_SOURCE

#include <CommonCrypto/CommonDigest.h>
#include <errno.h>
#include <fcntl.h>
#include <inttypes.h>
#include <libkrun.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

enum {
    kGuestVCPUs = 1,
    kGuestRAMMiB = 256,
    kDigestBufferBytes = 1024 * 1024,
};

static int fail(const char *operation) {
    perror(operation);
    return 125;
}

static int fail_krun(const char *operation, int result) {
    errno = -result;
    return fail(operation);
}

static bool parse_u64(const char *text, uint64_t *value) {
    char *end = NULL;
    errno = 0;
    unsigned long long parsed = strtoull(text, &end, 10);
    if (errno != 0 || end == text || *end != '\0') {
        return false;
    }
    *value = (uint64_t)parsed;
    return true;
}

static bool parse_fd(const char *text, int *value) {
    uint64_t parsed;
    if (!parse_u64(text, &parsed) || parsed < 3 || parsed > INT32_MAX) {
        return false;
    }
    *value = (int)parsed;
    return true;
}

static void hex_digest(const unsigned char digest[CC_SHA256_DIGEST_LENGTH],
                       char output[CC_SHA256_DIGEST_LENGTH * 2 + 1]) {
    static const char digits[] = "0123456789abcdef";
    for (size_t index = 0; index < CC_SHA256_DIGEST_LENGTH; ++index) {
        output[index * 2] = digits[digest[index] >> 4];
        output[index * 2 + 1] = digits[digest[index] & 0x0f];
    }
    output[CC_SHA256_DIGEST_LENGTH * 2] = '\0';
}

static int digest_fd(int fd, uint64_t length,
                     char output[CC_SHA256_DIGEST_LENGTH * 2 + 1]) {
    unsigned char *buffer = malloc(kDigestBufferBytes);
    if (buffer == NULL) {
        return -1;
    }
    CC_SHA256_CTX context;
    CC_SHA256_Init(&context);
    uint64_t offset = 0;
    while (offset < length) {
        size_t requested = (size_t)((length - offset) < kDigestBufferBytes
                                        ? (length - offset)
                                        : kDigestBufferBytes);
        ssize_t count = pread(fd, buffer, requested, (off_t)offset);
        if (count < 0 && errno == EINTR) {
            continue;
        }
        if (count <= 0) {
            free(buffer);
            errno = count == 0 ? EIO : errno;
            return -1;
        }
        CC_SHA256_Update(&context, buffer, (CC_LONG)count);
        offset += (uint64_t)count;
    }
    unsigned char digest[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256_Final(digest, &context);
    hex_digest(digest, output);
    free(buffer);
    return 0;
}

static void usage(const char *program) {
    fprintf(stderr,
            "usage: %s ROOT_FD EXPECTED_DEV EXPECTED_INO EXPECTED_LENGTH "
            "EXPECTED_SHA256 GUEST_EXECUTABLE\n",
            program);
}

int main(int argc, char *argv[]) {
    if (argc != 7) {
        usage(argv[0]);
        return 64;
    }

    int root_fd;
    uint64_t expected_dev;
    uint64_t expected_ino;
    uint64_t expected_length;
    if (!parse_fd(argv[1], &root_fd) || !parse_u64(argv[2], &expected_dev) ||
        !parse_u64(argv[3], &expected_ino) ||
        !parse_u64(argv[4], &expected_length) || strlen(argv[5]) != 64 ||
        argv[6][0] != '/') {
        usage(argv[0]);
        return 64;
    }

    int root_flags = fcntl(root_fd, F_GETFL);
    struct stat root_stat;
    if (root_flags < 0 || fstat(root_fd, &root_stat) != 0) {
        return fail("root descriptor preflight");
    }
    if ((root_flags & O_ACCMODE) != O_RDONLY || !S_ISREG(root_stat.st_mode) ||
        (root_stat.st_mode & 0777) != 0400 || root_stat.st_nlink != 0 ||
        (uint64_t)root_stat.st_dev != expected_dev ||
        (uint64_t)root_stat.st_ino != expected_ino ||
        (uint64_t)root_stat.st_size != expected_length) {
        fprintf(stderr,
                "RUNNER_DESCRIPTOR_REJECT fd=%d access=%d regular=%s mode=%03o nlink=%u "
                "dev=%" PRIu64 " ino=%" PRIu64 " length=%" PRIu64 "\n",
                root_fd, root_flags & O_ACCMODE,
                S_ISREG(root_stat.st_mode) ? "true" : "false",
                (unsigned)(root_stat.st_mode & 0777),
                (unsigned)root_stat.st_nlink, (uint64_t)root_stat.st_dev,
                (uint64_t)root_stat.st_ino, (uint64_t)root_stat.st_size);
        return 77;
    }

    char actual_digest[CC_SHA256_DIGEST_LENGTH * 2 + 1];
    if (digest_fd(root_fd, expected_length, actual_digest) != 0) {
        return fail("root descriptor digest");
    }
    if (strcmp(actual_digest, argv[5]) != 0) {
        fprintf(stderr,
                "RUNNER_DESCRIPTOR_REJECT fd=%d reason=digest expected=%s actual=%s\n",
                root_fd, argv[5], actual_digest);
        return 77;
    }

    fprintf(stderr,
            "RUNNER_DESCRIPTOR_ACCEPT fd=%d access=0 dev=%" PRIu64
            " ino=%" PRIu64 " nlink=0 length=%" PRIu64 " digest=%s\n",
            root_fd, expected_dev, expected_ino, expected_length, actual_digest);

    int result = krun_init_log(STDERR_FILENO, KRUN_LOG_LEVEL_WARN,
                               KRUN_LOG_STYLE_NEVER, 0);
    if (result != 0) {
        return fail_krun("krun_init_log", result);
    }
    int context = krun_create_ctx();
    if (context < 0) {
        return fail_krun("krun_create_ctx", context);
    }
    result = krun_set_vm_config((uint32_t)context, kGuestVCPUs, kGuestRAMMiB);
    if (result != 0) {
        return fail_krun("krun_set_vm_config", result);
    }
    result = krun_disable_implicit_vsock((uint32_t)context);
    if (result != 0) {
        return fail_krun("krun_disable_implicit_vsock", result);
    }
    result = krun_add_read_only_raw_root_fd(
        (uint32_t)context, root_fd, expected_dev, expected_ino, expected_length);
    if (result != 0) {
        return fail_krun("krun_add_read_only_raw_root_fd", result);
    }
    if (close(root_fd) != 0) {
        return fail("close caller root descriptor");
    }
    fprintf(stderr,
            "LIBKRUN_FD_NATIVE_ROOT_ACCEPT role=runtime-root device=vda "
            "callerDescriptorClosed=true dev=%" PRIu64 " ino=%" PRIu64
            " length=%" PRIu64 "\n",
            expected_dev, expected_ino, expected_length);
    result = krun_set_root_disk_remount((uint32_t)context, "/dev/vda", "ext4",
                                        "ro,nosuid,nodev");
    if (result != 0) {
        return fail_krun("krun_set_root_disk_remount", result);
    }
    result = krun_set_workdir((uint32_t)context, "/");
    if (result != 0) {
        return fail_krun("krun_set_workdir", result);
    }
    const char *const environment[] = {
        "HOME=/nonexistent", "LANG=C", "PATH=/usr/sbin:/usr/bin:/sbin:/bin",
        "TMPDIR=/tmp", NULL,
    };
    result = krun_set_exec((uint32_t)context, argv[6], NULL, environment);
    if (result != 0) {
        return fail_krun("krun_set_exec", result);
    }

    fprintf(stderr, "RUNNER_START root=fd-native-raw-read-only\n");
    fflush(stderr);
    result = krun_start_enter((uint32_t)context);
    if (result != 0) {
        return fail_krun("krun_start_enter", result);
    }
    return 125;
}
