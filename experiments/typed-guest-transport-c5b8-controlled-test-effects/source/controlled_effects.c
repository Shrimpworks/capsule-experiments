#include "controlled_effects_internal.h"

#include <stddef.h>

#define C5B8_SESSION_MAGIC UINT32_C(0x53453842)
#define C5B8_SOURCE_CAP UINT64_C(262296)
#define C5B8_INPUT_CAP UINT64_C(262296)

struct c5b8_session {
    uint32_t magic;
    uint32_t version;
    uint32_t structure_bytes;
    uint32_t initialized;
    struct c5b3_controller controller;
    struct c5b5_immutable_profile profile;
    uint8_t attempt_id[16];
    uint8_t registration_id[16];
    uint8_t registered_plan_sha256[32];
    uint8_t profile_binding_sha256[32];
    uint64_t root_device;
    uint64_t root_inode;
    uint64_t root_bytes;
    uint64_t source_frame_bytes;
    uint64_t input_frame_bytes;
    uint64_t integrity_tag;
    uint64_t sequence;
    uint64_t resources;
    uint32_t source_written;
    uint32_t input_written;
    uint32_t teardown_requested;
    uint32_t absence_proven;
    uint32_t root_removed;
    uint32_t durable_commit_requested;
    uint32_t delivery_performed;
    uint32_t cleanup_unresolved;
    uint32_t fenced;
    uint8_t source_frame[C5B8_SOURCE_CAP];
    uint8_t input_frame[C5B8_INPUT_CAP];
};

static struct c5b8_session c5b8_owned_session;

static void bytes_zero(void *destination, size_t length) {
    uint8_t *output = destination;
    size_t index;
    for (index = 0; index < length; index++) output[index] = 0;
}

static void bytes_copy(void *destination, const void *source, size_t length) {
    uint8_t *output = destination;
    const uint8_t *input = source;
    size_t index;
    for (index = 0; index < length; index++) output[index] = input[index];
}

static int bytes_equal(const void *left, const void *right, size_t length) {
    const uint8_t *a = left;
    const uint8_t *b = right;
    uint8_t difference = 0;
    size_t index;
    for (index = 0; index < length; index++) difference |= (uint8_t)(a[index] ^ b[index]);
    return difference == 0;
}

static int bytes_nonzero(const uint8_t *bytes, size_t length) {
    uint8_t combined = 0;
    size_t index;
    for (index = 0; index < length; index++) combined |= bytes[index];
    return combined != 0;
}

/* Diagnostic corruption tag only; it is not an authority or cryptographic seal. */
static uint64_t tag_bytes(uint64_t tag, const void *input, size_t length) {
    const uint8_t *bytes = input;
    size_t index;
    for (index = 0; index < length; index++) {
        tag ^= bytes[index];
        tag *= UINT64_C(1099511628211);
    }
    return tag;
}

static uint64_t session_tag(const struct c5b8_session *session) {
    uint64_t tag = UINT64_C(1469598103934665603);
    tag = tag_bytes(tag, &session->profile, sizeof(session->profile));
    tag = tag_bytes(tag, session->attempt_id, sizeof(session->attempt_id));
    tag = tag_bytes(tag, session->registration_id, sizeof(session->registration_id));
    tag = tag_bytes(tag, session->registered_plan_sha256, sizeof(session->registered_plan_sha256));
    tag = tag_bytes(tag, session->profile_binding_sha256, sizeof(session->profile_binding_sha256));
    tag = tag_bytes(tag, &session->root_device, sizeof(session->root_device));
    tag = tag_bytes(tag, &session->root_inode, sizeof(session->root_inode));
    tag = tag_bytes(tag, &session->root_bytes, sizeof(session->root_bytes));
    tag = tag_bytes(tag, &session->source_frame_bytes, sizeof(session->source_frame_bytes));
    tag = tag_bytes(tag, &session->input_frame_bytes, sizeof(session->input_frame_bytes));
    tag = tag_bytes(tag, &session->controller, sizeof(session->controller));
    tag = tag_bytes(tag, &session->sequence, sizeof(session->sequence));
    tag = tag_bytes(tag, &session->resources, sizeof(session->resources));
    tag = tag_bytes(tag, &session->source_written, sizeof(session->source_written));
    tag = tag_bytes(tag, &session->input_written, sizeof(session->input_written));
    tag = tag_bytes(tag, &session->teardown_requested, sizeof(session->teardown_requested));
    tag = tag_bytes(tag, &session->absence_proven, sizeof(session->absence_proven));
    tag = tag_bytes(tag, &session->root_removed, sizeof(session->root_removed));
    tag = tag_bytes(tag, &session->durable_commit_requested,
        sizeof(session->durable_commit_requested));
    tag = tag_bytes(tag, &session->delivery_performed, sizeof(session->delivery_performed));
    tag = tag_bytes(tag, &session->cleanup_unresolved, sizeof(session->cleanup_unresolved));
    tag = tag_bytes(tag, &session->fenced, sizeof(session->fenced));
    tag = tag_bytes(tag, session->source_frame, (size_t)session->source_frame_bytes);
    tag = tag_bytes(tag, session->input_frame, (size_t)session->input_frame_bytes);
    return tag;
}

