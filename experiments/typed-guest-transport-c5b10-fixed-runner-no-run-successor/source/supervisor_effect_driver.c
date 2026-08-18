/*
 * Compile-only C5b10 Supervisor effect driver.
 *
 * The public drive surface accepts only the exact registration identifier.
 * Every effect provider is a distinct link-time Supervisor ABI. No provider is
 * retained in this packet, so this object cannot perform an effect or run.
 */

#include "supervisor_effect_abi.h"

#include <stddef.h>

#define C5B10_SOURCE_FRAME_BYTES UINT32_C(255)
#define C5B10_INPUT_FRAME_BYTES UINT32_C(188)
#define C5B10_COMPLETION_FRAME_BYTES UINT32_C(259)
#define C5B10_SOURCE_MAXIMUM UINT64_C(262296)
#define C5B10_INPUT_MAXIMUM UINT64_C(262296)
#define C5B10_COMPLETION_RETENTION UINT64_C(262369)

#define C5B10_FACT_ENDPOINTS_DISTINCT (UINT64_C(1) << 0)
#define C5B10_FACT_RUNNER_SPAWNED (UINT64_C(1) << 1)
#define C5B10_FACT_READY_EXACT (UINT64_C(1) << 2)
#define C5B10_FACT_SOURCE_COMPLETE (UINT64_C(1) << 3)
#define C5B10_FACT_INPUT_COMPLETE (UINT64_C(1) << 4)
#define C5B10_FACT_WRITERS_CLOSED (UINT64_C(1) << 5)
#define C5B10_FACT_START_EXACT (UINT64_C(1) << 6)
#define C5B10_FACT_COMPLETION_EXACT (UINT64_C(1) << 7)
#define C5B10_FACT_TRAILER_LAST (UINT64_C(1) << 8)
#define C5B10_FACT_RUNNER_TERMINAL (UINT64_C(1) << 9)
#define C5B10_FACT_CHILD_TREE_ABSENT (UINT64_C(1) << 10)
#define C5B10_FACT_RUNNER_ABSENT (UINT64_C(1) << 11)
#define C5B10_FACT_ROOT_REMOVED (UINT64_C(1) << 12)
#define C5B10_FACT_DURABLE_RECORD (UINT64_C(1) << 13)
#define C5B10_FACT_DELIVERED_STORED (UINT64_C(1) << 14)

static const uint8_t c5b10_registration_id[16] = {
    0x52, 0x73, 0x18, 0x65, 0x61, 0x77, 0x8e, 0xe1,
    0xbb, 0x8d, 0x78, 0xc7, 0x91, 0x13, 0x21, 0xce,
};
static const uint8_t c5b10_attempt_id[16] = {
    0xc5, 0xab, 0x61, 0xf6, 0x0d, 0x5d, 0xdc, 0x4c,
    0x00, 0xa1, 0xbf, 0x50, 0xa8, 0x66, 0x93, 0x44,
};
static const uint8_t c5b10_plan_sha256[32] = {
    0xa4, 0x0c, 0x0d, 0x0e, 0xa7, 0x7e, 0x60, 0x0b,
    0x33, 0x8a, 0x50, 0xbd, 0x71, 0x99, 0x45, 0x47,
    0xb8, 0x3c, 0x4c, 0x8a, 0xa4, 0xa0, 0xd8, 0xff,
    0xed, 0xd4, 0x7a, 0xe0, 0x86, 0x4e, 0xd3, 0x5e,
};
static const uint8_t c5b10_profile_sha256[32] = {
    0x06, 0x07, 0x9e, 0xea, 0x39, 0xce, 0x9a, 0x2e,
    0x05, 0x47, 0x83, 0x75, 0x55, 0xa6, 0x95, 0x37,
    0x87, 0xd8, 0xc3, 0x2d, 0x61, 0x4f, 0x0e, 0xc7,
    0xb9, 0xb0, 0x7e, 0xf4, 0x08, 0xde, 0x04, 0xcd,
};
static const uint8_t c5b10_source_sha256[32] = {
    0xcc, 0x38, 0xc3, 0x74, 0x62, 0x6b, 0x67, 0xa1,
    0x25, 0x01, 0x23, 0x5a, 0xb8, 0x9d, 0x0d, 0x24,
    0xa5, 0xdc, 0x0c, 0xda, 0xf8, 0xee, 0x8f, 0xa0,
    0xd2, 0x89, 0xce, 0xc9, 0x24, 0x71, 0xa6, 0xbc,
};
static const uint8_t c5b10_input_sha256[32] = {
    0x27, 0x86, 0x0a, 0x50, 0xe6, 0x90, 0x99, 0x76,
    0xd3, 0x0a, 0x06, 0x34, 0x02, 0x68, 0xcc, 0x75,
    0x39, 0x96, 0xdc, 0x93, 0x1d, 0x6f, 0x02, 0x20,
    0x33, 0xdc, 0xbd, 0x58, 0x58, 0x4e, 0x73, 0x6f,
};
static const uint8_t c5b10_completion_sha256[32] = {
    0x2b, 0x55, 0xd8, 0x5a, 0xab, 0xd5, 0x58, 0x37,
    0xf9, 0x5e, 0xf5, 0xda, 0x90, 0x58, 0xde, 0xf0,
    0x19, 0xad, 0xc2, 0xec, 0x6e, 0x3b, 0xc3, 0xbf,
    0x22, 0xc1, 0x33, 0x4a, 0xf2, 0x8a, 0xc8, 0x39,
};

