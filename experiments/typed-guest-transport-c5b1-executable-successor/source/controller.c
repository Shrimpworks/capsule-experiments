#include <stdio.h>

int main(int argc, char **argv) {
    (void)argv;
    if (argc != 1) {
        fputs("capsule-c5b1-controller: caller arguments are forbidden\n", stderr);
        return 78;
    }
    fputs("capsule-c5b1-controller: construction artifact only; C5b execution requires a separately authorized controller build bound to the accepted governed runtime/libkrun packet\n", stderr);
    return 78;
}
