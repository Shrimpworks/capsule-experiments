/*
 * Compile-only C5b11 Supervisor effect driver.
 *
 * The public surface accepts only the fixed RegistrationID. Providers are
 * absent, so this object cannot perform an effect. Each request and echo binds
 * the C5b11 attempt plan and runtime profile from attempt_bindings.h. Recovery
 * is a one-pass reconciliation state machine: it never redrives a failed
 * non-idempotent effect.
 */

#include "supervisor_effect_abi.h"
#include "attempt_bindings.h"

#include <stddef.h>

#define C5B11_SOURCE_FRAME_BYTES UINT32_C(255)
#define C5B11_INPUT_FRAME_BYTES UINT32_C(188)
#define C5B11_COMPLETION_FRAME_BYTES UINT32_C(259)
#define C5B11_SOURCE_MAXIMUM UINT64_C(262296)
#define C5B11_INPUT_MAXIMUM UINT64_C(262296)
#define C5B11_COMPLETION_RETENTION UINT64_C(262369)

#define C5B11_FACT_ENDPOINTS_DISTINCT (UINT64_C(1) << 0)
#define C5B11_FACT_RUNNER_SPAWNED (UINT64_C(1) << 1)
#define C5B11_FACT_READY_EXACT (UINT64_C(1) << 2)
#define C5B11_FACT_SOURCE_COMPLETE (UINT64_C(1) << 3)
#define C5B11_FACT_INPUT_COMPLETE (UINT64_C(1) << 4)
#define C5B11_FACT_WRITERS_CLOSED (UINT64_C(1) << 5)
#define C5B11_FACT_START_EXACT (UINT64_C(1) << 6)
#define C5B11_FACT_COMPLETION_EXACT (UINT64_C(1) << 7)
#define C5B11_FACT_TRAILER_LAST (UINT64_C(1) << 8)
#define C5B11_FACT_RUNNER_TERMINAL (UINT64_C(1) << 9)
#define C5B11_FACT_AUTHORITATIVE_ABSENCE (UINT64_C(1) << 10)
#define C5B11_FACT_ROOT_REMOVED (UINT64_C(1) << 11)
#define C5B11_FACT_DURABLE_RECORD (UINT64_C(1) << 12)
#define C5B11_FACT_DELIVERED_STORED (UINT64_C(1) << 13)
#define C5B11_FACT_ATTEMPT_FENCED (UINT64_C(1) << 14)
#define C5B11_FACT_ATTEMPT_REOPENED (UINT64_C(1) << 15)
#define C5B11_FACT_TEARDOWN_RECONCILED (UINT64_C(1) << 16)
#define C5B11_FACT_UNRESOLVED_DURABLE (UINT64_C(1) << 17)
#define C5B11_FACT_STORE_REOPENED (UINT64_C(1) << 18)
#define C5B11_FACT_REPLAY_EXACT (UINT64_C(1) << 19)
#define C5B11_FACT_ATTEMPT_FRESH (UINT64_C(1) << 20)

enum c5b11_process_state {
    C5B11_PROCESS_NONE = 0,
    C5B11_PROCESS_MAY_EXIST = 1,
    C5B11_PROCESS_CONFIRMED = 2,
};

static const uint8_t c5b11_registration_id[16] = {
    0x52, 0x73, 0x18, 0x65, 0x61, 0x77, 0x8e, 0xe1,
    0xbb, 0x8d, 0x78, 0xc7, 0x91, 0x13, 0x21, 0xce,
};
static const uint8_t c5b11_attempt_id[16] = {
    0xc5, 0xab, 0x61, 0xf6, 0x0d, 0x5d, 0xdc, 0x4c,
    0x00, 0xa1, 0xbf, 0x50, 0xa8, 0x66, 0x93, 0x44,
};