static int session_valid(const struct c5b8_session *session) {
    return session == &c5b8_owned_session && session->magic == C5B8_SESSION_MAGIC &&
        session->version == C5B8_DESCRIPTOR_VERSION &&
        session->structure_bytes == sizeof(*session) && session->initialized == 1 &&
        session->source_frame_bytes <= C5B8_SOURCE_CAP &&
        session->input_frame_bytes <= C5B8_INPUT_CAP &&
        session->integrity_tag == session_tag(session);
}

static void initialize_result(
    const struct c5b8_session *session,
    struct c5b8_step_result *result
) {
    bytes_zero(result, sizeof(*result));
    result->status = C5B8_OK;
    result->controller_state = session->controller.state;
    result->last_sequence = session->sequence;
    result->teardown_requested = session->teardown_requested;
    result->absence_proven = session->absence_proven;
    result->root_removed = session->root_removed;
    result->durable_commit_requested = session->durable_commit_requested;
    result->delivery_performed = session->delivery_performed;
    result->cleanup_unresolved = session->cleanup_unresolved;
    result->fenced = session->fenced;
}

static uint64_t required_resource(
    const struct c5b8_session *session,
    uint32_t effect
) {
    switch (effect) {
        case C5B5_EFFECT_CREATE_ENDPOINTS: return C5B8_RESOURCE_ENDPOINTS;
        case C5B5_EFFECT_START_DRAINS: return C5B8_RESOURCE_DRAINS;
        case C5B5_EFFECT_KRUN_CREATE_CTX: return C5B8_RESOURCE_CONTEXT_LIVE;
        case C5B5_EFFECT_KRUN_START_ENTER: return C5B8_RESOURCE_CONTEXT_CONSUMED;
        case C5B5_EFFECT_CLOSE_INPUT_WRITERS:
            return C5B8_RESOURCE_SOURCE_CLOSED | C5B8_RESOURCE_INPUT_CLOSED;
        case C5B5_EFFECT_ALLOW_CHILD: return C5B8_RESOURCE_CHILD_ALLOWED;
        case C5B5_EFFECT_REQUEST_TEARDOWN: {
            uint64_t required = C5B8_RESOURCE_TEARDOWN_REQUESTED;
            if ((session->resources & C5B8_RESOURCE_ENDPOINTS) != 0) {
                required |= C5B8_RESOURCE_SOURCE_CLOSED | C5B8_RESOURCE_INPUT_CLOSED;
            }
            if ((session->resources & C5B8_RESOURCE_CONTEXT_LIVE) != 0) {
                required |= C5B8_RESOURCE_CONTEXT_RELEASED;
            }
            return required;
        }
        case C5B5_EFFECT_PROVE_ABSENCE: return C5B8_RESOURCE_ABSENCE_PROVEN;
        case C5B5_EFFECT_REMOVE_FIXED_ROOT: return C5B8_RESOURCE_ROOT_REMOVED;
        case C5B5_EFFECT_REQUEST_DURABLE_COMMIT: return C5B8_RESOURCE_DURABLE_REQUESTED;
        case C5B5_EFFECT_DELIVER_STORED: return C5B8_RESOURCE_DELIVERED;
        case C5B5_EFFECT_REPLAY_STORED: return C5B8_RESOURCE_REPLAYED;
        case C5B5_EFFECT_FENCE_STORE: return C5B8_RESOURCE_STORE_FENCED;
        case C5B5_EFFECT_STOP_MISMATCH: return C5B8_RESOURCE_STOPPED;
        default: return 0;
    }
}

