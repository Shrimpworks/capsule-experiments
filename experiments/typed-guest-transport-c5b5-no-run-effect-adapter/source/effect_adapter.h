#ifndef CAPSULE_C5B5_EFFECT_ADAPTER_H
#define CAPSULE_C5B5_EFFECT_ADAPTER_H

#include <stddef.h>
#include <stdint.h>

#include "../inputs/c5b3/controller_core.h"

/*
 * Compile-only C5b adapter contract. It validates immutable prerequisites and
 * translates controller action bits into a closed, ordered description. It
 * never invokes an operation, loads a library, starts a process, or accepts
 * paths or caller-selected runtime configuration.
 */

#define C5B5_PROFILE_MAGIC UINT32_C(0x43354235)
#define C5B5_PROFILE_VERSION UINT32_C(1)
#define C5B5_PLAN_CAPACITY UINT32_C(32)

enum c5b5_effect {
    C5B5_EFFECT_CREATE_ENDPOINTS = 1,
    C5B5_EFFECT_START_DRAINS = 2,
    C5B5_EFFECT_KRUN_CREATE_CTX = 3,
    C5B5_EFFECT_KRUN_SET_VM_CONFIG = 4,
    C5B5_EFFECT_KRUN_DISABLE_IMPLICIT_CONSOLE = 5,
    C5B5_EFFECT_KRUN_DISABLE_IMPLICIT_INIT = 6,
    C5B5_EFFECT_KRUN_DISABLE_IMPLICIT_VSOCK = 7,
    C5B5_EFFECT_KRUN_ADD_READ_ONLY_RAW_ROOT_FD = 8,
    C5B5_EFFECT_KRUN_SET_ROOT_DISK_REMOUNT = 9,
    C5B5_EFFECT_KRUN_ADD_VIRTIO_CONSOLE_MULTIPORT = 10,
    C5B5_EFFECT_KRUN_ADD_SOURCE_PORT = 11,
    C5B5_EFFECT_KRUN_ADD_INPUT_PORT = 12,
    C5B5_EFFECT_KRUN_ADD_COMPLETION_PORT = 13,
    C5B5_EFFECT_KRUN_SET_KERNEL_CONSOLE = 14,
    C5B5_EFFECT_KRUN_SET_WORKDIR = 15,
    C5B5_EFFECT_KRUN_SET_EXEC = 16,
    C5B5_EFFECT_WRITE_READY = 17,
    C5B5_EFFECT_REQUIRE_START_BYTE = 18,
    C5B5_EFFECT_KRUN_START_ENTER = 19,
    C5B5_EFFECT_WRITE_SOURCE = 20,
    C5B5_EFFECT_WRITE_INPUT = 21,
    C5B5_EFFECT_CLOSE_INPUT_WRITERS = 22,
    C5B5_EFFECT_ALLOW_CHILD = 23,
    C5B5_EFFECT_REQUEST_TEARDOWN = 24,
    C5B5_EFFECT_PROVE_ABSENCE = 25,
    C5B5_EFFECT_REMOVE_FIXED_ROOT = 26,
    C5B5_EFFECT_REQUEST_DURABLE_COMMIT = 27,
    C5B5_EFFECT_DELIVER_STORED = 28,
    C5B5_EFFECT_REPLAY_STORED = 29,
    C5B5_EFFECT_FENCE_STORE = 30,
    C5B5_EFFECT_STOP_MISMATCH = 31,
};

enum c5b5_refusal {
    C5B5_OK = 0,
    C5B5_REFUSE_PROFILE_ABSENT = 1,
    C5B5_REFUSE_PROFILE_MISMATCH = 2,
    C5B5_REFUSE_ACTION_UNKNOWN = 3,
    C5B5_REFUSE_PLAN_CAPACITY = 4,
    C5B5_REFUSE_OUTPUT_ABSENT = 5,
};

struct c5b5_immutable_profile {
    uint32_t magic;
    uint32_t version;
    uint32_t structure_bytes;
    uint32_t host_root_fd;
    uint32_t source_fd;
    uint32_t input_fd;
    uint32_t completion_fd;
    uint32_t vcpus;
    uint32_t ram_mib;
    uint64_t root_bytes;
    uint64_t source_physical_maximum;
    uint64_t input_physical_maximum;
    uint64_t completion_physical_maximum;
    uint64_t completion_retention_bytes;
    uint8_t controller_contract_sha256[32];
    uint8_t controller_header_sha256[32];
    uint8_t libkrun_header_sha256[32];
    uint8_t libkrun_dylib_sha256[32];
    uint8_t libkrunfw_dylib_sha256[32];
};

struct c5b5_operation {
    uint32_t effect;
    uint32_t controller_action;
    int32_t input_fd;
    int32_t output_fd;
    uint64_t value_a;
    uint64_t value_b;
};

struct c5b5_plan {
    uint32_t count;
    uint32_t execution_authorized;
    struct c5b5_operation operations[C5B5_PLAN_CAPACITY];
};

int32_t c5b5_validate_immutable_profile(
    const struct c5b5_immutable_profile *profile
);

int32_t c5b5_translate_controller_actions(
    const struct c5b5_immutable_profile *profile,
    uint64_t controller_actions,
    struct c5b5_plan *plan
);

#endif