static int equal_bytes(const uint8_t *left, const uint8_t *right, size_t count) {
    uint8_t difference = 0;
    for (size_t index = 0; index < count; index++) difference |= left[index] ^ right[index];
    return difference == 0;
}

static struct c5b11_effect_request request_for(
    uint32_t effect,
    uint32_t sequence,
    uint32_t failed_sequence,
    uint32_t observed_outcome,
    uint64_t maximum_bytes,
    uint32_t frame_bytes,
    const uint8_t frame_sha256[32]
) {
    struct c5b11_effect_request request = {0};
    for (size_t index = 0; index < 16; index++) {
        request.registration_id[index] = c5b11_registration_id[index];
        request.attempt_id[index] = c5b11_attempt_id[index];
    }
    for (size_t index = 0; index < 32; index++) {
        request.plan_sha256[index] = c5b11_plan_sha256[index];
        request.profile_sha256[index] = c5b11_profile_sha256[index];
        request.frame_sha256[index] = frame_sha256 == NULL ? 0 : frame_sha256[index];
    }
    request.maximum_bytes = maximum_bytes;
    request.frame_bytes = frame_bytes;
    request.sequence = sequence;
    request.effect = effect;
    request.failed_sequence = failed_sequence;
    request.observed_outcome = observed_outcome;
    request.recovery_step = 0;
    request.durable_resume_step = 0;
    return request;
}

static int valid_echo(
    const struct c5b11_effect_request *request,
    const struct c5b11_effect_result *result
) {
    return result->sequence == request->sequence &&
        result->effect == request->effect &&
        equal_bytes(result->registration_id, request->registration_id, 16) &&
        equal_bytes(result->attempt_id, request->attempt_id, 16) &&
        equal_bytes(result->plan_sha256, request->plan_sha256, 32) &&
        equal_bytes(result->profile_sha256, request->profile_sha256, 32) &&
        equal_bytes(result->frame_sha256, request->frame_sha256, 32);
}

static int valid_applied(
    const struct c5b11_effect_request *request,
    const struct c5b11_effect_result *result,
    uint64_t exact_facts
) {
    return valid_echo(request, result) &&
        result->outcome == C5B11_EFFECT_APPLIED &&
        result->facts == exact_facts &&
        result->failed_sequence == request->failed_sequence &&
        result->recovery_step == request->recovery_step &&
        result->durable_resume_step == request->durable_resume_step;
}

static int valid_created_recovery_step(uint32_t recovery_step) {
    return recovery_step >= 14 && recovery_step <= 20;
}

static int valid_completion_recovery_step(uint32_t recovery_step) {
    return recovery_step == 14 || recovery_step == 15 ||
        recovery_step == 22 || recovery_step == 23;
}

static int durable_unresolved(
    uint32_t failed_sequence,
    uint32_t observed_outcome,
    uint32_t recovery_step
) {
    struct c5b11_effect_request request = request_for(
        C5B11_EFFECT_RECORD_UNRESOLVED_CLEANUP, 21, failed_sequence,
        observed_outcome, 0, 0, NULL);
    request.recovery_step = recovery_step;
    request.durable_resume_step = recovery_step;
    struct c5b11_effect_result result = {0};
    if (c5b11_supervisor_record_unresolved_cleanup(&request, &result) != 0 ||
        !valid_applied(&request, &result, C5B11_FACT_UNRESOLVED_DURABLE)) return -3;
    return -2;
}

#define C5B11_RECOVERY_APPLIED(provider, effect_value, sequence_value, facts_value, frame_value) \
    do { \
        struct c5b11_effect_request recovery_request = request_for( \
            effect_value, sequence_value, failed_sequence, observed_outcome, 0, 0, frame_value); \
        recovery_request.recovery_step = sequence_value; \
        recovery_request.durable_resume_step = sequence_value; \
        struct c5b11_effect_result recovery_result = {0}; \
        if (provider(&recovery_request, &recovery_result) != 0 || \
            !valid_applied(&recovery_request, &recovery_result, facts_value)) \
            return durable_unresolved(failed_sequence, C5B11_EFFECT_INDETERMINATE, sequence_value); \
    } while (0)

