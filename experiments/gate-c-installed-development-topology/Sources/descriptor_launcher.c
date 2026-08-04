#include <errno.h>
#include <fcntl.h>
#include <spawn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/spawn.h>
#include <sys/wait.h>
#include <unistd.h>

extern char **environ;

static void fail(const char *message) {
    perror(message);
    exit(74);
}

static void add_dup(posix_spawn_file_actions_t *actions, int source, int target) {
    int status = posix_spawn_file_actions_adddup2(actions, source, target);
    if (status != 0) {
        errno = status;
        fail("posix_spawn_file_actions_adddup2");
    }
}

int main(int argc, char **argv) {
    if (argc != 4 || (strcmp(argv[3], "exact") != 0 && strcmp(argv[3], "extra") != 0)) {
        fprintf(stderr, "usage: %s RUNNER ROOT exact|extra\n", argv[0]);
        return 64;
    }
    int root = open(argv[2], O_RDONLY | O_CLOEXEC);
    if (root < 0) fail("open root placeholder");
    int source[2], input[2], completion[2], control[2], extra[2];
    if (pipe(source) || pipe(input) || pipe(completion) || pipe(control) || pipe(extra)) {
        fail("pipe");
    }
    posix_spawn_file_actions_t actions;
    posix_spawnattr_t attributes;
    if (posix_spawn_file_actions_init(&actions) != 0 || posix_spawnattr_init(&attributes) != 0) {
        fail("spawn init");
    }
    short flags = POSIX_SPAWN_CLOEXEC_DEFAULT;
    if (posix_spawnattr_setflags(&attributes, flags) != 0) fail("spawn flags");
    if (posix_spawn_file_actions_addinherit_np(&actions, STDIN_FILENO) != 0 ||
        posix_spawn_file_actions_addinherit_np(&actions, STDOUT_FILENO) != 0 ||
        posix_spawn_file_actions_addinherit_np(&actions, STDERR_FILENO) != 0) {
        fail("spawn stdio inherit");
    }
    add_dup(&actions, root, 3);
    add_dup(&actions, source[1], 4);
    add_dup(&actions, input[1], 5);
    add_dup(&actions, completion[0], 6);
    add_dup(&actions, control[0], 7);
    if (strcmp(argv[3], "extra") == 0) add_dup(&actions, extra[0], 8);
    char *child_argv[] = {argv[1], NULL};
    char *child_env[] = {"PATH=/usr/bin:/bin", NULL};
    pid_t child = 0;
    int status = posix_spawn(&child, argv[1], &actions, &attributes, child_argv, child_env);
    if (status != 0) {
        errno = status;
        fail("posix_spawn");
    }
    printf("runnerPid=%d mode=%s\n", child, argv[3]);
    fflush(stdout);
    if (strcmp(argv[3], "exact") == 0) {
        usleep(1500000);
        if (write(control[1], "G", 1) != 1) fail("write control");
    }
    int child_status = 0;
    if (waitpid(child, &child_status, 0) != child) fail("waitpid");
    if (WIFEXITED(child_status)) return WEXITSTATUS(child_status);
    return 128 + WTERMSIG(child_status);
}