static uint64_t exact_facts_for_event(uint32_t event) {
    switch (event) {
        case C5B3_EVENT_BIND_EXACT:
            return C5B3_FACT_EXACT_PROFILE | C5B3_FACT_EXACT_AUTHORIZATION |
                C5B3_FACT_EXACT_ARTIFACTS | C5B3_FACT_FIXED_ROOT_ABSENT;
        case C5B3_EVENT_ENDPOINTS_VERIFIED: return C5B3_FACT_ENDPOINTS_DISTINCT;
        case C5B3_EVENT_DRAINS_STARTED: return C5B3_FACT_DRAINS_ACTIVE;
        case C5B3_EVENT_INPUTS_WRITTEN:
            return C5B3_FACT_SOURCE_COMPLETE | C5B3_FACT_INPUT_COMPLETE |
                C5B3_FACT_LAUNCHER_INPUTS_VALID;
        case C5B3_EVENT_RESULT_ACCEPTED: return C5B3_FACT_RESULT_VALID;
        case C5B3_EVENT_TRAILER_COMMITTED: return C5B3_FACT_TRAILER_LAST;
        case C5B3_EVENT_FRAME_ACCEPTED: return C5B3_FACT_FRAME_EXACT;
        case C5B3_EVENT_TERMINAL_FACTS_JOINED:
            return C5B3_FACT_CHILD_TREE_ABSENT | C5B3_FACT_RUNNER_TERMINAL |
                C5B3_FACT_RUNNER_ABSENT | C5B3_FACT_TEARDOWN_RESOLVED |
                C5B3_FACT_CLEANUP_FALSE;
        case C5B3_EVENT_DURABLE_COMMIT_CONFIRMED: return C5B3_FACT_DURABLE_RECORD;
        case C5B3_EVENT_TEARDOWN_CONFIRMED: return C5B3_FACT_TEARDOWN_RESOLVED;
        case C5B3_EVENT_ABSENCE_CONFIRMED:
            return C5B3_FACT_CHILD_TREE_ABSENT | C5B3_FACT_RUNNER_ABSENT;
        case C5B3_EVENT_CLEANUP_CONFIRMED: return C5B3_FACT_FIXED_ROOT_REMOVED;
        default: return C5B3_FACT_NONE;
    }
}

static int operation_precondition(
    const struct c5b8_session *session,
    uint32_t effect
) {
    if (effect == C5B5_EFFECT_START_DRAINS &&
        (session->resources & C5B8_RESOURCE_ENDPOINTS) == 0) return 0;
    if (effect == C5B5_EFFECT_KRUN_CREATE_CTX &&
        (session->resources & C5B8_RESOURCE_DRAINS) == 0) return 0;
    if (effect >= C5B5_EFFECT_KRUN_SET_VM_CONFIG &&
        effect <= C5B5_EFFECT_KRUN_START_ENTER &&
        (session->resources & C5B8_RESOURCE_CONTEXT_LIVE) == 0) return 0;
    if ((effect == C5B5_EFFECT_WRITE_SOURCE || effect == C5B5_EFFECT_WRITE_INPUT) &&
        (session->resources & C5B8_RESOURCE_CONTEXT_CONSUMED) == 0) return 0;
    if (effect == C5B5_EFFECT_CLOSE_INPUT_WRITERS &&
        (session->source_written == 0 || session->input_written == 0)) return 0;
    if (effect == C5B5_EFFECT_ALLOW_CHILD &&
        (session->resources & (C5B8_RESOURCE_SOURCE_CLOSED | C5B8_RESOURCE_INPUT_CLOSED)) !=
            (C5B8_RESOURCE_SOURCE_CLOSED | C5B8_RESOURCE_INPUT_CLOSED)) return 0;
    if (effect == C5B5_EFFECT_PROVE_ABSENCE && session->teardown_requested == 0) return 0;
    if (effect == C5B5_EFFECT_REMOVE_FIXED_ROOT && session->absence_proven == 0) return 0;
    if (effect == C5B5_EFFECT_DELIVER_STORED &&
        (session->durable_commit_requested == 0 || session->controller.durable == 0)) return 0;
    if (effect == C5B5_EFFECT_REPLAY_STORED && session->controller.durable == 0) return 0;
    return 1;
}

