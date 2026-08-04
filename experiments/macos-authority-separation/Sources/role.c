#include <signal.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

#ifndef ROLE
#define ROLE "unspecified"
#endif

#ifndef BUILD
#define BUILD "unspecified"
#endif

int main(int argc, char **argv) {
    printf("role=%s build=%s\n", ROLE, BUILD);
    fflush(stdout);
    if (argc == 2 && strcmp(argv[1], "--wait") == 0) {
        for (;;) {
            pause();
        }
    }
    return 0;
}
