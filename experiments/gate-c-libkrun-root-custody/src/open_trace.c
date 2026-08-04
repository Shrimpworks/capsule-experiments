#define _DARWIN_C_SOURCE

#include <errno.h>
#include <fcntl.h>
#include <inttypes.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <unistd.h>

static unsigned g_open_count;

static int traced_open(const char *path, int flags, ...) {
    mode_t mode = 0;
    if ((flags & O_CREAT) != 0) {
        va_list arguments;
        va_start(arguments, flags);
        mode = (mode_t)va_arg(arguments, int);
        va_end(arguments);
    }
    int result = (int)syscall(SYS_open, path, flags, mode);
    const char *root_path = getenv("CAPSULE_TRACE_ROOT_PATH");
    if (root_path != NULL && strcmp(path, root_path) == 0) {
        const char *root_fd_text = getenv("CAPSULE_TRACE_ROOT_FD");
        int root_fd = root_fd_text == NULL ? -1 : atoi(root_fd_text);
        struct stat opened = {0};
        struct stat inherited = {0};
        int opened_flags = result >= 0 ? fcntl(result, F_GETFL) : -1;
        int saved_errno = errno;
        int opened_stat = result >= 0 ? fstat(result, &opened) : -1;
        int inherited_stat = root_fd >= 0 ? fstat(root_fd, &inherited) : -1;
        ++g_open_count;
        dprintf(STDERR_FILENO,
                "LIBKRUN_ROOT_OPEN consumer=%u path=%s requestedAccess=%d result=%d "
                "resultAccess=%d openedStat=%d openedDev=%" PRIu64
                " openedIno=%" PRIu64 " inheritedStat=%d inheritedDev=%" PRIu64
                " inheritedIno=%" PRIu64 " identityMatch=%s errno=%d\n",
                g_open_count, path, flags & O_ACCMODE, result,
                opened_flags < 0 ? -1 : opened_flags & O_ACCMODE, opened_stat,
                (uint64_t)opened.st_dev, (uint64_t)opened.st_ino, inherited_stat,
                (uint64_t)inherited.st_dev, (uint64_t)inherited.st_ino,
                opened_stat == 0 && inherited_stat == 0 &&
                        opened.st_dev == inherited.st_dev &&
                        opened.st_ino == inherited.st_ino
                    ? "true"
                    : "false",
                result < 0 ? saved_errno : 0);
        errno = saved_errno;
    }
    return result;
}

#define DYLD_INTERPOSE(replacement, replacee)                                    \
    __attribute__((used)) static struct {                                        \
        const void *replacement;                                                 \
        const void *replacee;                                                    \
    } _interpose_##replacee __attribute__((section("__DATA,__interpose"))) = {   \
        (const void *)(uintptr_t)&replacement, (const void *)(uintptr_t)&replacee \
    }

DYLD_INTERPOSE(traced_open, open);