static void request_from_operation(
    const struct c5b8_session *session,
    const struct c5b5_operation *operation,
    uint64_t sequence,
    struct c5b8_operation_request *request
) {
    bytes_zero(request, sizeof(*request));
    request->magic = C5B8_OPERATION_MAGIC;
    request->version = C5B8_OPERATION_VERSION;
    request->structure_bytes = sizeof(*request);
    request->controller_state = session->controller.state;
    bytes_copy(request->attempt_id, session->attempt_id, sizeof(request->attempt_id));
    bytes_copy(request->registration_id, session->registration_id, sizeof(request->registration_id));
    bytes_copy(request->registered_plan_sha256, session->registered_plan_sha256,
        sizeof(request->registered_plan_sha256));
    bytes_copy(request->profile_binding_sha256, session->profile_binding_sha256,
        sizeof(request->profile_binding_sha256));
    request->sequence = sequence;
    request->operation = *operation;
    request->expected_resource_state = required_resource(session, operation->effect);
    request->root_device = session->root_device;
    request->root_inode = session->root_inode;
    request->root_bytes = session->root_bytes;
    if (operation->effect == C5B5_EFFECT_WRITE_SOURCE) {
        request->source_frame = session->source_frame;
        request->source_frame_length = session->source_frame_bytes;
    } else if (operation->effect == C5B5_EFFECT_WRITE_INPUT) {
        request->input_frame = session->input_frame;
        request->input_frame_length = session->input_frame_bytes;
    }
}

static int32_t enroll_descriptor(struct c5b8_session *session) {
    struct c5b8_operation_request request;
    struct c5b8_operation_result result;
    int32_t call_status;
    bytes_zero(&request, sizeof(request));
    request.magic = C5B8_OPERATION_MAGIC;
    request.version = C5B8_OPERATION_VERSION;
    request.structure_bytes = sizeof(request);
    request.controller_state = C5B3_STATE_STOPPED;
    bytes_copy(request.attempt_id, session->attempt_id, sizeof(request.attempt_id));
    bytes_copy(request.registration_id, session->registration_id,
        sizeof(request.registration_id));
    bytes_copy(request.registered_plan_sha256, session->registered_plan_sha256,
        sizeof(request.registered_plan_sha256));
    bytes_copy(request.profile_binding_sha256, session->profile_binding_sha256,
        sizeof(request.profile_binding_sha256));
    request.sequence = 1;
    request.operation.effect = C5B8_EFFECT_ENROLL_DESCRIPTOR;
    request.expected_resource_state = C5B8_RESOURCE_DESCRIPTOR_ENROLLED;
    request.root_device = session->root_device;
    request.root_inode = session->root_inode;
    request.root_bytes = session->root_bytes;
    request.source_frame = session->source_frame;
    request.source_frame_length = session->source_frame_bytes;
    request.input_frame = session->input_frame;
    request.input_frame_length = session->input_frame_bytes;
    bytes_zero(&result, sizeof(result));
    call_status = c5b8_controlled_test_operation(&request, &result);
    if (call_status != 0 || result.magic != C5B8_OPERATION_MAGIC ||
        result.version != C5B8_OPERATION_VERSION ||
        result.structure_bytes != sizeof(result) ||
        result.outcome != C5B8_OPERATION_APPLIED || result.sequence != 1 ||
        result.effect != C5B8_EFFECT_ENROLL_DESCRIPTOR ||
        result.resource_state != C5B8_RESOURCE_DESCRIPTOR_ENROLLED ||
        !bytes_equal(result.attempt_id, session->attempt_id, sizeof(result.attempt_id)) ||
        !bytes_equal(result.registration_id, session->registration_id,
            sizeof(result.registration_id)) ||
        !bytes_equal(result.registered_plan_sha256, session->registered_plan_sha256,
            sizeof(result.registered_plan_sha256)) ||
        !bytes_equal(result.profile_binding_sha256, session->profile_binding_sha256,
            sizeof(result.profile_binding_sha256))) return C5B8_REFUSE_BINDING;
    session->sequence = 1;
    session->resources = C5B8_RESOURCE_DESCRIPTOR_ENROLLED;
    return C5B8_OK;
}

