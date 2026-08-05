#include <errno.h>
#include <libproc.h>
#include <signal.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <sys/proc_info.h>
#include <sys/resource.h>
#include <unistd.h>

#ifndef TARGET_PATH
#error "TARGET_PATH must be fixed at build time"
#endif

#ifndef TARGET_ARG
#error "TARGET_ARG must be fixed at build time"
#endif

#define CWD_DESCRIPTOR 3
#define ADDRESS_SPACE_LIMIT (UINT64_C(256) * UINT64_C(1024) * UINT64_C(1024))

static int lower_limit(int resource, rlim_t value) {
    const struct rlimit limit = {.rlim_cur = value, .rlim_max = value};
    return setrlimit(resource, &limit);
}

static int close_inherited_descriptors(void) {
    int required = proc_pidinfo(getpid(), PROC_PIDLISTFDS, 0, NULL, 0);
    if (required < 0) {
        return -1;
    }
    if (required == 0) {
        return 0;
    }
    struct proc_fdinfo *descriptors = malloc((size_t)required);
    if (descriptors == NULL) {
        return -1;
    }
    int received = proc_pidinfo(getpid(), PROC_PIDLISTFDS, 0, descriptors, required);
    if (received < 0) {
        free(descriptors);
        return -1;
    }
    size_t count = (size_t)received / sizeof(*descriptors);
    for (size_t index = 0; index < count; index += 1) {
        int descriptor = descriptors[index].proc_fd;
        if (descriptor > STDERR_FILENO && close(descriptor) != 0 && errno != EBADF) {
            free(descriptors);
            return -1;
        }
    }
    free(descriptors);
    return 0;
}

int main(void) {
    if (fchdir(CWD_DESCRIPTOR) != 0) {
        return 70;
    }
    if (close_inherited_descriptors() != 0) {
        return 71;
    }
    if (lower_limit(RLIMIT_CORE, 0) != 0) {
        return 72;
    }
    if (lower_limit(RLIMIT_CPU, 1) != 0) {
        return 73;
    }
    if (lower_limit(RLIMIT_FSIZE, 0) != 0) {
        return 74;
    }
#if !defined(ALLOW_UNBOUNDED_MEMORY_FOR_MECHANISM_TEST)
    if (lower_limit(RLIMIT_AS, ADDRESS_SPACE_LIMIT) != 0) {
        return 75;
    }
#endif
    if (lower_limit(RLIMIT_NPROC, 0) != 0) {
        return 76;
    }
    if (lower_limit(RLIMIT_NOFILE, 16) != 0) {
        return 77;
    }
    sigset_t empty;
    if (sigemptyset(&empty) != 0 || sigprocmask(SIG_SETMASK, &empty, NULL) != 0) {
        return 78;
    }
    for (int signal_number = 1; signal_number < NSIG; signal_number += 1) {
        if (signal_number != SIGKILL && signal_number != SIGSTOP) {
            (void)signal(signal_number, SIG_DFL);
        }
    }

    char *const arguments[] = {
        (char *)"capsule-mjs-source-validator-aarch64-apple-darwin",
        (char *)TARGET_ARG,
        NULL,
    };
    char *const environment[] = {NULL};
    execve(TARGET_PATH, arguments, environment);
    return 79;
}
