#ifndef CAPSULE_C5B10_SUPERVISOR_EFFECT_ABI_H
#define CAPSULE_C5B10_SUPERVISOR_EFFECT_ABI_H

#include <stdint.h>

enum c5b10_effect {
    C5B10_EFFECT_CREATE_FIXED_ENDPOINTS = 1,
    C5B10_EFFECT_SPAWN_FIXED_RUNNER = 2,
    C5B10_EFFECT_VERIFY_READY_BYTE = 3,
    C5B10_EFFECT_WRITE_SOURCE_FRAME = 4,
    C5B10_EFFECT_WRITE_INPUT_FRAME = 5,
    C5B10_EFFECT_CLOSE_INPUT_WRITERS = 6,
    C5B10_EFFECT_SEND_START_BYTE = 7,
    C5B10_EFFECT_DRAIN_VALIDATE_COMPLETION = 8,
    C5B10_EFFECT_JOIN_TERMINAL_STATE = 9,
    C5B10_EFFECT_PROVE_AUTHORITATIVE_ABSENCE = 10,
    C5B10_EFFECT_REMOVE_FIXED_ROOT = 11,
    C5B10_EFFECT_COMMIT_DURABLE_COMPLETION = 12,
    C5B10_EFFECT_DELIVER_STORED_COMPLETION = 13,
    C5B10_EFFECT_REQUEST_TEARDOWN = 14,
};

enum c5b10_effect_outcome {
    C5B10_EFFECT_APPLIED = 1,
    C5B10_EFFECT_NOT_APPLIED = 2,
    C5B10_EFFECT_INDETERMINATE = 3,
};

struct c5b10_effect_request {
    uint8_t registration_id[16];
    uint8_t attempt_id[16];
    uint8_t plan_sha256[32];
    uint8_t profile_sha256[32];
    uint8_t frame_sha256[32];
    uint64_t maximum_bytes;
    uint32_t frame_bytes;
    uint32_t sequence;
    uint32_t effect;
};

struct c5b10_effect_result {
    uint8_t registration_id[16];
    uint8_t attempt_id[16];
    uint8_t plan_sha256[32];
    uint8_t profile_sha256[32];
    uint64_t facts;
    uint32_t sequence;
    uint32_t effect;
    uint32_t outcome;
};

int32_t c5b10_supervisor_create_fixed_endpoints(
    const struct c5b10_effect_request *, struct c5b10_effect_result *);
int32_t c5b10_supervisor_spawn_fixed_runner(
    const struct c5b10_effect_request *, struct c5b10_effect_result *);
int32_t c5b10_supervisor_verify_ready_byte(
    const struct c5b10_effect_request *, struct c5b10_effect_result *);
int32_t c5b10_supervisor_write_source_frame(
    const struct c5b10_effect_request *, struct c5b10_effect_result *);
int32_t c5b10_supervisor_write_input_frame(
    const struct c5b10_effect_request *, struct c5b10_effect_result *);
int32_t c5b10_supervisor_close_input_writers(
    const struct c5b10_effect_request *, struct c5b10_effect_result *);
int32_t c5b10_supervisor_send_start_byte(
    const struct c5b10_effect_request *, struct c5b10_effect_result *);
int32_t c5b10_supervisor_drain_validate_completion(
    const struct c5b10_effect_request *, struct c5b10_effect_result *);
int32_t c5b10_supervisor_join_terminal_state(
    const struct c5b10_effect_request *, struct c5b10_effect_result *);
int32_t c5b10_supervisor_prove_authoritative_absence(
    const struct c5b10_effect_request *, struct c5b10_effect_result *);
int32_t c5b10_supervisor_remove_fixed_root(
    const struct c5b10_effect_request *, struct c5b10_effect_result *);
int32_t c5b10_supervisor_commit_durable_completion(
    const struct c5b10_effect_request *, struct c5b10_effect_result *);
int32_t c5b10_supervisor_deliver_stored_completion(
    const struct c5b10_effect_request *, struct c5b10_effect_result *);
int32_t c5b10_supervisor_request_teardown(
    const struct c5b10_effect_request *, struct c5b10_effect_result *);

int32_t c5b10_drive_registered_attempt(const uint8_t registration_id[16]);

#endif
