#include <errno.h>
#include <fcntl.h>
#include <libproc.h>
#include <signal.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/proc_info.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

#ifndef SENTINEL_PATH
#error "SENTINEL_PATH must be fixed at build time"
#endif

extern char **environ;

static int write_all(int descriptor, const uint8_t *bytes, size_t length) {
    while (length > 0) {
        ssize_t written = write(descriptor, bytes, length);
        if (written < 0) {
            if (errno == EINTR) {
                continue;
            }
            return -1;
        }
        bytes += (size_t)written;
        length -= (size_t)written;
    }
    return 0;
}

static size_t read_input(uint8_t *bytes, size_t capacity) {
    size_t used = 0;
    while (used < capacity) {
        ssize_t received = read(STDIN_FILENO, bytes + used, capacity - used);
        if (received == 0) {
            break;
        }
        if (received < 0) {
            if (errno == EINTR) {
                continue;
            }
            return 0;
        }
        used += (size_t)received;
    }
    return used;
}

static uint8_t descriptor_count(void) {
    struct proc_fdinfo descriptors[16];
    int received = proc_pidinfo(
        getpid(), PROC_PIDLISTFDS, 0, descriptors, (int)sizeof(descriptors));
    if (received < 0) {
        return UINT8_MAX;
    }
    size_t count = (size_t)received / sizeof(descriptors[0]);
    return count > UINT8_MAX ? UINT8_MAX : (uint8_t)count;
}

static int audit_authority(void) {
    uint8_t report[16] = {'C', 'A', 'P', 'V', '2', 'P', 'R', 'B', 0, 0, 0, 0, 0, 0, 0, 0};
    while (report[8] != UINT8_MAX && environ[report[8]] != NULL) {
        report[8] += 1;
    }
    report[9] = descriptor_count();

    /* A compromised child may close a role descriptor and reuse its slot. */
    close(STDIN_FILENO);
    close(STDERR_FILENO);

    int descriptor = open(SENTINEL_PATH, O_RDONLY | O_NOFOLLOW);
    report[10] = descriptor >= 0;
    if (descriptor >= 0) {
        close(descriptor);
    }

    descriptor = socket(AF_INET, SOCK_STREAM, 0);
    report[11] = descriptor >= 0;
    if (descriptor >= 0) {
        close(descriptor);
    }
    descriptor = socket(AF_UNIX, SOCK_STREAM, 0);
    report[12] = descriptor >= 0;
    if (descriptor >= 0) {
        close(descriptor);
    }

    report[13] = chmod(".", 0700) == 0;
    descriptor = open(".profile-write", O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW, 0600);
    report[14] = descriptor >= 0;
    if (descriptor >= 0) {
        close(descriptor);
        unlink(".profile-write");
    }

    pid_t child = fork();
    report[15] = child < 0 && errno == EAGAIN;
    if (child == 0) {
        _exit(0);
    }
    if (child > 0) {
        (void)waitpid(child, NULL, 0);
    }
    return write_all(STDOUT_FILENO, report, sizeof(report)) == 0 ? 0 : 74;
}

static int memory_limit(void) {
    void *mapping = mmap(NULL, UINT64_C(512) * UINT64_C(1024) * UINT64_C(1024),
        PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANON, -1, 0);
    uint8_t refused = mapping == MAP_FAILED;
    if (mapping != MAP_FAILED) {
        munmap(mapping, UINT64_C(512) * UINT64_C(1024) * UINT64_C(1024));
    }
    return write_all(STDOUT_FILENO, &refused, 1) == 0 ? 0 : 74;
}

static int file_limit(void) {
    if (chmod(".", 0700) != 0) {
        return 70;
    }
    close(STDIN_FILENO);
    close(STDERR_FILENO);
    int descriptor = open(".profile-file-limit", O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW, 0600);
    if (descriptor < 0) {
        return 71;
    }
    uint8_t byte = 1;
    ssize_t result = write(descriptor, &byte, 1);
    close(descriptor);
    unlink(".profile-file-limit");
    return result < 0 ? 0 : 72;
}

/*
 * Proves RLIMIT_NOFILE is enforced by the kernel, not merely accepted by
 * setrlimit: opens /dev/null until it fails, then reports how many opens
 * succeeded and whether the failure was exactly EMFILE. The bootstrap
 * closes every inherited descriptor above stderr before execve, so the
 * probe starts with exactly 3 open descriptors (0, 1, 2); RLIMIT_NOFILE=16
 * permits fds 0-15, so exactly 13 opens should succeed before the 14th
 * fails with EMFILE.
 */
static int descriptor_limit(void) {
    uint8_t opened = 0;
    while (opened < UINT8_MAX) {
        int descriptor = open("/dev/null", O_RDONLY);
        if (descriptor < 0) {
            break;
        }
        opened += 1;
    }
    uint8_t report[2] = {opened, errno == EMFILE};
    return write_all(STDOUT_FILENO, report, sizeof(report)) == 0 ? 0 : 74;
}

static int stream_fault(const char *mode) {
    uint8_t input[138];
    size_t received = read_input(input, sizeof(input));
    if (strcmp(mode, "partial-output") == 0) {
        return received == sizeof(input) && write_all(STDOUT_FILENO, input, 69) == 0 ? 0 : 74;
    }
    if (strcmp(mode, "duplicate-output") == 0) {
        return received == sizeof(input) && write_all(STDOUT_FILENO, input, sizeof(input)) == 0 &&
            write_all(STDOUT_FILENO, input, sizeof(input)) == 0 ? 0 : 74;
    }
    if (strcmp(mode, "trailing-output") == 0) {
        uint8_t trailing = 0;
        return received == sizeof(input) && write_all(STDOUT_FILENO, input, sizeof(input)) == 0 &&
            write_all(STDOUT_FILENO, &trailing, 1) == 0 ? 0 : 74;
    }
    if (strcmp(mode, "oversize-output") == 0) {
        uint8_t output[139];
        memset(output, 'X', sizeof(output));
        return write_all(STDOUT_FILENO, output, sizeof(output)) == 0 ? 0 : 74;
    }
    return 64;
}

int main(int argc, char **argv) {
    if (argc != 2) {
        return 64;
    }
    const char *mode = argv[1];
    if (strcmp(mode, "audit-authority") == 0) {
        return audit_authority();
    }
    if (strcmp(mode, "memory-limit") == 0) {
        return memory_limit();
    }
    if (strcmp(mode, "file-limit") == 0) {
        return file_limit();
    }
    if (strcmp(mode, "descriptor-limit") == 0) {
        return descriptor_limit();
    }
    if (strcmp(mode, "cpu-limit") == 0) {
        volatile uint64_t value = 0;
        for (;;) {
            value += 1;
        }
    }
    if (strcmp(mode, "hang") == 0) {
        for (;;) {
            pause();
        }
    }
    if (strcmp(mode, "crash") == 0) {
        abort();
    }
    if (strcmp(mode, "signal") == 0) {
        raise(SIGSEGV);
        return 72;
    }
    return stream_fault(mode);
}
