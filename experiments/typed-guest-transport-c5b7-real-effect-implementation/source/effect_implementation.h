#ifndef CAPSULE_C5B7_EFFECT_IMPLEMENTATION_H
#define CAPSULE_C5B7_EFFECT_IMPLEMENTATION_H

#include <stddef.h>
#include <stdint.h>

#include "../inputs/c5b5/source/effect_adapter.h"

#define C5B7_INPUTS_VERSION UINT32_C(1)

enum c5b7_status {
    C5B7_OK = 0,
    C5B7_REFUSE_INPUTS_ABSENT = 100,
    C5B7_REFUSE_INPUTS_MISMATCH = 101,
    C5B7_REFUSE_ROOT_IDENTITY = 102,
    C5B7_REFUSE_FRAME_ABSENT = 103,
    C5B7_REFUSE_FRAME_CAP = 104,
    C5B7_REFUSE_REQUEST_HANDLER = 105,
    C5B7_REFUSE_REQUEST_ORDER = 106,
    C5B7_REFUSE_UNKNOWN_EFFECT = 107,
    C5B7_REFUSE_WRITE_ERROR = 108,
    C5B7_REFUSE_WRITE_ZERO = 109,
    C5B7_REFUSE_READ_ERROR = 110,
    C5B7_REFUSE_START_BYTE = 111,
    C5B7_REFUSE_START_TRAILING = 112,
    C5B7_REFUSE_CLOSE_ERROR = 113,
    C5B7_REFUSE_KRUN_ERROR = 114,
    C5B7_REFUSE_REQUEST_ERROR = 115,
};

enum c5b7_request {
    C5B7_REQUEST_CREATE_ENDPOINTS = 1,
    C5B7_REQUEST_START_DRAINS = 2,
    C5B7_REQUEST_ALLOW_CHILD = 3,
    C5B7_REQUEST_TEARDOWN = 4,
    C5B7_REQUEST_PROVE_ABSENCE = 5,
    C5B7_REQUEST_REMOVE_FIXED_ROOT = 6,
    C5B7_REQUEST_DURABLE_COMMIT = 7,
    C5B7_REQUEST_DELIVER_STORED = 8,
    C5B7_REQUEST_REPLAY_STORED = 9,
    C5B7_REQUEST_FENCE_STORE = 10,
    C5B7_REQUEST_STOP_MISMATCH = 11,
};

struct c5b7_request_record {
    uint32_t request;
    uint32_t source_effect;
    uint64_t value_a;
    uint64_t value_b;
};

typedef int32_t (*c5b7_request_handler)(
    const struct c5b7_request_record *request,
    void *opaque
);

/*
 * The owner supplies bytes already bound by the controller/store and the
 * descriptor identity observed for the finalized unlinked root. This layer
 * neither opens paths nor decides that those facts are authoritative.
 */
struct c5b7_execution_inputs {
    uint32_t version;
    uint32_t structure_bytes;
    uint64_t root_device;
    uint64_t root_inode;
    uint64_t root_bytes;
    const uint8_t *source_frame;
    uint64_t source_frame_bytes;
    const uint8_t *input_frame;
    uint64_t input_frame_bytes;
    c5b7_request_handler request_handler;
    void *request_opaque;
};

struct c5b7_execution_result {
    uint32_t status;
    uint32_t failed_effect;
    int32_t raw_status;
    uint32_t completed_operations;
    int32_t context_id;
    int32_t console_id;
    uint32_t context_created;
    uint32_t context_free_attempted;
    uint32_t context_freed;
    int32_t context_free_status;
    uint32_t context_consumed;
    uint32_t teardown_requested;
    uint32_t absence_requested;
    uint32_t cleanup_requested;
    uint32_t durable_commit_requested;
    uint32_t stored_delivery_requested;
    uint32_t execution_authorized;
};

int32_t c5b7_validate_execution_inputs(
    const struct c5b5_immutable_profile *profile,
    const struct c5b7_execution_inputs *inputs
);

int32_t c5b7_execute_controller_actions(
    const struct c5b5_immutable_profile *profile,
    uint64_t controller_actions,
    const struct c5b7_execution_inputs *inputs,
    struct c5b7_execution_result *result
);

#endif
