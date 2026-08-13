/*
 * Capsule C2B materialized host runner v4.
 *
 * Build/static-audit artifact only. Execution requires a separately authorized
 * owned-disposable-guest task naming the exact materialized profile digest.
 * This process accepts no attempt, plan, profile, path, image, mount, backend,
 * resource, or other replacement configuration value.
 */

#include <CommonCrypto/CommonDigest.h>
#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wcomment"
#include "libkrun.h"
#pragma clang diagnostic pop

#define CAPSULE_RUNNER_ARGV0 "capsule-host-runner"
#define CAPSULE_HOST_CLOSE_FROM_INCLUSIVE 8
#define CAPSULE_ROOT_FD 4
#define CAPSULE_ROOT_BYTES UINT64_C(134217728)
#define CAPSULE_ABI_POINTER_SLOTS 4096

static const uint8_t capsule_root_sha256[CC_SHA256_DIGEST_LENGTH] = {
    0x39, 0x0a, 0x47, 0x86, 0xa2, 0x0d, 0x45, 0xf1,
    0xc6, 0x91, 0xec, 0x8c, 0x20, 0x3f, 0x84, 0xf5,
    0xe9, 0xd3, 0x72, 0xa3, 0x0e, 0x98, 0xf8, 0x67,
    0xcc, 0x83, 0x09, 0xa1, 0x44, 0xca, 0x67, 0x98,
};

static const char *const capsule_init_argv[CAPSULE_ABI_POINTER_SLOTS] = {
    "/usr/local/libexec/capsule-init.krun",
    NULL,
};

static const char *const capsule_init_env[CAPSULE_ABI_POINTER_SLOTS] = {
    "HOME=/",
    "KRUN_DIRECT_BLOCK_ROOT=1",
    "TERM=linux",
    NULL,
};

extern char **environ;

static void refuse(void) {
    static const char message[] = "C2B_RUNNER_REFUSED\n";
    size_t offset = 0;

    while (offset < sizeof(message) - 1) {
        ssize_t written = write(STDERR_FILENO, message + offset,
                                sizeof(message) - 1 - offset);
        if (written > 0) {
            offset += (size_t)written;
            continue;
        }
        if (written < 0 && errno == EINTR) {
            continue;
        }
        break;
    }
    _exit(125);
}

static void require_success(int32_t result) {
    if (result != 0) {
        refuse();
    }
}

static int descriptor_access_mode(int fd) {
    int flags = fcntl(fd, F_GETFL);
    if (flags < 0) {
        refuse();
    }
    return flags & O_ACCMODE;
}

static struct stat require_descriptor(int fd, int access_mode, mode_t kind) {
    struct stat status = {0};

    if (fcntl(fd, F_GETFD) < 0 || descriptor_access_mode(fd) != access_mode) {
        refuse();
    }
    if (fstat(fd, &status) != 0 || (status.st_mode & S_IFMT) != kind) {
        refuse();
    }
    return status;
}

static void close_inherited_descriptors(void) {
    struct rlimit limit = {0};

    if (getrlimit(RLIMIT_NOFILE, &limit) != 0 || limit.rlim_cur == RLIM_INFINITY ||
        limit.rlim_cur > INT32_MAX) {
        refuse();
    }
    for (int fd = CAPSULE_HOST_CLOSE_FROM_INCLUSIVE;
         fd < (int)limit.rlim_cur; fd++) {
        if (close(fd) == 0 || errno == EBADF) {
            continue;
        }
        if (errno == EINTR && fcntl(fd, F_GETFD) < 0 && errno == EBADF) {
            continue;
        }
        {
            refuse();
        }
    }
}

static void require_unique_descriptors(const struct stat status[8]) {
    for (size_t left = 0; left < 8; left++) {
        for (size_t right = left + 1; right < 8; right++) {
            if (status[left].st_dev == status[right].st_dev &&
                status[left].st_ino == status[right].st_ino) {
                refuse();
            }
        }
    }
}

static struct stat preflight(int argc, char *argv[]) {
    struct stat status[8];

    if (argc != 1 || argv == NULL || argv[0] == NULL || argv[1] != NULL ||
        strcmp(argv[0], CAPSULE_RUNNER_ARGV0) != 0) {
        refuse();
    }

    if (unsetenv("__CF_USER_TEXT_ENCODING") != 0 || environ == NULL ||
        environ[0] != NULL) {
        refuse();
    }

    close_inherited_descriptors();