static int reconcile_created_attempt(
    uint32_t failed_sequence,
    uint32_t observed_outcome,
    uint32_t recovery_step
) {
    if (recovery_step <= 14) {
        C5B11_RECOVERY_APPLIED(c5b11_supervisor_fence_attempt,
            C5B11_EFFECT_FENCE_ATTEMPT, 14, C5B11_FACT_ATTEMPT_FENCED, NULL);
    }
    if (recovery_step <= 15) {
        C5B11_RECOVERY_APPLIED(c5b11_supervisor_lookup_fenced_attempt,
            C5B11_EFFECT_LOOKUP_FENCED_ATTEMPT, 15, C5B11_FACT_ATTEMPT_REOPENED, NULL);
    }

    /* Request teardown exactly once. The closed provider contract requires the
     * durable resume cursor (17) to be recorded before the side effect. Its
     * response is evidence, never authority to redrive: APPLIED, NOT_APPLIED,
     * errors, and INDETERMINATE all resume at the reconciliation lookup. */
    if (recovery_step <= 16) {
        struct c5b11_effect_request request = request_for(
            C5B11_EFFECT_REQUEST_TEARDOWN, 16, failed_sequence,
            observed_outcome, 0, 0, NULL);
        request.recovery_step = 16;
        request.durable_resume_step = 17;
        struct c5b11_effect_result ignored = {0};
        (void)c5b11_supervisor_request_teardown(&request, &ignored);
    }
    if (recovery_step <= 17) {
        C5B11_RECOVERY_APPLIED(c5b11_supervisor_reconcile_teardown_outcome,
            C5B11_EFFECT_RECONCILE_TEARDOWN_OUTCOME, 17,
            C5B11_FACT_TEARDOWN_RECONCILED, NULL);
    }
    if (recovery_step <= 18) {
        C5B11_RECOVERY_APPLIED(c5b11_supervisor_reconcile_terminal_state,
            C5B11_EFFECT_RECONCILE_TERMINAL_STATE, 18,
            C5B11_FACT_RUNNER_TERMINAL, NULL);
    }
    if (recovery_step <= 19) {
        C5B11_RECOVERY_APPLIED(c5b11_supervisor_reconcile_authoritative_absence,
            C5B11_EFFECT_RECONCILE_AUTHORITATIVE_ABSENCE, 19,
            C5B11_FACT_AUTHORITATIVE_ABSENCE, NULL);
    }
    if (recovery_step <= 20) {
        C5B11_RECOVERY_APPLIED(c5b11_supervisor_reconcile_fixed_root_removal,
            C5B11_EFFECT_RECONCILE_FIXED_ROOT_REMOVAL, 20,
            C5B11_FACT_ROOT_REMOVED, NULL);
    }
    return -1;
}

static int reconcile_completion_response_loss(
    uint32_t failed_sequence,
    uint32_t observed_outcome,
    uint32_t recovery_step
) {
    if (recovery_step <= 14) {
        C5B11_RECOVERY_APPLIED(c5b11_supervisor_fence_attempt,
            C5B11_EFFECT_FENCE_ATTEMPT, 14, C5B11_FACT_ATTEMPT_FENCED, NULL);
    }
    if (recovery_step <= 15) {
        C5B11_RECOVERY_APPLIED(c5b11_supervisor_lookup_fenced_attempt,
            C5B11_EFFECT_LOOKUP_FENCED_ATTEMPT, 15, C5B11_FACT_ATTEMPT_REOPENED, NULL);
    }
    if (recovery_step <= 22) {
        C5B11_RECOVERY_APPLIED(c5b11_supervisor_reopen_stored_completion,
            C5B11_EFFECT_REOPEN_STORED_COMPLETION, 22,
            C5B11_FACT_STORE_REOPENED | C5B11_FACT_DURABLE_RECORD,
            c5b11_completion_frame_sha256);
    }
    if (recovery_step <= 23) {
        C5B11_RECOVERY_APPLIED(c5b11_supervisor_replay_stored_completion,
            C5B11_EFFECT_REPLAY_STORED_COMPLETION, 23,
            C5B11_FACT_REPLAY_EXACT | C5B11_FACT_DURABLE_RECORD,
            c5b11_completion_frame_sha256);
    }
    return 0;
}

