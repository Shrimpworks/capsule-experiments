#include "effect_adapter.h"

#include <stdbool.h>

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wcomment"
#pragma clang diagnostic ignored "-Wstrict-prototypes"
#include "../inputs/c5b2/libkrun.h"
#pragma clang diagnostic pop

#define C5B5_ALLOWED_ACTIONS ( \
    C5B3_ACTION_CREATE_ENDPOINTS | C5B3_ACTION_START_DRAINS | \
    C5B3_ACTION_START_RUNNER | C5B3_ACTION_WRITE_SOURCE | \
    C5B3_ACTION_WRITE_INPUT | C5B3_ACTION_CLOSE_INPUT_WRITERS | \
    C5B3_ACTION_ALLOW_CHILD | C5B3_ACTION_REQUEST_TEARDOWN | \
    C5B3_ACTION_PROVE_ABSENCE | C5B3_ACTION_REMOVE_FIXED_ROOT | \
    C5B3_ACTION_REQUEST_DURABLE_COMMIT | C5B3_ACTION_DELIVER_STORED | \
    C5B3_ACTION_REPLAY_STORED | C5B3_ACTION_FENCE_STORE | \
    C5B3_ACTION_STOP_MISMATCH)

_Static_assert(sizeof(struct c5b5_immutable_profile) == 240, "profile ABI changed");
_Static_assert(sizeof(struct c5b5_operation) == 32, "operation ABI changed");

/*
 * These typed references retain the exact reviewed undefined libkrun symbol
 * set in the relocatable object without implementing or invoking any effect.
 */
static int32_t (*const c5b5_import_create_ctx)(void)
    __attribute__((used)) = krun_create_ctx;
static int32_t (*const c5b5_import_set_vm_config)(uint32_t, uint8_t, uint32_t)
    __attribute__((used)) = krun_set_vm_config;
static int32_t (*const c5b5_import_disable_console)(uint32_t)
    __attribute__((used)) = krun_disable_implicit_console;
static int32_t (*const c5b5_import_disable_init)(uint32_t)
    __attribute__((used)) = krun_disable_implicit_init;
static int32_t (*const c5b5_import_disable_vsock)(uint32_t)
    __attribute__((used)) = krun_disable_implicit_vsock;
static int32_t (*const c5b5_import_add_root)(uint32_t, int, uint64_t, uint64_t, uint64_t)
    __attribute__((used)) = krun_add_read_only_raw_root_fd;
static int32_t (*const c5b5_import_remount)(uint32_t, const char *, const char *, const char *)
    __attribute__((used)) = krun_set_root_disk_remount;
static int32_t (*const c5b5_import_add_console)(uint32_t)
    __attribute__((used)) = krun_add_virtio_console_multiport;
static int32_t (*const c5b5_import_add_port)(uint32_t, uint32_t, const char *, int, int)
    __attribute__((used)) = krun_add_console_port_inout;
static int32_t (*const c5b5_import_set_console)(uint32_t, const char *)
    __attribute__((used)) = krun_set_kernel_console;
static int32_t (*const c5b5_import_set_workdir)(uint32_t, const char *)
    __attribute__((used)) = krun_set_workdir;
static int32_t (*const c5b5_import_set_exec)(uint32_t, const char *, const char *const[], const char *const[])
    __attribute__((used)) = krun_set_exec;
static int32_t (*const c5b5_import_start_enter)(uint32_t)
    __attribute__((used)) = krun_start_enter;

