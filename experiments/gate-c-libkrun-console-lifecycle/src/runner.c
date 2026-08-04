#include <errno.h>
#include <inttypes.h>
#include <libkrun.h>
#include <signal.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

struct profile {
    const char *name;
    uint8_t vcpus;
    uint32_t ram_mib;
};

static const struct profile kProfiles[] = {
    {"probe-vcpu1-mem32", 1, 32},
    {"probe-vcpu1-mem48", 1, 48},
    {"vcpu1-mem64", 1, 64},
    {"probe-vcpu1-mem96", 1, 96},
    {"vcpu1-mem128", 1, 128},
    {"vcpu1-mem256", 1, 256},
    {"vcpu2-mem256", 2, 256},
};

static volatile sig_atomic_t g_shutdown_fd = -1;

static int fail_krun(const char *operation, int result) {
    errno = -result;
    perror(operation);
    return 125;
}

static void usage(const char *program) {
    fprintf(stderr,
            "usage: %s [--control-fd FD] --profile NAME "
            "[--termination graceful|ignore] ROOT_DISK EXECUTABLE [ARG ...]\n",
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

static const struct profile *find_profile(const char *name) {
    size_t count = sizeof(kProfiles) / sizeof(kProfiles[0]);
    for (size_t index = 0; index < count; index++) {
        if (strcmp(kProfiles[index].name, name) == 0) {
            return &kProfiles[index];
        }
    }
    return NULL;
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

static void request_guest_shutdown(int signal_number) {
    (void)signal_number;
    uint64_t one = 1;
    int fd = g_shutdown_fd;
    if (fd >= 0) {
        ssize_t ignored = write(fd, &one, sizeof(one));
        (void)ignored;
    }
}

static int configure_termination(uint32_t context, const char *mode) {
    struct sigaction action;
    memset(&action, 0, sizeof(action));
    sigemptyset(&action.sa_mask);

    if (strcmp(mode, "ignore") == 0) {
        action.sa_handler = SIG_IGN;
    } else if (strcmp(mode, "graceful") == 0) {
        int shutdown_fd = krun_get_shutdown_eventfd(context);
        if (shutdown_fd < 0) {
            return fail_krun("krun_get_shutdown_eventfd", shutdown_fd);
        }
        g_shutdown_fd = shutdown_fd;
        action.sa_handler = request_guest_shutdown;
        action.sa_flags = SA_RESTART;
    } else {
        fprintf(stderr, "unsupported termination mode: %s\n", mode);
        return 64;
    }

    if (sigaction(SIGTERM, &action, NULL) != 0) {
        perror("sigaction(SIGTERM)");
        return 125;
    }
    return 0;
}

int main(int argc, char *argv[]) {
    int argument = 1;
    int control_fd = -1;
    const char *profile_name = NULL;
    const char *termination = "graceful";

    while (argument < argc && strncmp(argv[argument], "--", 2) == 0) {
        if (strcmp(argv[argument], "--control-fd") == 0 && argument + 1 < argc) {
            control_fd = parse_fd(argv[argument + 1]);
            if (control_fd < 0) {
                usage(argv[0]);
                return 64;
            }
            argument += 2;
        } else if (strcmp(argv[argument], "--profile") == 0 && argument + 1 < argc) {
            profile_name = argv[argument + 1];
            argument += 2;
        } else if (strcmp(argv[argument], "--termination") == 0 && argument + 1 < argc) {
            termination = argv[argument + 1];
            argument += 2;
        } else {
            usage(argv[0]);
            return 64;
        }
    }

    if (profile_name == NULL || argc - argument < 2) {
        usage(argv[0]);
        return 64;
    }
    const struct profile *profile = find_profile(profile_name);
    if (profile == NULL) {
        fprintf(stderr, "unsupported exact profile: %s\n", profile_name);
        return 78;
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

    result = configure_termination((uint32_t)context, termination);
    if (result != 0) {
        return result;
    }

    result = krun_set_vm_config((uint32_t)context, profile->vcpus,
                                profile->ram_mib);
    if (result != 0) {
        return fail_krun("krun_set_vm_config", result);
    }

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
            "CAPSULE_KRUN_READY pid=%ld profile=%s vcpus=%u ramMiB=%u "
            "termination=%s network=none root=block-ro\n",
            (long)getpid(), profile->name, profile->vcpus, profile->ram_mib,
            termination);
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