#define C5B11_NOMINAL(provider, effect_value, sequence_value, maximum_value, bytes_value, digest_value, facts_value) \
    do { \
        struct c5b11_effect_request request = request_for( \
            effect_value, sequence_value, 0, 0, maximum_value, bytes_value, digest_value); \
        struct c5b11_effect_result result = {0}; \
        int provider_status = provider(&request, &result); \
        if (provider_status != 0 || !valid_applied(&request, &result, facts_value)) { \
            failed_sequence = sequence_value; \
            observed_outcome = provider_status != 0 ? C5B11_EFFECT_INDETERMINATE : result.outcome; \
            goto fail_nominal; \
        } \
    } while (0)

int32_t c5b11_drive_registered_attempt(const uint8_t registration_id[16]) {
    uint32_t failed_sequence = 0;
    uint32_t observed_outcome = 0;
    enum c5b11_process_state process_state = C5B11_PROCESS_NONE;
    if (registration_id == NULL || !equal_bytes(registration_id, c5b11_registration_id, 16)) return -1;

    /* A repeated registration-only call must reopen durable state before any
     * nominal effect. Only a bound fresh-state proof may enter nominal work.
     * Every missing, errored, or mismatched lookup is treated as if a process
     * may already exist. */
    {
        struct c5b11_effect_request request = request_for(
            C5B11_EFFECT_LOOKUP_RECOVERY_CURSOR, 24, 0, 0, 0, 0, NULL);
        struct c5b11_effect_result result = {0};
        int provider_status = c5b11_supervisor_lookup_recovery_cursor(&request, &result);
        if (provider_status != 0 || !valid_echo(&request, &result)) {
            return reconcile_created_attempt(2, C5B11_EFFECT_INDETERMINATE, 14);
        }
        if (result.outcome == C5B11_EFFECT_APPLIED &&
            result.facts == C5B11_FACT_ATTEMPT_REOPENED &&
            result.failed_sequence >= 2 && result.failed_sequence <= 13 &&
            result.recovery_step >= 14 && result.recovery_step <= 23) {
            if (result.failed_sequence >= 12 &&
                valid_completion_recovery_step(result.recovery_step)) {
                return reconcile_completion_response_loss(
                    result.failed_sequence, C5B11_EFFECT_INDETERMINATE, result.recovery_step);
            }
            if (result.failed_sequence < 12 &&
                valid_created_recovery_step(result.recovery_step)) {
                return reconcile_created_attempt(
                    result.failed_sequence, C5B11_EFFECT_INDETERMINATE, result.recovery_step);
            }
            return reconcile_created_attempt(2, C5B11_EFFECT_INDETERMINATE, 14);
        }
        if (result.outcome != C5B11_EFFECT_NOT_APPLIED ||
            result.facts != C5B11_FACT_ATTEMPT_FRESH ||
            result.failed_sequence != 0 || result.recovery_step != 0) {
            return reconcile_created_attempt(2, C5B11_EFFECT_INDETERMINATE, 14);
        }
    }

    C5B11_NOMINAL(c5b11_supervisor_create_fixed_endpoints,
        C5B11_EFFECT_CREATE_FIXED_ENDPOINTS, 1, 0, 0, NULL, C5B11_FACT_ENDPOINTS_DISTINCT);
    process_state = C5B11_PROCESS_MAY_EXIST;
    C5B11_NOMINAL(c5b11_supervisor_spawn_fixed_runner,
        C5B11_EFFECT_SPAWN_FIXED_RUNNER, 2, 0, 0, NULL, C5B11_FACT_RUNNER_SPAWNED);
    process_state = C5B11_PROCESS_CONFIRMED;
    C5B11_NOMINAL(c5b11_supervisor_verify_ready_byte,
        C5B11_EFFECT_VERIFY_READY_BYTE, 3, 1, 1, NULL, C5B11_FACT_READY_EXACT);
    C5B11_NOMINAL(c5b11_supervisor_write_source_frame,
        C5B11_EFFECT_WRITE_SOURCE_FRAME, 4, C5B11_SOURCE_MAXIMUM,
        C5B11_SOURCE_FRAME_BYTES, c5b11_source_frame_sha256, C5B11_FACT_SOURCE_COMPLETE);
    C5B11_NOMINAL(c5b11_supervisor_write_input_frame,
        C5B11_EFFECT_WRITE_INPUT_FRAME, 5, C5B11_INPUT_MAXIMUM,
        C5B11_INPUT_FRAME_BYTES, c5b11_input_frame_sha256, C5B11_FACT_INPUT_COMPLETE);
    C5B11_NOMINAL(c5b11_supervisor_close_input_writers,
        C5B11_EFFECT_CLOSE_INPUT_WRITERS, 6, 0, 0, NULL, C5B11_FACT_WRITERS_CLOSED);
    C5B11_NOMINAL(c5b11_supervisor_send_start_byte,
        C5B11_EFFECT_SEND_START_BYTE, 7, 1, 1, NULL, C5B11_FACT_START_EXACT);
    C5B11_NOMINAL(c5b11_supervisor_drain_validate_completion,
        C5B11_EFFECT_DRAIN_VALIDATE_COMPLETION, 8, C5B11_COMPLETION_RETENTION,
        C5B11_COMPLETION_FRAME_BYTES, c5b11_completion_frame_sha256,
        C5B11_FACT_COMPLETION_EXACT | C5B11_FACT_TRAILER_LAST);
    C5B11_NOMINAL(c5b11_supervisor_join_terminal_state,
        C5B11_EFFECT_JOIN_TERMINAL_STATE, 9, 0, 0, NULL, C5B11_FACT_RUNNER_TERMINAL);
    C5B11_NOMINAL(c5b11_supervisor_prove_authoritative_absence,
        C5B11_EFFECT_PROVE_AUTHORITATIVE_ABSENCE, 10, 0, 0, NULL,
        C5B11_FACT_AUTHORITATIVE_ABSENCE);
    C5B11_NOMINAL(c5b11_supervisor_remove_fixed_root,
        C5B11_EFFECT_REMOVE_FIXED_ROOT, 11, 0, 0, NULL, C5B11_FACT_ROOT_REMOVED);

    C5B11_NOMINAL(c5b11_supervisor_commit_durable_completion,
        C5B11_EFFECT_COMMIT_DURABLE_COMPLETION, 12, 0, 0,
        c5b11_completion_frame_sha256, C5B11_FACT_DURABLE_RECORD);
    C5B11_NOMINAL(c5b11_supervisor_deliver_stored_completion,
        C5B11_EFFECT_DELIVER_STORED_COMPLETION, 13, 0, 0,
        c5b11_completion_frame_sha256, C5B11_FACT_DELIVERED_STORED);
    return 0;

fail_nominal:
    if (failed_sequence >= 12) {
        return reconcile_completion_response_loss(failed_sequence, observed_outcome, 14);
    }
    if (process_state != C5B11_PROCESS_NONE) {
        return reconcile_created_attempt(failed_sequence, observed_outcome, 14);
    }
    return durable_unresolved(failed_sequence, observed_outcome, 21);
}