static int equal_bytes(const uint8_t *left, const uint8_t *right, size_t count) {
    uint8_t difference = 0;
    for (size_t index = 0; index < count; index++) {
        difference |= left[index] ^ right[index];
    }
    return difference == 0;
}

static struct c5b10_effect_request request_for(
    uint32_t effect,
    uint32_t sequence,
    uint64_t maximum_bytes,
    uint32_t frame_bytes,
    const uint8_t frame_sha256[32]
) {
    struct c5b10_effect_request request = {0};
    for (size_t index = 0; index < 16; index++) {
        request.registration_id[index] = c5b10_registration_id[index];
        request.attempt_id[index] = c5b10_attempt_id[index];
    }
    for (size_t index = 0; index < 32; index++) {
        request.plan_sha256[index] = c5b10_plan_sha256[index];
        request.profile_sha256[index] = c5b10_profile_sha256[index];
        request.frame_sha256[index] = frame_sha256 == NULL ? 0 : frame_sha256[index];
    }
    request.maximum_bytes = maximum_bytes;
    request.frame_bytes = frame_bytes;
    request.sequence = sequence;
    request.effect = effect;
    return request;
}

static int valid_result(
    const struct c5b10_effect_request *request,
    const struct c5b10_effect_result *result,
    uint64_t exact_facts
) {
    return result->sequence == request->sequence &&
        result->effect == request->effect &&
        result->outcome == C5B10_EFFECT_APPLIED &&
        result->facts == exact_facts &&
        equal_bytes(result->registration_id, request->registration_id, 16) &&
        equal_bytes(result->attempt_id, request->attempt_id, 16) &&
        equal_bytes(result->plan_sha256, request->plan_sha256, 32) &&
        equal_bytes(result->profile_sha256, request->profile_sha256, 32);
}

#define C5B10_CALL(provider, effect_value, sequence_value, maximum_value, bytes_value, digest_value, facts_value) \
    do { \
        struct c5b10_effect_request request = request_for( \
            effect_value, sequence_value, maximum_value, bytes_value, digest_value); \
        struct c5b10_effect_result result = {0}; \
        if (provider(&request, &result) != 0 || !valid_result(&request, &result, facts_value)) { \
            goto fail_closed; \
        } \
    } while (0)