    status[0] = require_descriptor(0, O_RDONLY, S_IFCHR);
    status[1] = require_descriptor(1, O_WRONLY, S_IFIFO);
    status[2] = require_descriptor(2, O_WRONLY, S_IFIFO);
    status[3] = require_descriptor(3, O_RDONLY, S_IFIFO);
    status[4] = require_descriptor(4, O_RDONLY, S_IFREG);
    status[5] = require_descriptor(5, O_RDONLY, S_IFIFO);
    status[6] = require_descriptor(6, O_RDONLY, S_IFIFO);
    status[7] = require_descriptor(7, O_WRONLY, S_IFIFO);
    require_unique_descriptors(status);

    if ((status[4].st_mode & 07777) != 0400 || status[4].st_nlink != 0 ||
        status[4].st_dev == 0 || status[4].st_ino == 0 ||
        status[4].st_size != (off_t)CAPSULE_ROOT_BYTES) {
        refuse();
    }

    CC_SHA256_CTX digest_context;
    uint8_t digest[CC_SHA256_DIGEST_LENGTH];
    uint8_t buffer[64 * 1024];
    off_t offset = 0;

    if (CC_SHA256_Init(&digest_context) != 1) {
        refuse();
    }
    while ((uint64_t)offset < CAPSULE_ROOT_BYTES) {
        size_t remaining = (size_t)(CAPSULE_ROOT_BYTES - (uint64_t)offset);
        size_t wanted = remaining < sizeof(buffer) ? remaining : sizeof(buffer);
        ssize_t received = pread(CAPSULE_ROOT_FD, buffer, wanted, offset);
        if (received > 0) {
            if (CC_SHA256_Update(&digest_context, buffer, (CC_LONG)received) != 1) {
                refuse();
            }
            offset += received;
            continue;
        }
        if (received < 0 && errno == EINTR) {
            continue;
        }
        refuse();
    }
    if (CC_SHA256_Final(digest, &digest_context) != 1 ||
        memcmp(digest, capsule_root_sha256, sizeof(digest)) != 0) {
        refuse();
    }

    return status[4];
}

static void write_ready(void) {
    static const uint8_t ready = 'R';
    size_t offset = 0;

    while (offset < 1) {
        ssize_t written = write(STDOUT_FILENO, &ready + offset, 1 - offset);
        if (written > 0) {
            offset += (size_t)written;
            continue;
        }
        if (written < 0 && errno == EINTR) {
            continue;
        }
        refuse();
    }
}

static void require_start_authorization(void) {
    uint8_t authorization = 0;
    ssize_t received;

    do {
        received = read(3, &authorization, 1);
    } while (received < 0 && errno == EINTR);
    if (received != 1 || authorization != 'G') {
        refuse();
    }

    do {
        received = read(3, &authorization, 1);
    } while (received < 0 && errno == EINTR);
    if (received != 0) {
        refuse();
    }
}

int main(int argc, char *argv[]) {
    struct stat root = preflight(argc, argv);

    int32_t created = krun_create_ctx();
    if (created < 0) {
        refuse();
    }
    uint32_t context = (uint32_t)created;

    require_success(krun_set_vm_config(context, 1, 256));
    require_success(krun_disable_implicit_console(context));
    require_success(krun_disable_implicit_init(context));
    require_success(krun_disable_implicit_vsock(context));
    require_success(krun_add_read_only_raw_root_fd(
        context, CAPSULE_ROOT_FD, (uint64_t)root.st_dev,
        (uint64_t)root.st_ino, CAPSULE_ROOT_BYTES));
    require_success(krun_set_root_disk_remount(
        context, "/dev/vda", "ext4", "ro,nosuid,nodev"));

    int32_t console = krun_add_virtio_console_multiport(context);
    if (console != 0) {
        refuse();
    }
    require_success(krun_add_console_port_inout(
        context, 0, "capsule.source", 5, -1));
    require_success(krun_add_console_port_inout(
        context, 0, "capsule.input", 6, -1));
    require_success(krun_add_console_port_inout(
        context, 0, "capsule.completion", -1, 7));
    require_success(krun_set_kernel_console(context, "hvc0"));
    require_success(krun_set_workdir(context, "/"));
    require_success(krun_set_exec(
        context, "/usr/local/libexec/capsule-init.krun",
        capsule_init_argv, capsule_init_env));

    write_ready();
    require_start_authorization();

    (void)krun_start_enter(context);
    refuse();
}
