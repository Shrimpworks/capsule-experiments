#include <errno.h>
#include <inttypes.h>
#include <libkrun.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

static void print_result(const char *name, int32_t result) {
    printf("%s=%" PRId32 "\n", name, result);
}

static uint32_t context(void) {
    int32_t result = krun_create_ctx();
    if (result < 0) {
        errno = -result;
        perror("krun_create_ctx");
        exit(1);
    }
    return (uint32_t)result;
}

int main(int argc, char **argv) {
    if (argc != 3) {
        fprintf(stderr, "usage: %s VALID_RAW_DISK HOST_DIRECTORY\n", argv[0]);
        return 64;
    }

    const char *features[] = {
        "net", "blk", "gpu", "snd", "input", "efi", "tee", "amd_sev",
        "intel_tdx", "aws_nitro", "virgl_resource_map2", "init_blob",
    };
    for (uint64_t feature = KRUN_FEATURE_NET; feature <= KRUN_FEATURE_INIT_BLOB; feature++) {
        printf("feature.%s=%" PRId32 "\n", features[feature], krun_has_feature(feature));
    }
    print_result("feature.unknown", krun_has_feature(UINT64_MAX));
    print_result("invalidContext.vmConfig", krun_set_vm_config(UINT32_MAX, 1, 256));

    uint32_t ctx = context();
    print_result("config.zeroVCPU", krun_set_vm_config(ctx, 0, 256));
    print_result("config.zeroRAM", krun_set_vm_config(ctx, 1, 0));
    print_result("config.exact", krun_set_vm_config(ctx, 1, 256));
    print_result("config.disableVsock", krun_disable_implicit_vsock(ctx));
    print_result("config.explicitVsockAfterDisable", krun_add_vsock(ctx, 0));
    print_result("config.virtiofsAvailable", krun_add_virtiofs3(ctx, "host", argv[2], 0, true));
    print_result("config.gpuRequest", krun_set_gpu_options(ctx, 0));
    print_result("config.soundRequest", krun_set_snd_device(ctx, true));
    print_result("config.diskExact", krun_add_disk(ctx, "vda", argv[1], true));
    print_result("config.diskDuplicateID", krun_add_disk(ctx, "vda", argv[1], true));
    print_result("config.diskMissing", krun_add_disk(ctx, "vdb", "/definitely/missing/capsule.raw", true));
    print_result("config.free", krun_free_ctx(ctx));
    return 0;
}
