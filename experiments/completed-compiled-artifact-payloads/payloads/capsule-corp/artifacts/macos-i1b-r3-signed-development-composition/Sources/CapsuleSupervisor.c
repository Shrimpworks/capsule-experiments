#include "CapsuleContainerInventory.h"

#include <stdio.h>
#include <string.h>

int main(int argc, char **argv) {
    if (capsule_run_private_scratch_cleanup("com.capsulecorp.capsule.supervisor") != 0) {
        return 70;
    }
    if (argc == 1 || (argc == 2 && strcmp(argv[1], "--print-disabled-status") == 0)) {
        puts("{\"role\":\"supervisor-placeholder\",\"execution\":\"disabled\",\"attempts\":\"disabled\",\"backend\":\"absent\",\"guest\":\"absent\"}");
        return 0;
    }
    fputs("Capsule Supervisor placeholder refuses unknown operation\n", stderr);
    return 64;
}
