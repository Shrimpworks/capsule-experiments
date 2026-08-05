#include "CapsuleProbe.h"
#include "CapsuleContainerInventory.h"

#include <stdio.h>
#include <string.h>

int main(int argc, char **argv) {
    if (capsule_run_private_scratch_cleanup("com.capsulecorp.capsule.daemon") != 0) {
        return 70;
    }
    if (argc == 1 || (argc == 2 && strcmp(argv[1], "--probe-source-validator") == 0)) {
        return capsule_run_source_validator_probe();
    }
    if (argc == 2 && strcmp(argv[1], "--print-disabled-status") == 0) {
        puts("{\"role\":\"daemon\",\"execution\":\"disabled\",\"backend\":\"absent\",\"guest\":\"absent\"}");
        return 0;
    }
    fputs("Capsule daemon fixture refuses unknown operation\n", stderr);
    return 64;
}
