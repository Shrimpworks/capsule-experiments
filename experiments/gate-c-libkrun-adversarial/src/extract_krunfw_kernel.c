#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

extern char *krunfw_get_kernel(size_t *load_address, size_t *entry_address,
                               size_t *size);

int main(int argc, char **argv) {
    if (argc != 2) {
        fprintf(stderr, "usage: %s OUTPUT\n", argv[0]);
        return 64;
    }

    size_t load_address = 0;
    size_t entry_address = 0;
    size_t size = 0;
    char *kernel = krunfw_get_kernel(&load_address, &entry_address, &size);
    if (kernel == NULL || size == 0 || load_address != 0x80000000U ||
        entry_address != 0x80000000U) {
        fprintf(stderr,
                "unexpected kernel bundle: load=%#zx entry=%#zx size=%zu\n",
                load_address, entry_address, size);
        return 65;
    }

    FILE *output = fopen(argv[1], "wb");
    if (output == NULL) {
        perror("fopen(output)");
        return 74;
    }
    if (fwrite(kernel, 1, size, output) != size) {
        perror("fwrite(kernel)");
        fclose(output);
        return 74;
    }
    if (fclose(output) != 0) {
        perror("fclose(output)");
        return 74;
    }

    printf("kernelLoad=%#zx\nkernelEntry=%#zx\nkernelSize=%zu\n",
           load_address, entry_address, size);
    return 0;
}
