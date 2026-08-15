#ifndef CAPSULE_C5B8_CONTROLLED_EFFECTS_INTERNAL_H
#define CAPSULE_C5B8_CONTROLLED_EFFECTS_INTERNAL_H

#include "controlled_effects.h"

#define C5B8_OPERATION_MAGIC UINT32_C(0x4f503842)
#define C5B8_OPERATION_VERSION UINT32_C(1)
#define C5B8_EFFECT_OBSERVE_EVENT UINT32_C(0x80000001)
#define C5B8_EFFECT_ENROLL_DESCRIPTOR UINT32_C(0x80000002)

enum c5b8_operation_outcome {
    C5B8_OPERATION_APPLIED = 1,
    C5B8_OPERATION_NOT_APPLIED = 2,
    C5B8_OPERATION_INDETERMINATE = 3,
};

enum c5b8_resource_state {
    C5B8_RESOURCE_ENDPOINTS = UINT64_C(1) << 0,
    C5B8_RESOURCE_DRAINS = UINT64_C(1) << 1,
    C5B8_RESOURCE_CONTEXT_LIVE = UINT64_C(1) << 2,
    C5B8_RESOURCE_CONTEXT_CONSUMED = UINT64_C(1) << 3,
    C5B8_RESOURCE_SOURCE_CLOSED = UINT64_C(1) << 4,
    C5B8_RESOURCE_INPUT_CLOSED = UINT64_C(1) << 5,
    C5B8_RESOURCE_CHILD_ALLOWED = UINT64_C(1) << 6,
    C5B8_RESOURCE_TEARDOWN_REQUESTED = UINT64_C(1) << 7,
    C5B8_RESOURCE_ABSENCE_PROVEN = UINT64_C(1) << 8,
    C5B8_RESOURCE_ROOT_REMOVED = UINT64_C(1) << 9,
    C5B8_RESOURCE_DURABLE_REQUESTED = UINT64_C(1) << 10,
    C5B8_RESOURCE_DELIVERED = UINT64_C(1) << 11,
    C5B8_RESOURCE_REPLAYED = UINT64_C(1) << 12,
    C5B8_RESOURCE_STORE_FENCED = UINT64_C(1) << 13,
    C5B8_RESOURCE_STOPPED = UINT64_C(1) << 14,
    C5B8_RESOURCE_CONTEXT_RELEASED = UINT64_C(1) << 15,
    C5B8_RESOURCE_DESCRIPTOR_ENROLLED = UINT64_C(1) << 16,
};

struct c5b8_operation_request {
    uint32_t magic;
    uint32_t version;
    uint32_t structure_bytes;
    uint32_t controller_state;
    uint8_t attempt_id[16];
    uint8_t registration_id[16];
    uint8_t registered_plan_sha256[32];
    uint8_t profile_binding_sha256[32];
    uint64_t sequence;
    uint32_t requested_event;
    uint32_t reserved;
    uint64_t expected_resource_state;
    struct c5b5_operation operation;
    uint64_t root_device;
    uint64_t root_inode;
    uint64_t root_bytes;
    const uint8_t *source_frame;
    uint64_t source_frame_length;
    const uint8_t *input_frame;
    uint64_t input_frame_length;
};

struct c5b8_operation_result {
    uint32_t magic;
    uint32_t version;
    uint32_t structure_bytes;
    uint32_t outcome;
    uint8_t attempt_id[16];
    uint8_t registration_id[16];
    uint8_t registered_plan_sha256[32];
    uint8_t profile_binding_sha256[32];
    uint64_t sequence;
    uint32_t effect;
    uint32_t observed_event;
    uint64_t observed_facts;
    uint64_t resource_state;
};

/* Fixed composition symbol. No caller supplies a function or opaque value. */
int32_t c5b8_controlled_test_operation(
    const struct c5b8_operation_request *request,
    struct c5b8_operation_result *result
);

#endif