static int32_t execute_operation(
    struct c5b8_session *session,
    const struct c5b5_operation *operation,
    struct c5b8_step_result *step_result
) {
    struct c5b8_operation_request request;
    struct c5b8_operation_result result;
    uint64_t required;
    int32_t call_status;

    if (!operation_precondition(session, operation->effect)) {
        step_result->failed_effect = operation->effect;
        return C5B8_REFUSE_COMPLETION_ORDER;
    }
    session->sequence++;
    request_from_operation(session, operation, session->sequence, &request);
    bytes_zero(&result, sizeof(result));
    call_status = c5b8_controlled_test_operation(&request, &result);
    step_result->last_sequence = session->sequence;
    if (call_status != 0 || result.magic != C5B8_OPERATION_MAGIC ||
        result.version != C5B8_OPERATION_VERSION ||
        result.structure_bytes != sizeof(result) || result.sequence != request.sequence ||
        result.effect != operation->effect ||
        !bytes_equal(result.attempt_id, session->attempt_id, sizeof(result.attempt_id)) ||
        !bytes_equal(result.registration_id, session->registration_id,
            sizeof(result.registration_id)) ||
        !bytes_equal(result.registered_plan_sha256, session->registered_plan_sha256,
            sizeof(result.registered_plan_sha256)) ||
        !bytes_equal(result.profile_binding_sha256, session->profile_binding_sha256,
            sizeof(result.profile_binding_sha256))) {
        step_result->failed_effect = operation->effect;
        return C5B8_FENCE_OPERATION_INDETERMINATE;
    }
    if (result.outcome == C5B8_OPERATION_NOT_APPLIED) {
        step_result->failed_effect = operation->effect;
        if (result.resource_state != 0) return C5B8_FENCE_OPERATION_INDETERMINATE;
        return C5B8_REFUSE_OPERATION_NOT_APPLIED;
    }
    if (result.outcome == C5B8_OPERATION_INDETERMINATE) {
        step_result->failed_effect = operation->effect;
        return C5B8_FENCE_OPERATION_INDETERMINATE;
    }
    if (result.outcome != C5B8_OPERATION_APPLIED) {
        step_result->failed_effect = operation->effect;
        return C5B8_FENCE_OPERATION_INDETERMINATE;
    }
    required = required_resource(session, operation->effect);
    if ((result.resource_state & ~required) != 0) {
        step_result->failed_effect = operation->effect;
        return C5B8_FENCE_OPERATION_INDETERMINATE;
    }
    if (result.resource_state != required) {
        step_result->failed_effect = operation->effect;
        return C5B8_REFUSE_CLEANUP_UNRESOLVED;
    }

    session->resources |= result.resource_state;
    if ((result.resource_state & C5B8_RESOURCE_CONTEXT_CONSUMED) != 0 ||
        (result.resource_state & C5B8_RESOURCE_CONTEXT_RELEASED) != 0) {
        session->resources &= ~C5B8_RESOURCE_CONTEXT_LIVE;
    }
    if (operation->effect == C5B5_EFFECT_WRITE_SOURCE) session->source_written = 1;
    if (operation->effect == C5B5_EFFECT_WRITE_INPUT) session->input_written = 1;
    if (operation->effect == C5B5_EFFECT_REQUEST_TEARDOWN) session->teardown_requested = 1;
    if (operation->effect == C5B5_EFFECT_PROVE_ABSENCE) session->absence_proven = 1;
    if (operation->effect == C5B5_EFFECT_REMOVE_FIXED_ROOT) session->root_removed = 1;
    if (operation->effect == C5B5_EFFECT_REQUEST_DURABLE_COMMIT)
        session->durable_commit_requested = 1;
    if (operation->effect == C5B5_EFFECT_DELIVER_STORED ||
        operation->effect == C5B5_EFFECT_REPLAY_STORED) session->delivery_performed = 1;
    if (operation->effect == C5B5_EFFECT_FENCE_STORE) session->fenced = 1;
    step_result->completed_operations++;
    return C5B8_OK;
}

