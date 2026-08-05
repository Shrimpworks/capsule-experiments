#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#include "libkrun.h"

extern char **environ;

__attribute__((used)) static const void *const required_libkrun_symbols[] = {
    (const void *)&krun_create_ctx,
    (const void *)&krun_set_vm_config,
    (const void *)&krun_add_read_only_raw_root_fd,
    (const void *)&krun_set_root_disk_remount,
    (const void *)&krun_disable_implicit_console,
    (const void *)&krun_add_virtio_console_multiport,
    (const void *)&krun_add_console_port_inout,
    (const void *)&krun_set_kernel_console,
    (const void *)&krun_set_exec,
    (const void *)&krun_start_enter,
};

static int refuse(const char *message) {
    dprintf(STDERR_FILENO, "capsule-host-runner-preflight: %s\n", message);
    return 78;
}

static int require_access_mode(int fd, int expected) {
    int flags = fcntl(fd, F_GETFL);
    return flags >= 0 && (flags & O_ACCMODE) == expected;
}

int main(int argc, char **argv) {
    (void)argv;
    static const int access_modes[8] = {
        O_RDONLY, O_WRONLY, O_WRONLY, O_RDONLY,
        O_RDONLY, O_RDONLY, O_RDONLY, O_WRONLY,
    };

    if (argc != 1) {
        return refuse("caller arguments are forbidden");
    }
    if (environ != NULL && environ[0] != NULL) {
        char expected[64];
        int length = snprintf(expected, sizeof(expected),
                              "__CF_USER_TEXT_ENCODING=0x%X:0x0:0x0", geteuid());
        if (length <= 0 || (size_t)length >= sizeof(expected) ||
            environ[1] != NULL || strcmp(environ[0], expected) != 0 ||
            unsetenv("__CF_USER_TEXT_ENCODING") != 0 || environ[0] != NULL) {
            return refuse("caller environment is forbidden");
        }
    }
    for (int fd = 0; fd <= 7; ++fd) {
        if (!require_access_mode(fd, access_modes[fd])) {
            return refuse("missing descriptor or wrong access mode in 0-through-7 manifest");
        }
    }
    long open_max = sysconf(_SC_OPEN_MAX);
    if (open_max < 9 || open_max > 65536) {
        open_max = 65536;
    }
    for (int fd = 8; fd < open_max; ++fd) {
        errno = 0;
        if (fcntl(fd, F_GETFD) >= 0 || errno != EBADF) {
            return refuse("unexpected inherited descriptor 8 or greater");
        }
    }

    struct stat root;
    if (fstat(4, &root) != 0 || !S_ISREG(root.st_mode) ||
        (root.st_mode & 0777) != 0400 || root.st_uid != geteuid() ||
        root.st_nlink != 0) {
        return refuse("runtime root must be owned, regular, mode 0400, and unlinked");
    }
    unsigned char authorization = 0;
    if (read(3, &authorization, 1) != 1 || authorization != 'G') {
        return refuse("record-before-start control byte is missing or wrong");
    }
    unsigned char trailing = 0;
    if (read(3, &trailing, 1) != 0) {
        return refuse("record-before-start control contains trailing bytes");
    }

    return refuse("build-only preflight passed; guest execution is not authorized");
}
