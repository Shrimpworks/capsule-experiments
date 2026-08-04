#include <errno.h>
#include <inttypes.h>
#include <libkrun.h>
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
            "usage: %s ROOT_DISK KERNEL INITRAMFS EXECUTABLE [ARG ...]\n",
            program);
}

int main(int argc, char *argv[]) {
    if (argc < 5) {
        usage(argv[0]);
        return 64;
    }

    const char *root_disk = argv[1];
    const char *kernel = argv[2];
    const char *initramfs = argv[3];
    const char *executable = argv[4];
    const char *const environment[] = {
        "HOME=/nonexistent",
        "LANG=C",
        "PATH=/usr/sbin:/usr/bin:/sbin:/bin",
        "TMPDIR=/tmp",
        NULL,
    };
    const char *const rlimits[] = {
        "1=1048576:1048576",
        "4=0:0",
        "6=32:32",
        "7=64:64",
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

    /*
     * Development-only alternate bootstrap: use the same pinned kernel bytes
     * through libkrun's external-kernel route, and supply init.krun plus its
     * pre-pivot mount points from a bounded initramfs instead of virtiofs.
     */
    result = krun_set_kernel((uint32_t)context, kernel, KRUN_KERNEL_FORMAT_RAW,
                             initramfs, NULL);
    if (result != 0) {
        return fail_krun("krun_set_kernel", result);
    }

    result = krun_add_disk((uint32_t)context, "vda", root_disk, true);
    if (result != 0) {
        return fail_krun("krun_add_disk(root)", result);
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

    result = krun_set_exec((uint32_t)context, executable,
                           (const char *const *)&argv[5], environment);
    if (result != 0) {
        return fail_krun("krun_set_exec", result);
    }

    fprintf(stderr,
            "CAPSULE_KRUN_READY pid=%ld vcpus=%d ramMiB=%d vmmUid=%ld vmmGid=%ld "
            "network=none root=block-ro bootstrap=initramfs "
            "guestUser=trusted-launcher-required\n",
            (long)getpid(), kGuestVCPUs, kGuestRAMMiB, (long)geteuid(),
            (long)getegid());
    fflush(stderr);

    result = krun_start_enter((uint32_t)context);
    if (result != 0) {
        return fail_krun("krun_start_enter", result);
    }

    return 125;
}