static int32_t obtain_observation(
    struct c5b8_session *session,
    uint32_t requested_event,
    uint32_t *event,
    uint64_t *facts,
    struct c5b8_step_result *step_result
) {
    struct c5b8_operation_request request;
    struct c5b8_operation_result result;
    int32_t call_status;
    bytes_zero(&request, sizeof(request));
    request.magic = C5B8_OPERATION_MAGIC;
    request.version = C5B8_OPERATION_VERSION;
    request.structure_bytes = sizeof(request);
    request.controller_state = session->controller.state;
    bytes_copy(request.attempt_id, session->attempt_id, sizeof(request.attempt_id));
    bytes_copy(request.registration_id, session->registration_id,
        sizeof(request.registration_id));
    bytes_copy(request.registered_plan_sha256, session->registered_plan_sha256,
        sizeof(request.registered_plan_sha256));
    bytes_copy(request.profile_binding_sha256, session->profile_binding_sha256,
        sizeof(request.profile_binding_sha256));
    session->sequence++;
    request.sequence = session->sequence;
    request.requested_event = requested_event;
    request.operation.effect = C5B8_EFFECT_OBSERVE_EVENT;
    request.root_device = session->root_device;
    request.root_inode = session->root_inode;
    request.root_bytes = session->root_bytes;
    bytes_zero(&result, sizeof(result));
    call_status = c5b8_controlled_test_operation(&request, &result);
    step_result->last_sequence = session->sequence;
    step_result->failed_effect = C5B8_EFFECT_OBSERVE_EVENT;
    if (call_status != 0 || result.magic != C5B8_OPERATION_MAGIC ||
        result.version != C5B8_OPERATION_VERSION ||
        result.structure_bytes != sizeof(result) || result.sequence != request.sequence ||
        result.effect != C5B8_EFFECT_OBSERVE_EVENT ||
        !bytes_equal(result.attempt_id, session->attempt_id, sizeof(result.attempt_id)) ||
        !bytes_equal(result.registration_id, session->registration_id,
            sizeof(result.registration_id)) ||
        !bytes_equal(result.registered_plan_sha256, session->registered_plan_sha256,
            sizeof(result.registered_plan_sha256)) ||
        !bytes_equal(result.profile_binding_sha256, session->profile_binding_sha256,
            sizeof(result.profile_binding_sha256)) || result.resource_state != 0 ||
        result.observed_event != requested_event ||
        result.observed_facts != exact_facts_for_event(requested_event)) {
        return C5B8_FENCE_OPERATION_INDETERMINATE;
    }
    if (result.outcome == C5B8_OPERATION_NOT_APPLIED)
        return C5B8_REFUSE_OPERATION_NOT_APPLIED;
    if (result.outcome != C5B8_OPERATION_APPLIED)
        return C5B8_FENCE_OPERATION_INDETERMINATE;
    *event = result.observed_event;
    *facts = result.observed_facts;
    step_result->failed_effect = 0;
    return C5B8_OK;
}

static int32_t execute_actions(
    struct c5b8_session *session,
    uint64_t actions,
    struct c5b8_step_result *result
) {
    struct c5b5_plan plan;
    uint32_t index;
    int32_t status = c5b5_translate_controller_actions(&session->profile, actions, &plan);
    if (status != C5B5_OK) return C5B8_REFUSE_ADAPTER;
    for (index = 0; index < plan.count; index++) {
        status = execute_operation(session, &plan.operations[index], result);
        if (status != C5B8_OK) return status;
    }
    return C5B8_OK;
}

static void fence_after_indeterminate(
    struct c5b8_session *session,
    struct c5b8_step_result *result
) {
    struct c5b3_step fence = c5b3_controller_step(&session->controller,
        C5B3_EVENT_STORE_INDETERMINATE, C5B3_FACT_NONE);
    int32_t fence_status = execute_actions(session,
        fence.actions & C5B3_ACTION_FENCE_STORE, result);
    session->fenced = 1;
    if (fence_status != C5B8_OK) session->cleanup_unresolved = 1;
}