static const uint8_t c5b5_controller_contract_sha256[32] = {
    0x36, 0x28, 0x5d, 0x7f, 0xa3, 0xf2, 0x7a, 0x99,
    0x2f, 0xda, 0x41, 0x3a, 0xfb, 0x38, 0xc1, 0xed,
    0x05, 0xa3, 0xaf, 0x30, 0xf4, 0x96, 0xc5, 0x78,
    0x4b, 0x21, 0x65, 0xd5, 0xb2, 0xf9, 0x0e, 0x59,
};
static const uint8_t c5b5_controller_header_sha256[32] = {
    0x0a, 0xe1, 0x53, 0xa4, 0x7d, 0x5a, 0x2d, 0x0c,
    0xdf, 0xba, 0xe7, 0xe1, 0x49, 0x13, 0x9b, 0x72,
    0xab, 0xbd, 0x35, 0xf7, 0xf1, 0x22, 0x3d, 0xd5,
    0x74, 0x5f, 0x03, 0xdf, 0x86, 0xca, 0xdd, 0x12,
};
static const uint8_t c5b5_libkrun_header_sha256[32] = {
    0xdc, 0xe4, 0x4d, 0x1d, 0x70, 0xab, 0x77, 0x0b,
    0x10, 0x89, 0xe5, 0x76, 0x46, 0xe0, 0x25, 0x28,
    0x1a, 0x41, 0x37, 0xfe, 0x50, 0x52, 0xb9, 0xdd,
    0x8e, 0xae, 0xfb, 0x80, 0xc0, 0x1a, 0x1b, 0xd8,
};
static const uint8_t c5b5_libkrun_dylib_sha256[32] = {
    0x05, 0x5d, 0x9d, 0x18, 0xdc, 0x96, 0x4f, 0xec,
    0x4a, 0xba, 0x21, 0x94, 0x8c, 0x4a, 0x34, 0x4c,
    0xb7, 0xa5, 0x1c, 0xb4, 0x8a, 0x2c, 0x70, 0x01,
    0x74, 0x84, 0xb7, 0x18, 0xea, 0xe1, 0x2f, 0x9f,
};
static const uint8_t c5b5_libkrunfw_dylib_sha256[32] = {
    0x0b, 0x14, 0xf4, 0xb8, 0x00, 0x5d, 0xaf, 0xd3,
    0x3c, 0x38, 0xdf, 0x59, 0x35, 0xb9, 0xef, 0xdb,
    0x63, 0x81, 0xc7, 0x24, 0x22, 0x4b, 0x39, 0x67,
    0xba, 0x1c, 0xec, 0xbe, 0xcf, 0x10, 0xb6, 0xe9,
};

static int equal32(const uint8_t left[32], const uint8_t right[32]) {
    uint8_t difference = 0;
    size_t index;
    for (index = 0; index < 32; index++) {
        difference |= (uint8_t)(left[index] ^ right[index]);
    }
    return difference == 0;
}

int32_t c5b5_validate_immutable_profile(
    const struct c5b5_immutable_profile *profile
) {
    if (profile == NULL) {
        return C5B5_REFUSE_PROFILE_ABSENT;
    }
    if (profile->magic != C5B5_PROFILE_MAGIC ||
        profile->version != C5B5_PROFILE_VERSION ||
        profile->structure_bytes != sizeof(*profile) ||
        profile->host_root_fd != 4 || profile->source_fd != 5 ||
        profile->input_fd != 6 || profile->completion_fd != 7 ||
        profile->vcpus != 1 || profile->ram_mib != 256 ||
        profile->root_bytes != UINT64_C(134217728) ||
        profile->source_physical_maximum != UINT64_C(262296) ||
        profile->input_physical_maximum != UINT64_C(262296) ||
        profile->completion_physical_maximum != UINT64_C(262368) ||
        profile->completion_retention_bytes != UINT64_C(262369) ||
        !equal32(profile->controller_contract_sha256, c5b5_controller_contract_sha256) ||
        !equal32(profile->controller_header_sha256, c5b5_controller_header_sha256) ||
        !equal32(profile->libkrun_header_sha256, c5b5_libkrun_header_sha256) ||
        !equal32(profile->libkrun_dylib_sha256, c5b5_libkrun_dylib_sha256) ||
        !equal32(profile->libkrunfw_dylib_sha256, c5b5_libkrunfw_dylib_sha256)) {
        return C5B5_REFUSE_PROFILE_MISMATCH;
    }
    return C5B5_OK;
}

