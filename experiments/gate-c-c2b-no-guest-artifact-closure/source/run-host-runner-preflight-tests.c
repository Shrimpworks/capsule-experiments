#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <unistd.h>

enum mutation {
    MUTATION_NONE,
    MUTATION_MISSING_FD7,
    MUTATION_EXTRA_FD8,
    MUTATION_WRONG_FD5_MODE,
    MUTATION_BAD_CONTROL,
    MUTATION_LINKED_ROOT,
    MUTATION_EXTRA_ARG,
    MUTATION_EXTRA_ENV,
};

struct test_case {
    const char *name;
    enum mutation mutation;
    const char *expected;
};

static char linked_root_path[PATH_MAX];

static int duplicate_high(int fd) {
    int duplicate = fcntl(fd, F_DUPFD_CLOEXEC, 20);
    if (duplicate < 0) {
        perror("F_DUPFD_CLOEXEC");
        exit(2);
    }
    close(fd);
    return duplicate;
}

static int make_root(bool linked) {
    char path[] = "/tmp/capsule-c2b-root.XXXXXX";
    int writable = mkstemp(path);
    if (writable < 0 || ftruncate(writable, 512) != 0 ||
        fchmod(writable, 0400) != 0 || close(writable) != 0) {
        perror("create root fixture");
        exit(2);
    }
    int readonly = open(path, O_RDONLY | O_CLOEXEC);
    if (readonly < 0) {
        perror("open root fixture");
        exit(2);
    }
    if (linked) {
        if (snprintf(linked_root_path, sizeof(linked_root_path), "%s", path) < 0) {
            exit(2);
        }
    } else if (unlink(path) != 0) {
        perror("unlink root fixture");
        exit(2);
    }
    return duplicate_high(readonly);
}

static int run_case(const char *runner, const struct test_case *test) {
    int capture[2];
    int control[2];
    if (pipe(capture) != 0 || pipe(control) != 0) {
        perror("pipe");
        return 2;
    }
    char authorization = test->mutation == MUTATION_BAD_CONTROL ? 'X' : 'G';
    if (write(control[1], &authorization, 1) != 1) {
        perror("control write");
        return 2;
    }
    close(control[1]);

    int source[8] = {
        duplicate_high(open("/dev/null", O_RDONLY | O_CLOEXEC)),
        duplicate_high(open("/dev/null", O_WRONLY | O_CLOEXEC)),
        duplicate_high(capture[1]),
        duplicate_high(control[0]),
        make_root(test->mutation == MUTATION_LINKED_ROOT),
        duplicate_high(open("/dev/null", test->mutation == MUTATION_WRONG_FD5_MODE
                                             ? O_WRONLY | O_CLOEXEC
                                             : O_RDONLY | O_CLOEXEC)),
        duplicate_high(open("/dev/null", O_RDONLY | O_CLOEXEC)),
        duplicate_high(open("/dev/null", O_WRONLY | O_CLOEXEC)),
    };
    close(capture[1]);

    pid_t child = fork();
    if (child < 0) {
        perror("fork");
        return 2;
    }
    if (child == 0) {
        for (int target = 0; target <= 7; ++target) {
            if (test->mutation == MUTATION_MISSING_FD7 && target == 7) {
                continue;
            }
            if (dup2(source[target], target) < 0) {
                _exit(125);
            }
        }
        for (int fd = 8; fd < 256; ++fd) {
            close(fd);
        }
        if (test->mutation == MUTATION_EXTRA_FD8 && dup2(0, 8) < 0) {
            _exit(125);
        }
        char *const exact_argv[] = {(char *)runner, NULL};
        char *const extra_argv[] = {(char *)runner, (char *)"forbidden", NULL};
        char *const exact_environment[] = {NULL};
        char *const extra_environment[] = {(char *)"CAPSULE_EXTRA=1", NULL};
        execve(runner,
               test->mutation == MUTATION_EXTRA_ARG ? extra_argv : exact_argv,
               test->mutation == MUTATION_EXTRA_ENV ? extra_environment
                                                    : exact_environment);
        _exit(126);
    }

    for (int index = 0; index <= 7; ++index) {
        close(source[index]);
    }
    char output[1024] = {0};
    ssize_t count = read(capture[0], output, sizeof(output) - 1);
    close(capture[0]);
    int status = 0;
    if (waitpid(child, &status, 0) != child || count < 0) {
        perror("wait/read");
        return 2;
    }
    if (test->mutation == MUTATION_LINKED_ROOT) {
        unlink(linked_root_path);
        linked_root_path[0] = '\0';
    }
    if (!WIFEXITED(status) || WEXITSTATUS(status) != 78 ||
        strstr(output, test->expected) == NULL) {
        fprintf(stderr, "%s: unexpected status/output: %d %s\n", test->name,
                status, output);
        return 1;
    }
    printf("PASSED %s: %s\n", test->name, test->expected);
    return 0;
}

int main(int argc, char **argv) {
    if (argc != 2) {
        fprintf(stderr, "usage: %s RUNNER\n", argv[0]);
        return 2;
    }
    char runner[PATH_MAX];
    if (realpath(argv[1], runner) == NULL) {
        perror("realpath runner");
        return 2;
    }
    char directory[PATH_MAX];
    if (snprintf(directory, sizeof(directory), "%s", runner) < 0) {
        return 2;
    }
    char *separator = strrchr(directory, '/');
    if (separator == NULL) {
        return 2;
    }
    *separator = '\0';
    if (chdir(directory) != 0) {
        perror("chdir runner package");
        return 2;
    }
    const struct test_case tests[] = {
        {"exact-manifest", MUTATION_NONE, "build-only preflight passed"},
        {"missing-fd7", MUTATION_MISSING_FD7, "missing descriptor"},
        {"extra-fd8", MUTATION_EXTRA_FD8, "unexpected inherited descriptor"},
        {"wrong-fd5-mode", MUTATION_WRONG_FD5_MODE, "wrong access mode"},
        {"bad-control", MUTATION_BAD_CONTROL, "control byte is missing or wrong"},
        {"linked-root", MUTATION_LINKED_ROOT, "runtime root must be owned"},
        {"extra-argv", MUTATION_EXTRA_ARG, "caller arguments are forbidden"},
        {"extra-env", MUTATION_EXTRA_ENV, "caller environment is forbidden"},
    };
    for (size_t index = 0; index < sizeof(tests) / sizeof(tests[0]); ++index) {
        if (run_case(runner, &tests[index]) != 0) {
            return 1;
        }
    }
    return 0;
}
