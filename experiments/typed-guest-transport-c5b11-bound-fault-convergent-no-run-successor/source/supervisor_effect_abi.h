#ifndef CAPSULE_C5B11_SUPERVISOR_EFFECT_ABI_H
#define CAPSULE_C5B11_SUPERVISOR_EFFECT_ABI_H

#include <stdint.h>

enum c5b11_effect {
    C5B11_EFFECT_CREATE_FIXED_ENDPOINTS = 1,
    C5B11_EFFECT_SPAWN_FIXED_RUNNER = 2,
    C5B11_EFFECT_VERIFY_READY_BYTE = 3,
    C5B11_EFFECT_WRITE_SOURCE_FRAME = 4,
    C5B11_EFFECT_WRITE_INPUT_FRAME = 5,
    C5B11_EFFECT_CLOSE_INPUT_WRITERS = 6,
    C5B11_EFFECT_SEND_START_BYTE = 7,
    C5B11_EFFECT_DRAIN_VALIDATE_COMPLETION = 8,
    C5B11_EFFECT_JOIN_TERMINAL_STATE = 9,
    C5B11_EFFECT_PROVE_AUTHORITATIVE_ABSENCE = 10,
    C5B11_EFFECT_REMOVE_FIXED_ROOT = 11,
    C5B11_EFFECT_COMMIT_DURABLE_COMPLETION = 12,
    C5B11_EFFECT_DELIVER_STORED_COMPLETION = 13,
    C5B11_EFFECT_FENCE_ATTEMPT = 14,
    C5B11_EFFECT_LOOKUP_FENCED_ATTEMPT = 15,
    C5B11_EFFECT_REQUEST_TEARDOWN = 16,
    C5B11_EFFECT_RECONCILE_TEARDOWN_OUTCOME = 17,
    C5B11_EFFECT_RECONCILE_TERMINAL_STATE = 18,
    C5B11_EFFECT_RECONCILE_AUTHORITATIVE_ABSENCE = 19,
    C5B11_EFFECT_RECONCILE_FIXED_ROOT_REMOVAL = 20,
    C5B11_EFFECT_RECORD_UNRESOLVED_CLEANUP = 21,
    C5B11_EFFECT_REOPEN_STORED_COMPLETION = 22,
    C5B11_EFFECT_REPLAY_STORED_COMPLETION = 23,
};

enum c5b11_effect_outcome {
    C5B11_EFFECT_APPLIED = 1,
    C5B11_EFFECT_NOT_APPLIED = 2,
    C5B11_EFFECT_INDETERMINATE = 3,
};

struct c5b11_effect_request {
    uint8_t registration_id[16];
    uint8_t attempt_id[16];
    uint8_t plan_sha256[32];
    uint8_t profile_sha256[32];
    uint8_t frame_sha256[32];
    uint64_t maximum_bytes;
    uint32_t frame_bytes;
    uint32_t sequence;
    uint32_t effect;
    uint32_t failed_sequence;
    uint32_t observed_outcome;
};

struct c5b11_effect_result {
    uint8_t registration_id[16];
    uint8_t attempt_id[16];
    uint8_t plan_sha256[32];
    uint8_t profile_sha256[32];
    uint8_t frame_sha256[32];
    uint64_t facts;
    uint32_t sequence;
    uint32_t effect;
    uint32_t outcome;
};

#define C5B11_PROVIDER(name) int32_t name( \
    const struct c5b11_effect_request *, struct c5b11_effect_result *)

C5B11_PROVIDER(c5b11_supervisor_create_fixed_endpoints);
C5B11_PROVIDER(c5b11_supervisor_spawn_fixed_runner);
C5B11_PROVIDER(c5b11_supervisor_verify_ready_byte);
C5B11_PROVIDER(c5b11_supervisor_write_source_frame);
C5B11_PROVIDER(c5b11_supervisor_write_input_frame);
C5B11_PROVIDER(c5b11_supervisor_close_input_writers);
C5B11_PROVIDER(c5b11_supervisor_send_start_byte);
C5B11_PROVIDER(c5b11_supervisor_drain_validate_completion);
C5B11_PROVIDER(c5b11_supervisor_join_terminal_state);
C5B11_PROVIDER(c5b11_supervisor_prove_authoritative_absence);
C5B11_PROVIDER(c5b11_supervisor_remove_fixed_root);
C5B11_PROVIDER(c5b11_supervisor_commit_durable_completion);
C5B11_PROVIDER(c5b11_supervisor_deliver_stored_completion);
C5B11_PROVIDER(c5b11_supervisor_fence_attempt);
C5B11_PROVIDER(c5b11_supervisor_lookup_fenced_attempt);
C5B11_PROVIDER(c5b11_supervisor_request_teardown);
C5B11_PROVIDER(c5b11_supervisor_reconcile_teardown_outcome);
C5B11_PROVIDER(c5b11_supervisor_reconcile_terminal_state);
C5B11_PROVIDER(c5b11_supervisor_reconcile_authoritative_absence);
C5B11_PROVIDER(c5b11_supervisor_reconcile_fixed_root_removal);
C5B11_PROVIDER(c5b11_supervisor_record_unresolved_cleanup);
C5B11_PROVIDER(c5b11_supervisor_reopen_stored_completion);
C5B11_PROVIDER(c5b11_supervisor_replay_stored_completion);

#undef C5B11_PROVIDER

int32_t c5b11_drive_registered_attempt(const uint8_t registration_id[16]);

#endif
