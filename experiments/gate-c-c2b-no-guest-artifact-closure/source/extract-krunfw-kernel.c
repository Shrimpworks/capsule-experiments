#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

extern char *krunfw_get_kernel(size_t *load_address, size_t *entry_address,
                               size_t *size);

int main(int argc, char **argv) {
    if (argc != 2) {
        fputs("usage: extract-krunfw-kernel OUTPUT\n", stderr);
        return 64;
    }
    size_t load_address = 0;
    size_t entry_address = 0;
    size_t size = 0;
    char *kernel = krunfw_get_kernel(&load_address, &entry_address, &size);
    if (kernel == NULL || size == 0 || load_address != 0x80000000U ||
        entry_address != 0x80000000U) {
        fputs("unexpected aarch64 kernel bundle\n", stderr);
        return 65;
    }
    FILE *output = fopen(argv[1], "wb");
    if (output == NULL || fwrite(kernel, 1, size, output) != size ||
        fclose(output) != 0) {
        fputs("kernel extraction failed\n", stderr);
        return 74;
    }
    printf("kernelLoad=%#zx\nkernelEntry=%#zx\nkernelSize=%zu\n",
           load_address, entry_address, size);
    return 0;
}