static int32_t recover_after_failure(
    struct c5b8_session *session,
    int32_t original_status,
    struct c5b8_step_result *result
) {
    struct c5b3_step recovery;
    int32_t recovery_status;
    if (result->failed_effect == C5B5_EFFECT_REQUEST_TEARDOWN ||
        result->failed_effect == C5B5_EFFECT_FENCE_STORE) {
        session->cleanup_unresolved = 1;
        if (original_status == C5B8_FENCE_OPERATION_INDETERMINATE) {
            fence_after_indeterminate(session, result);
        }
        return original_status;
    }
    recovery = c5b3_controller_step(&session->controller,
        original_status == C5B8_FENCE_OPERATION_INDETERMINATE ?
            C5B3_EVENT_STORE_INDETERMINATE : C5B3_EVENT_PROCESS_FAULT,
        C5B3_FACT_NONE);
    recovery_status = execute_actions(session, recovery.actions, result);
    if (recovery_status != C5B8_OK || session->teardown_requested == 0) {
        session->cleanup_unresolved = 1;
    }
    if (recovery_status == C5B8_FENCE_OPERATION_INDETERMINATE) {
        fence_after_indeterminate(session, result);
        return recovery_status;
    }
    if (original_status == C5B8_FENCE_OPERATION_INDETERMINATE ||
        recovery.state == C5B3_STATE_FENCED) session->fenced = 1;
    return original_status;
}

int32_t c5b8_initialize(
    const struct c5b5_immutable_profile *profile,
    const struct c5b8_supervisor_descriptor *descriptor,
    struct c5b8_session **session_out
) {
    struct c5b8_session *state = &c5b8_owned_session;
    if (session_out == NULL) return C5B8_REFUSE_ARGUMENT;
    *session_out = NULL;
    if (profile == NULL || descriptor == NULL) return C5B8_REFUSE_ARGUMENT;
    if (c5b5_validate_immutable_profile(profile) != C5B5_OK) return C5B8_REFUSE_PROFILE;
    if (descriptor->magic != C5B8_DESCRIPTOR_MAGIC ||
        descriptor->version != C5B8_DESCRIPTOR_VERSION ||
        descriptor->structure_bytes != sizeof(*descriptor) || descriptor->reserved != 0)
        return C5B8_REFUSE_DESCRIPTOR_ABI;
    if (!bytes_nonzero(descriptor->attempt_id, sizeof(descriptor->attempt_id)) ||
        !bytes_nonzero(descriptor->registration_id, sizeof(descriptor->registration_id)) ||
        !bytes_nonzero(descriptor->registered_plan_sha256,
            sizeof(descriptor->registered_plan_sha256)) ||
        !bytes_nonzero(descriptor->profile_binding_sha256,
            sizeof(descriptor->profile_binding_sha256))) return C5B8_REFUSE_BINDING;
    if (descriptor->root_device == 0 || descriptor->root_inode == 0 ||
        descriptor->root_bytes != profile->root_bytes) return C5B8_REFUSE_ROOT_IDENTITY;
    if (descriptor->source_frame == NULL || descriptor->source_frame_bytes == 0 ||
        descriptor->input_frame == NULL || descriptor->input_frame_bytes == 0 ||
        descriptor->source_frame_bytes > profile->source_physical_maximum ||
        descriptor->input_frame_bytes > profile->input_physical_maximum ||
        descriptor->source_frame_bytes > C5B8_SOURCE_CAP ||
        descriptor->input_frame_bytes > C5B8_INPUT_CAP) return C5B8_REFUSE_FRAME;

    bytes_zero(state, sizeof(*state));
    state->magic = C5B8_SESSION_MAGIC;
    state->version = C5B8_DESCRIPTOR_VERSION;
    state->structure_bytes = sizeof(*state);
    state->initialized = 1;
    state->profile = *profile;
    bytes_copy(state->attempt_id, descriptor->attempt_id, sizeof(state->attempt_id));
    bytes_copy(state->registration_id, descriptor->registration_id,
        sizeof(state->registration_id));
    bytes_copy(state->registered_plan_sha256, descriptor->registered_plan_sha256,
        sizeof(state->registered_plan_sha256));
    bytes_copy(state->profile_binding_sha256, descriptor->profile_binding_sha256,
        sizeof(state->profile_binding_sha256));
    state->root_device = descriptor->root_device;
    state->root_inode = descriptor->root_inode;
    state->root_bytes = descriptor->root_bytes;
    state->source_frame_bytes = descriptor->source_frame_bytes;
    state->input_frame_bytes = descriptor->input_frame_bytes;
    if (descriptor->source_frame_bytes != 0)
        bytes_copy(state->source_frame, descriptor->source_frame,
            (size_t)descriptor->source_frame_bytes);
    if (descriptor->input_frame_bytes != 0)
        bytes_copy(state->input_frame, descriptor->input_frame,
            (size_t)descriptor->input_frame_bytes);
    c5b3_controller_reset(&state->controller);
    if (enroll_descriptor(state) != C5B8_OK) {
        bytes_zero(state, sizeof(*state));
        return C5B8_REFUSE_BINDING;
    }
    state->integrity_tag = session_tag(state);
    *session_out = state;
    return C5B8_OK;
}

