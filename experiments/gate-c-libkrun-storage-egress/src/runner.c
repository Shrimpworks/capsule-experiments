#include <errno.h>
#include <inttypes.h>
#include <libkrun.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

enum {
    kGuestVCPUs = 1,
    kGuestRAMMiB = 256,
};

static int fail_krun(const char *operation, int result) {
    errno = -result;
    perror(operation);
    return 125;
}

static void usage(const char *program) {
    fprintf(stderr,
            "usage: %s ROOT SOURCE INPUT SCRATCH EXECUTABLE [ARG ...]\n",
            program);
}

static int add_raw_disk(uint32_t context, const char *id, const char *path,
                        bool read_only) {
    int result = krun_add_disk(context, id, path, read_only);
    if (result != 0) {
        return fail_krun(id, result);
    }
    return 0;
}

int main(int argc, char *argv[]) {
    if (argc < 6) {
        usage(argv[0]);
        return 64;
    }

    const char *const environment[] = {
        "HOME=/nonexistent",
        "LANG=C",
        "PATH=/usr/sbin:/usr/bin:/sbin:/bin",
        "TMPDIR=/tmp",
        NULL,
    };
    const char *const rlimits[] = {
        "1=67108864:67108864", /* RLIMIT_FSIZE */
        "4=0:0",               /* RLIMIT_CORE */
        "6=32:32",             /* RLIMIT_NPROC */
        "7=64:64",             /* RLIMIT_NOFILE */
        NULL,
    };

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

    if ((result = add_raw_disk((uint32_t)context, "root", argv[1], true)) != 0 ||
        (result = add_raw_disk((uint32_t)context, "source", argv[2], true)) != 0 ||
        (result = add_raw_disk((uint32_t)context, "input", argv[3], true)) != 0 ||
        (result = add_raw_disk((uint32_t)context, "scratch", argv[4], false)) != 0) {
        return result;
    }
    result = krun_set_root_disk_remount((uint32_t)context, "/dev/vda", "ext4",
                                        "ro,nosuid,nodev");
    if (result != 0) {
        return fail_krun("krun_set_root_disk_remount", result);
    }
    result = krun_set_rlimits((uint32_t)context, rlimits);
    if (result != 0) {
        return fail_krun("krun_set_rlimits", result);
    }
    result = krun_set_workdir((uint32_t)context, "/");
    if (result != 0) {
        return fail_krun("krun_set_workdir", result);
    }
    result = krun_set_exec((uint32_t)context, argv[5],
                           (const char *const *)&argv[6], environment);
    if (result != 0) {
        return fail_krun("krun_set_exec", result);
    }

    fprintf(stderr,
            "CAPSULE_STORAGE_READY pid=%ld root=raw-ro source=raw-ro "
            "input=raw-ro scratch=raw-rw network=none virtiofs=none\n",
            (long)getpid());
    fflush(stderr);
    result = krun_start_enter((uint32_t)context);
    if (result != 0) {
        return fail_krun("krun_start_enter", result);
    }
    return 125;
}