int32_t c5b10_drive_registered_attempt(const uint8_t registration_id[16]) {
    if (registration_id == NULL ||
        !equal_bytes(registration_id, c5b10_registration_id, 16)) {
        return -1;
    }

    C5B10_CALL(c5b10_supervisor_create_fixed_endpoints,
        C5B10_EFFECT_CREATE_FIXED_ENDPOINTS, 1, 0, 0, NULL,
        C5B10_FACT_ENDPOINTS_DISTINCT);
    C5B10_CALL(c5b10_supervisor_spawn_fixed_runner,
        C5B10_EFFECT_SPAWN_FIXED_RUNNER, 2, 0, 0, NULL,
        C5B10_FACT_RUNNER_SPAWNED);
    C5B10_CALL(c5b10_supervisor_verify_ready_byte,
        C5B10_EFFECT_VERIFY_READY_BYTE, 3, 1, 1, NULL,
        C5B10_FACT_READY_EXACT);
    C5B10_CALL(c5b10_supervisor_write_source_frame,
        C5B10_EFFECT_WRITE_SOURCE_FRAME, 4, C5B10_SOURCE_MAXIMUM,
        C5B10_SOURCE_FRAME_BYTES, c5b10_source_sha256,
        C5B10_FACT_SOURCE_COMPLETE);
    C5B10_CALL(c5b10_supervisor_write_input_frame,
        C5B10_EFFECT_WRITE_INPUT_FRAME, 5, C5B10_INPUT_MAXIMUM,
        C5B10_INPUT_FRAME_BYTES, c5b10_input_sha256,
        C5B10_FACT_INPUT_COMPLETE);
    C5B10_CALL(c5b10_supervisor_close_input_writers,
        C5B10_EFFECT_CLOSE_INPUT_WRITERS, 6, 0, 0, NULL,
        C5B10_FACT_WRITERS_CLOSED);
    C5B10_CALL(c5b10_supervisor_send_start_byte,
        C5B10_EFFECT_SEND_START_BYTE, 7, 1, 1, NULL,
        C5B10_FACT_START_EXACT);
    C5B10_CALL(c5b10_supervisor_drain_validate_completion,
        C5B10_EFFECT_DRAIN_VALIDATE_COMPLETION, 8,
        C5B10_COMPLETION_RETENTION, C5B10_COMPLETION_FRAME_BYTES,
        c5b10_completion_sha256,
        C5B10_FACT_COMPLETION_EXACT | C5B10_FACT_TRAILER_LAST);
    C5B10_CALL(c5b10_supervisor_join_terminal_state,
        C5B10_EFFECT_JOIN_TERMINAL_STATE, 9, 0, 0, NULL,
        C5B10_FACT_RUNNER_TERMINAL);
    C5B10_CALL(c5b10_supervisor_prove_authoritative_absence,
        C5B10_EFFECT_PROVE_AUTHORITATIVE_ABSENCE, 10, 0, 0, NULL,
        C5B10_FACT_CHILD_TREE_ABSENT | C5B10_FACT_RUNNER_ABSENT);
    C5B10_CALL(c5b10_supervisor_remove_fixed_root,
        C5B10_EFFECT_REMOVE_FIXED_ROOT, 11, 0, 0, NULL,
        C5B10_FACT_ROOT_REMOVED);
    C5B10_CALL(c5b10_supervisor_commit_durable_completion,
        C5B10_EFFECT_COMMIT_DURABLE_COMPLETION, 12, 0, 0, NULL,
        C5B10_FACT_DURABLE_RECORD);
    C5B10_CALL(c5b10_supervisor_deliver_stored_completion,
        C5B10_EFFECT_DELIVER_STORED_COMPLETION, 13, 0, 0, NULL,
        C5B10_FACT_DELIVERED_STORED);
    return 0;

fail_closed:
    {
        struct c5b10_effect_request request = request_for(
            C5B10_EFFECT_REQUEST_TEARDOWN, 14, 0, 0, NULL);
        struct c5b10_effect_result result = {0};
        (void)c5b10_supervisor_request_teardown(&request, &result);
    }
    return -1;
}