int32_t c5b8_apply_observation(
    struct c5b8_session *session,
    uint32_t requested_event,
    struct c5b8_step_result *result
) {
    struct c5b8_session *state = session;
    struct c5b3_step step;
    uint32_t event;
    uint64_t observed_facts;
    int32_t status;
    if (session == NULL || result == NULL) return C5B8_REFUSE_ARGUMENT;
    if (!session_valid(state)) {
        bytes_zero(result, sizeof(*result));
        result->status = C5B8_REFUSE_SESSION;
        return C5B8_REFUSE_SESSION;
    }
    initialize_result(state, result);
    if (state->cleanup_unresolved != 0) {
        result->status = C5B8_REFUSE_CLEANUP_UNRESOLVED;
        return C5B8_REFUSE_CLEANUP_UNRESOLVED;
    }
    status = obtain_observation(state, requested_event, &event, &observed_facts, result);
    if (status != C5B8_OK) {
        if (status == C5B8_FENCE_OPERATION_INDETERMINATE)
            status = recover_after_failure(state, status, result);
        result->status = (uint32_t)status;
        result->controller_state = state->controller.state;
        result->last_sequence = state->sequence;
        result->teardown_requested = state->teardown_requested;
        result->cleanup_unresolved = state->cleanup_unresolved;
        result->fenced = state->fenced;
        state->integrity_tag = session_tag(state);
        return status;
    }
    step = c5b3_controller_step(&state->controller, event, observed_facts);
    result->controller_state = step.state;
    result->disposition = step.disposition;
    result->controller_actions = step.actions;
    status = execute_actions(state, step.actions, result);
    if (status != C5B8_OK) {
        status = recover_after_failure(state, status, result);
        result->status = (uint32_t)status;
    } else if (step.disposition == C5B3_DISPOSITION_REFUSED) {
        result->status = C5B8_REFUSE_CONTROLLER_ORDER;
        status = C5B8_REFUSE_CONTROLLER_ORDER;
    }
    result->controller_state = state->controller.state;
    result->last_sequence = state->sequence;
    result->teardown_requested = state->teardown_requested;
    result->absence_proven = state->absence_proven;
    result->root_removed = state->root_removed;
    result->durable_commit_requested = state->durable_commit_requested;
    result->delivery_performed = state->delivery_performed;
    result->cleanup_unresolved = state->cleanup_unresolved;
    result->fenced = state->fenced;
    state->integrity_tag = session_tag(state);
    return status;
}

#ifdef C5B8_TEST_DOUBLE
void c5b8_test_corrupt_authority_state(struct c5b8_session *session) {
    if (session == &c5b8_owned_session) {
        session->controller.state = C5B3_STATE_DURABLE_COMMIT;
        session->controller.durable = 1;
        session->resources |= C5B8_RESOURCE_DURABLE_REQUESTED;
        session->durable_commit_requested = 1;
    }
}
#endif