static int32_t append(
    struct c5b5_plan *plan,
    uint32_t effect,
    uint32_t action,
    int32_t input_fd,
    int32_t output_fd,
    uint64_t value_a,
    uint64_t value_b
) {
    if (plan->count >= C5B5_PLAN_CAPACITY) {
        return C5B5_REFUSE_PLAN_CAPACITY;
    }
    plan->operations[plan->count] = (struct c5b5_operation){
        effect, action, input_fd, output_fd, value_a, value_b,
    };
    plan->count++;
    return C5B5_OK;
}

#define APPEND(effect, action, in_fd, out_fd, a, b) do { \
    int32_t status = append(plan, effect, action, in_fd, out_fd, a, b); \
    if (status != C5B5_OK) { return status; } \
} while (0)

int32_t c5b5_translate_controller_actions(
    const struct c5b5_immutable_profile *profile,
    uint64_t controller_actions,
    struct c5b5_plan *plan
) {
    int32_t status = c5b5_validate_immutable_profile(profile);
    if (status != C5B5_OK) {
        return status;
    }
    if (plan == NULL) {
        return C5B5_REFUSE_OUTPUT_ABSENT;
    }
    plan->count = 0;
    plan->execution_authorized = 0;
    if ((controller_actions & ~C5B5_ALLOWED_ACTIONS) != 0) {
        return C5B5_REFUSE_ACTION_UNKNOWN;
    }
    if ((controller_actions & C5B3_ACTION_CREATE_ENDPOINTS) != 0) {
        APPEND(C5B5_EFFECT_CREATE_ENDPOINTS, C5B3_ACTION_CREATE_ENDPOINTS, 5, 7, 6, 3);
    }
    if ((controller_actions & C5B3_ACTION_START_DRAINS) != 0) {
        APPEND(C5B5_EFFECT_START_DRAINS, C5B3_ACTION_START_DRAINS, 5, 7, 262369, 1000);
    }
    if ((controller_actions & C5B3_ACTION_START_RUNNER) != 0) {
        APPEND(C5B5_EFFECT_KRUN_CREATE_CTX, C5B3_ACTION_START_RUNNER, -1, -1, 0, 0);
        APPEND(C5B5_EFFECT_KRUN_SET_VM_CONFIG, C5B3_ACTION_START_RUNNER, -1, -1, 1, 256);
        APPEND(C5B5_EFFECT_KRUN_DISABLE_IMPLICIT_CONSOLE, C5B3_ACTION_START_RUNNER, -1, -1, 0, 0);
        APPEND(C5B5_EFFECT_KRUN_DISABLE_IMPLICIT_INIT, C5B3_ACTION_START_RUNNER, -1, -1, 0, 0);
        APPEND(C5B5_EFFECT_KRUN_DISABLE_IMPLICIT_VSOCK, C5B3_ACTION_START_RUNNER, -1, -1, 0, 0);
        APPEND(C5B5_EFFECT_KRUN_ADD_READ_ONLY_RAW_ROOT_FD, C5B3_ACTION_START_RUNNER, 4, -1, 134217728, 0400);
        APPEND(C5B5_EFFECT_KRUN_SET_ROOT_DISK_REMOUNT, C5B3_ACTION_START_RUNNER, -1, -1, 0, 0);
        APPEND(C5B5_EFFECT_KRUN_ADD_VIRTIO_CONSOLE_MULTIPORT, C5B3_ACTION_START_RUNNER, -1, -1, 0, 0);
        APPEND(C5B5_EFFECT_KRUN_ADD_SOURCE_PORT, C5B3_ACTION_START_RUNNER, 5, -1, 0, 0);
        APPEND(C5B5_EFFECT_KRUN_ADD_INPUT_PORT, C5B3_ACTION_START_RUNNER, 6, -1, 0, 0);
        APPEND(C5B5_EFFECT_KRUN_ADD_COMPLETION_PORT, C5B3_ACTION_START_RUNNER, -1, 7, 0, 0);
        APPEND(C5B5_EFFECT_KRUN_SET_KERNEL_CONSOLE, C5B3_ACTION_START_RUNNER, -1, -1, 0, 0);
        APPEND(C5B5_EFFECT_KRUN_SET_WORKDIR, C5B3_ACTION_START_RUNNER, -1, -1, 0, 0);
        APPEND(C5B5_EFFECT_KRUN_SET_EXEC, C5B3_ACTION_START_RUNNER, -1, -1, 0, 0);
        APPEND(C5B5_EFFECT_WRITE_READY, C5B3_ACTION_START_RUNNER, -1, 1, 'R', 0);
        APPEND(C5B5_EFFECT_REQUIRE_START_BYTE, C5B3_ACTION_START_RUNNER, 3, -1, 'G', 0);
        APPEND(C5B5_EFFECT_KRUN_START_ENTER, C5B3_ACTION_START_RUNNER, -1, -1, 0, 0);
    }
    if ((controller_actions & C5B3_ACTION_WRITE_SOURCE) != 0) {
        APPEND(C5B5_EFFECT_WRITE_SOURCE, C5B3_ACTION_WRITE_SOURCE, -1, 5, 262296, 0);
    }
    if ((controller_actions & C5B3_ACTION_WRITE_INPUT) != 0) {
        APPEND(C5B5_EFFECT_WRITE_INPUT, C5B3_ACTION_WRITE_INPUT, -1, 6, 262296, 0);
    }
    if ((controller_actions & C5B3_ACTION_CLOSE_INPUT_WRITERS) != 0) {
        APPEND(C5B5_EFFECT_CLOSE_INPUT_WRITERS, C5B3_ACTION_CLOSE_INPUT_WRITERS, -1, -1, 5, 6);
    }
    if ((controller_actions & C5B3_ACTION_ALLOW_CHILD) != 0) {
        APPEND(C5B5_EFFECT_ALLOW_CHILD, C5B3_ACTION_ALLOW_CHILD, -1, 3, 'G', 0);
    }
    if ((controller_actions & C5B3_ACTION_REQUEST_TEARDOWN) != 0) {
        APPEND(C5B5_EFFECT_REQUEST_TEARDOWN, C5B3_ACTION_REQUEST_TEARDOWN, -1, -1, 0, 0);
    }
    if ((controller_actions & C5B3_ACTION_PROVE_ABSENCE) != 0) {
        APPEND(C5B5_EFFECT_PROVE_ABSENCE, C5B3_ACTION_PROVE_ABSENCE, -1, -1, 0, 0);
    }
    if ((controller_actions & C5B3_ACTION_REMOVE_FIXED_ROOT) != 0) {
        APPEND(C5B5_EFFECT_REMOVE_FIXED_ROOT, C5B3_ACTION_REMOVE_FIXED_ROOT, -1, -1, 0, 0);
    }
    if ((controller_actions & C5B3_ACTION_REQUEST_DURABLE_COMMIT) != 0) {
        APPEND(C5B5_EFFECT_REQUEST_DURABLE_COMMIT, C5B3_ACTION_REQUEST_DURABLE_COMMIT, -1, -1, 0, 0);
    }
    if ((controller_actions & C5B3_ACTION_DELIVER_STORED) != 0) {
        APPEND(C5B5_EFFECT_DELIVER_STORED, C5B3_ACTION_DELIVER_STORED, -1, -1, 0, 0);
    }
    if ((controller_actions & C5B3_ACTION_REPLAY_STORED) != 0) {
        APPEND(C5B5_EFFECT_REPLAY_STORED, C5B3_ACTION_REPLAY_STORED, -1, -1, 0, 0);
    }
    if ((controller_actions & C5B3_ACTION_FENCE_STORE) != 0) {
        APPEND(C5B5_EFFECT_FENCE_STORE, C5B3_ACTION_FENCE_STORE, -1, -1, 0, 0);
    }
    if ((controller_actions & C5B3_ACTION_STOP_MISMATCH) != 0) {
        APPEND(C5B5_EFFECT_STOP_MISMATCH, C5B3_ACTION_STOP_MISMATCH, -1, -1, 0, 0);
    }
    return C5B5_OK;
}

#undef APPEND
