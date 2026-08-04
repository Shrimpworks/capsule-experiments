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
            "usage: %s [--control-fd FD] ROOT_DISK EXECUTABLE [ARG ...]\n",
            program);
}

static int parse_fd(const char *value) {
    char *end = NULL;
    errno = 0;
    long parsed = strtol(value, &end, 10);
    if (errno != 0 || end == value || *end != '\0' || parsed < 3 ||
        parsed > INT32_MAX) {
        return -1;
    }
    return (int)parsed;
}

static int await_start_authorization(int control_fd) {
    if (control_fd < 0) {
        return 0;
    }

    char command = 0;
    ssize_t count;
    do {
        count = read(control_fd, &command, 1);
    } while (count < 0 && errno == EINTR);
    close(control_fd);

    if (count != 1 || command != 'G') {
        fprintf(stderr, "CAPSULE_KRUN_ABORTED reason=control-channel-closed\n");
        return 75;
    }
    fprintf(stderr, "CAPSULE_KRUN_AUTHORIZED pid=%ld\n", (long)getpid());
    fflush(stderr);
    return 0;
}

int main(int argc, char *argv[]) {
    int argument = 1;
    int control_fd = -1;
    if (argc >= 3 && strcmp(argv[1], "--control-fd") == 0) {
        control_fd = parse_fd(argv[2]);
        argument = 3;
    }
    if (control_fd == -1 && argument == 3) {
        usage(argv[0]);
        return 64;
    }
    if (argc - argument < 2) {
        usage(argv[0]);
        return 64;
    }

    const char *root_disk = argv[argument];
    const char *executable = argv[argument + 1];
    const char *const environment[] = {
        "HOME=/nonexistent",
        "LANG=C",
        "PATH=/usr/sbin:/usr/bin:/sbin:/bin",
        "TMPDIR=/tmp",
        NULL,
    };
    const char *const rlimits[] = {
        "1=1048576:1048576", /* RLIMIT_FSIZE */
        "4=0:0",             /* RLIMIT_CORE */
        "6=32:32",           /* RLIMIT_NPROC */
        "7=64:64",           /* RLIMIT_NOFILE */
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

    /* No implicit vsock means no TSI AF_INET/AF_INET6/AF_UNIX proxy. */
    result = krun_disable_implicit_vsock((uint32_t)context);
    if (result != 0) {
        return fail_krun("krun_disable_implicit_vsock", result);
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
                           (const char *const *)&argv[argument + 2], environment);
    if (result != 0) {
        return fail_krun("krun_set_exec", result);
    }

    fprintf(stderr,
            "CAPSULE_KRUN_READY pid=%ld vcpus=%d ramMiB=%d vmmUid=%ld vmmGid=%ld "
            "network=none root=block-ro guestUser=trusted-launcher-required\n",
            (long)getpid(), kGuestVCPUs, kGuestRAMMiB, (long)geteuid(),
            (long)getegid());
    fflush(stderr);

    result = await_start_authorization(control_fd);
    if (result != 0) {
        return result;
    }

    result = krun_start_enter((uint32_t)context);
    if (result != 0) {
        return fail_krun("krun_start_enter", result);
    }

    return 125;
}
