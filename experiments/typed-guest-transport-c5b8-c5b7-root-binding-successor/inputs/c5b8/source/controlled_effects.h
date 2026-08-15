#ifndef CAPSULE_C5B8_CONTROLLED_EFFECTS_H
#define CAPSULE_C5B8_CONTROLLED_EFFECTS_H

#include <stdint.h>

#include "../inputs/c5b3/controller_core.h"
#include "../inputs/c5b5/source/effect_adapter.h"

#define C5B8_DESCRIPTOR_MAGIC UINT32_C(0x43354238)
#define C5B8_DESCRIPTOR_VERSION UINT32_C(1)

enum c5b8_status {
    C5B8_OK = 0,
    C5B8_REFUSE_ARGUMENT = 100,
    C5B8_REFUSE_DESCRIPTOR_ABI = 101,
    C5B8_REFUSE_PROFILE = 102,
    C5B8_REFUSE_BINDING = 103,
    C5B8_REFUSE_ROOT_IDENTITY = 104,
    C5B8_REFUSE_FRAME = 105,
    C5B8_REFUSE_SESSION = 106,
    C5B8_REFUSE_ADAPTER = 107,
    C5B8_REFUSE_OPERATION_PROTOCOL = 108,
    C5B8_REFUSE_OPERATION_NOT_APPLIED = 109,
    C5B8_FENCE_OPERATION_INDETERMINATE = 110,
    C5B8_REFUSE_CONTROLLER_ORDER = 111,
    C5B8_REFUSE_COMPLETION_ORDER = 112,
    C5B8_REFUSE_CLEANUP_UNRESOLVED = 113,
};

/*
 * This descriptor is owned and registered by the Supervisor. The effect layer
 * copies it once. It contains no path, flag, image, mount, endpoint, backend
 * configuration, replacement plan bytes, operation callback, or opaque owner.
 */
struct c5b8_supervisor_descriptor {
    uint32_t magic;
    uint32_t version;
    uint32_t structure_bytes;
    uint32_t reserved;
    uint8_t attempt_id[16];
    uint8_t registration_id[16];
    uint8_t registered_plan_sha256[32];
    uint8_t profile_binding_sha256[32];
    uint64_t root_device;
    uint64_t root_inode;
    uint64_t root_bytes;
    const uint8_t *source_frame;
    uint64_t source_frame_bytes;
    const uint8_t *input_frame;
    uint64_t input_frame_bytes;
};

/* Incomplete type: session storage and controller authority remain layer-owned. */
struct c5b8_session;

struct c5b8_step_result {
    uint32_t status;
    uint32_t controller_state;
    uint32_t disposition;
    uint32_t completed_operations;
    uint64_t controller_actions;
    uint64_t last_sequence;
    uint32_t failed_effect;
    uint32_t teardown_requested;
    uint32_t absence_proven;
    uint32_t root_removed;
    uint32_t durable_commit_requested;
    uint32_t delivery_performed;
    uint32_t cleanup_unresolved;
    uint32_t fenced;
};

int32_t c5b8_initialize(
    const struct c5b5_immutable_profile *profile,
    const struct c5b8_supervisor_descriptor *descriptor,
    struct c5b8_session **session_out
);

int32_t c5b8_apply_observation(
    struct c5b8_session *session,
    uint32_t requested_event,
    struct c5b8_step_result *result
);

#endif
