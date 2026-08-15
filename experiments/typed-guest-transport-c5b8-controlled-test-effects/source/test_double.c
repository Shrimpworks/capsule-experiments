#include "controlled_effects_internal.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

#define TRACE_CAPACITY 256
#ifndef C5B8_FIXTURE_ROOT
#error "C5B8_FIXTURE_ROOT is required for the repository test double"
#endif

static uint32_t trace[TRACE_CAPACITY];
static uint64_t trace_sequence[TRACE_CAPACITY];
static size_t trace_count;
static uint32_t injected_effect;
static uint32_t injected_outcome;
static uint32_t corrupt_binding_effect;
static uint32_t partial_teardown;
static uint32_t omit_context_release;
static uint32_t corrupt_observation_event;
static uint32_t extra_resource_effect;
static uint32_t indeterminate_teardown;
static uint8_t source_fixture[255];
static uint8_t input_fixture[188];
static uint32_t fixtures_loaded;
static const uint8_t expected_attempt[16] = {
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
};
static const uint8_t expected_registration[16] = {
    16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
};

extern void c5b8_test_corrupt_authority_state(struct c5b8_session *session);
static const uint8_t expected_plan_digest[32] = {
    0x5a, 0x80, 0x6a, 0xc1, 0x62, 0x85, 0x37, 0xc9,
    0x99, 0xe7, 0x3b, 0x07, 0xb0, 0xd7, 0x3d, 0x1a,
    0x96, 0xa3, 0x15, 0x07, 0xd1, 0xe9, 0x1f, 0xd0,
    0xf9, 0xa0, 0x53, 0x57, 0x87, 0xe6, 0xfb, 0x64,
};
static const uint8_t expected_profile_digest[32] = {
    0xc0, 0xa2, 0xd0, 0xec, 0x63, 0x37, 0xd4, 0xcb,
    0x4e, 0xd5, 0x2e, 0x8a, 0x93, 0x0a, 0x54, 0xa5,
    0x9e, 0xc3, 0xe6, 0x77, 0xd4, 0xad, 0x9d, 0xa1,
    0xa6, 0x02, 0xc4, 0xcd, 0x71, 0x24, 0xf0, 0x4b,
};

static void read_fixture(const char *path, uint8_t *output, size_t length) {
    FILE *file = fopen(path, "rb");
    assert(file != NULL);
    assert(fread(output, 1, length, file) == length);
    assert(fgetc(file) == EOF);
    assert(fclose(file) == 0);
}

static void load_fixtures(void) {
    if (fixtures_loaded != 0) return;
    read_fixture(C5B8_FIXTURE_ROOT "/source.frame", source_fixture,
        sizeof(source_fixture));
    read_fixture(C5B8_FIXTURE_ROOT "/input.frame", input_fixture,
        sizeof(input_fixture));
    fixtures_loaded = 1;
}

static void reset_double(void) {
    memset(trace, 0, sizeof(trace));
    memset(trace_sequence, 0, sizeof(trace_sequence));
    trace_count = 0;
    injected_effect = 0;
    injected_outcome = 0;
    corrupt_binding_effect = 0;
    partial_teardown = 0;
    omit_context_release = 0;
    corrupt_observation_event = 0;
    extra_resource_effect = 0;
    indeterminate_teardown = 0;
}

static uint64_t facts_for_event(uint32_t event) {
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

int32_t c5b8_controlled_test_operation(
    const struct c5b8_operation_request *request,
    struct c5b8_operation_result *result
) {
    assert(request != NULL && result != NULL);
    assert(request->magic == C5B8_OPERATION_MAGIC);
    assert(request->version == C5B8_OPERATION_VERSION);
    assert(request->structure_bytes == sizeof(*request));
    assert(memcmp(request->attempt_id, expected_attempt, sizeof(expected_attempt)) == 0);
    assert(memcmp(request->registration_id, expected_registration,
        sizeof(expected_registration)) == 0);
    assert(memcmp(request->registered_plan_sha256, expected_plan_digest,
        sizeof(expected_plan_digest)) == 0);
    assert(memcmp(request->profile_binding_sha256, expected_profile_digest,
        sizeof(expected_profile_digest)) == 0);
    assert(request->root_device == 101 && request->root_inode == 202);
    assert(request->root_bytes == UINT64_C(134217728));
    assert(trace_count < TRACE_CAPACITY);
    trace[trace_count] = request->operation.effect;
    trace_sequence[trace_count] = request->sequence;
    trace_count++;

    if (request->operation.effect == C5B8_EFFECT_ENROLL_DESCRIPTOR) {
        assert(request->source_frame_length == sizeof(source_fixture));
        assert(request->input_frame_length == sizeof(input_fixture));
        assert(memcmp(request->source_frame, source_fixture, sizeof(source_fixture)) == 0);
        assert(memcmp(request->input_frame, input_fixture, sizeof(input_fixture)) == 0);
    } else if (request->operation.effect == C5B5_EFFECT_WRITE_SOURCE) {
        assert(request->source_frame_length == sizeof(source_fixture));
        assert(memcmp(request->source_frame, source_fixture, sizeof(source_fixture)) == 0);
        assert(request->input_frame == NULL && request->input_frame_length == 0);
    } else if (request->operation.effect == C5B5_EFFECT_WRITE_INPUT) {
        assert(request->input_frame_length == sizeof(input_fixture));
        assert(memcmp(request->input_frame, input_fixture, sizeof(input_fixture)) == 0);
        assert(request->source_frame == NULL && request->source_frame_length == 0);
    } else {
        assert(request->source_frame == NULL && request->source_frame_length == 0);
        assert(request->input_frame == NULL && request->input_frame_length == 0);
    }

    memset(result, 0, sizeof(*result));
    result->magic = C5B8_OPERATION_MAGIC;
    result->version = C5B8_OPERATION_VERSION;
    result->structure_bytes = sizeof(*result);
    result->outcome = request->operation.effect == injected_effect ?
        injected_outcome : C5B8_OPERATION_APPLIED;
    if (request->operation.effect == C5B5_EFFECT_REQUEST_TEARDOWN &&
        indeterminate_teardown != 0) result->outcome = C5B8_OPERATION_INDETERMINATE;
    memcpy(result->attempt_id, request->attempt_id, sizeof(result->attempt_id));
    memcpy(result->registration_id, request->registration_id,
        sizeof(result->registration_id));
    memcpy(result->registered_plan_sha256, request->registered_plan_sha256,
        sizeof(result->registered_plan_sha256));
    memcpy(result->profile_binding_sha256, request->profile_binding_sha256,
        sizeof(result->profile_binding_sha256));
    result->sequence = request->sequence;
    result->effect = request->operation.effect;
    result->resource_state = request->expected_resource_state;
    if (request->operation.effect == C5B8_EFFECT_OBSERVE_EVENT) {
        assert(request->expected_resource_state == 0);
        result->observed_event = request->requested_event;
        result->observed_facts = facts_for_event(request->requested_event);
        if (request->requested_event == corrupt_observation_event)
            result->observed_facts ^= C5B3_FACT_DURABLE_RECORD;
    }
    if (request->operation.effect == extra_resource_effect)
        result->resource_state |= UINT64_C(1) << 63;
    if (request->operation.effect == C5B5_EFFECT_REQUEST_TEARDOWN) {
        if (omit_context_release != 0)
            result->resource_state &= ~C5B8_RESOURCE_CONTEXT_RELEASED;
        if (partial_teardown != 0)
            result->resource_state &= ~C5B8_RESOURCE_INPUT_CLOSED;
    }
    if (request->operation.effect == corrupt_binding_effect) result->attempt_id[0] ^= 0xff;
    return 0;
}

/* Link-only anchors required by the accepted C5b5 descriptive adapter. */
int32_t krun_create_ctx(void) { assert(0 && "real runtime call forbidden"); return -1; }
int32_t krun_set_vm_config(uint32_t c, uint8_t v, uint32_t r) { (void)c; (void)v; (void)r; assert(0); return -1; }
int32_t krun_disable_implicit_console(uint32_t c) { (void)c; assert(0); return -1; }
int32_t krun_disable_implicit_init(uint32_t c) { (void)c; assert(0); return -1; }
int32_t krun_disable_implicit_vsock(uint32_t c) { (void)c; assert(0); return -1; }
int32_t krun_add_read_only_raw_root_fd(uint32_t c, int f, uint64_t d, uint64_t i, uint64_t l) { (void)c; (void)f; (void)d; (void)i; (void)l; assert(0); return -1; }
int32_t krun_set_root_disk_remount(uint32_t c, const char *d, const char *f, const char *o) { (void)c; (void)d; (void)f; (void)o; assert(0); return -1; }
int32_t krun_add_virtio_console_multiport(uint32_t c) { (void)c; assert(0); return -1; }
int32_t krun_add_console_port_inout(uint32_t c, uint32_t p, const char *n, int i, int o) { (void)c; (void)p; (void)n; (void)i; (void)o; assert(0); return -1; }
int32_t krun_set_kernel_console(uint32_t c, const char *n) { (void)c; (void)n; assert(0); return -1; }
int32_t krun_set_workdir(uint32_t c, const char *w) { (void)c; (void)w; assert(0); return -1; }
int32_t krun_set_exec(uint32_t c, const char *p, const char *const a[], const char *const e[]) { (void)c; (void)p; (void)a; (void)e; assert(0); return -1; }
int32_t krun_start_enter(uint32_t c) { (void)c; assert(0); return -1; }

static uint8_t nibble(char value) {
    if (value >= '0' && value <= '9') return (uint8_t)(value - '0');
    return (uint8_t)(value - 'a' + 10);
}

static void decode32(uint8_t output[32], const char *hex) {
    size_t index;
    assert(strlen(hex) == 64);
    for (index = 0; index < 32; index++)
        output[index] = (uint8_t)((nibble(hex[index * 2]) << 4) |
            nibble(hex[index * 2 + 1]));
}

static struct c5b5_immutable_profile exact_profile(void) {
    struct c5b5_immutable_profile profile = {0};
    profile.magic = C5B5_PROFILE_MAGIC;
    profile.version = C5B5_PROFILE_VERSION;
    profile.structure_bytes = sizeof(profile);
    profile.host_root_fd = 4;
    profile.source_fd = 5;
    profile.input_fd = 6;
    profile.completion_fd = 7;
    profile.vcpus = 1;
    profile.ram_mib = 256;
    profile.root_bytes = UINT64_C(134217728);
    profile.source_physical_maximum = UINT64_C(262296);
    profile.input_physical_maximum = UINT64_C(262296);
    profile.completion_physical_maximum = UINT64_C(262368);
    profile.completion_retention_bytes = UINT64_C(262369);
    decode32(profile.controller_contract_sha256,
        "36285d7fa3f27a992fda413afb38c1ed05a3af30f496c5784b2165d5b2f90e59");
    decode32(profile.controller_header_sha256,
        "0ae153a47d5a2d0cdfbae7e149139b72abbd35f7f1223dd5745f03df86cadd12");
    decode32(profile.libkrun_header_sha256,
        "dce44d1d70ab770b1089e57646e025281a4137fe5052b9dd8eaefb80c01a1bd8");
    decode32(profile.libkrun_dylib_sha256,
        "055d9d18dc964fec4aba21948c4a344cb7a51cb48a2c70017484b718eae12f9f");
    decode32(profile.libkrunfw_dylib_sha256,
        "0b14f4b8005dafd33c38df5935b9efdb6381c724224b3967ba1cecbecf10b6e9");
    return profile;
}

static struct c5b8_supervisor_descriptor exact_descriptor(
    uint8_t source[255], uint8_t input[188]
) {
    struct c5b8_supervisor_descriptor descriptor = {0};
    descriptor.magic = C5B8_DESCRIPTOR_MAGIC;
    descriptor.version = C5B8_DESCRIPTOR_VERSION;
    descriptor.structure_bytes = sizeof(descriptor);
    memcpy(descriptor.attempt_id, expected_attempt, sizeof(descriptor.attempt_id));
    memcpy(descriptor.registration_id, expected_registration,
        sizeof(descriptor.registration_id));
    memcpy(descriptor.registered_plan_sha256, expected_plan_digest,
        sizeof(descriptor.registered_plan_sha256));
    memcpy(descriptor.profile_binding_sha256, expected_profile_digest,
        sizeof(descriptor.profile_binding_sha256));
    descriptor.root_device = 101;
    descriptor.root_inode = 202;
    descriptor.root_bytes = UINT64_C(134217728);
    descriptor.source_frame = source;
    descriptor.source_frame_bytes = 255;
    descriptor.input_frame = input;
    descriptor.input_frame_bytes = 188;
    return descriptor;
}

static void initialize_session(struct c5b8_session **session) {
    uint8_t source[255];
    uint8_t input[188];
    struct c5b5_immutable_profile profile = exact_profile();
    load_fixtures();
    memcpy(source, source_fixture, sizeof(source));
    memcpy(input, input_fixture, sizeof(input));
    struct c5b8_supervisor_descriptor descriptor = exact_descriptor(source, input);
    assert(c5b8_initialize(&profile, &descriptor, session) == C5B8_OK);
    source[0] = 99;
    input[0] = 88;
}

static int32_t apply(
    struct c5b8_session *session,
    uint32_t event,
    struct c5b8_step_result *result
) {
    return c5b8_apply_observation(session, event, result);
}

static void bind_and_start(struct c5b8_session *session, struct c5b8_step_result *result) {
    assert(apply(session, C5B3_EVENT_BIND_EXACT, result) == C5B8_OK);
    assert(apply(session, C5B3_EVENT_ENDPOINTS_VERIFIED, result) == C5B8_OK);
    assert(apply(session, C5B3_EVENT_DRAINS_STARTED, result) == C5B8_OK);
    assert(result->controller_state == C5B3_STATE_RUNNER_READY);
}

static int32_t advance_to_terminal(struct c5b8_session *session, struct c5b8_step_result *result) {
    bind_and_start(session, result);
    assert(apply(session, C5B3_EVENT_RUNNER_STARTED, result) == C5B8_OK);
    assert(apply(session, C5B3_EVENT_INPUTS_WRITTEN, result) == C5B8_OK);
    assert(apply(session, C5B3_EVENT_CHILD_STARTED, result) == C5B8_OK);
    assert(apply(session, C5B3_EVENT_RESULT_ACCEPTED, result) == C5B8_OK);
    assert(apply(session, C5B3_EVENT_TRAILER_COMMITTED, result) == C5B8_OK);
    assert(apply(session, C5B3_EVENT_FRAME_ACCEPTED, result) == C5B8_OK);
    return apply(session, C5B3_EVENT_TERMINAL_FACTS_JOINED, result);
}

static void test_descriptor_validation(void) {
    uint8_t source[255];
    uint8_t input[188];
    struct c5b5_immutable_profile profile = exact_profile();
    load_fixtures();
    memcpy(source, source_fixture, sizeof(source));
    memcpy(input, input_fixture, sizeof(input));
    struct c5b8_supervisor_descriptor descriptor = exact_descriptor(source, input);
    struct c5b8_session *session;
    assert(c5b8_initialize(NULL, &descriptor, &session) == C5B8_REFUSE_ARGUMENT);
    profile.magic++;
    assert(c5b8_initialize(&profile, &descriptor, &session) == C5B8_REFUSE_PROFILE);
    profile = exact_profile();
    descriptor.structure_bytes--;
    assert(c5b8_initialize(&profile, &descriptor, &session) == C5B8_REFUSE_DESCRIPTOR_ABI);
    descriptor = exact_descriptor(source, input);
    memset(descriptor.attempt_id, 0, sizeof(descriptor.attempt_id));
    assert(c5b8_initialize(&profile, &descriptor, &session) == C5B8_REFUSE_BINDING);
    descriptor = exact_descriptor(source, input);
    descriptor.root_bytes = UINT64_C(100663296);
    assert(c5b8_initialize(&profile, &descriptor, &session) == C5B8_REFUSE_ROOT_IDENTITY);
    descriptor = exact_descriptor(source, input);
    descriptor.source_frame_bytes = UINT64_C(262297);
    assert(c5b8_initialize(&profile, &descriptor, &session) == C5B8_REFUSE_FRAME);
    descriptor = exact_descriptor(source, input);
    descriptor.source_frame = NULL;
    descriptor.source_frame_bytes = 0;
    assert(c5b8_initialize(&profile, &descriptor, &session) == C5B8_REFUSE_FRAME);
    reset_double();
    corrupt_binding_effect = C5B8_EFFECT_ENROLL_DESCRIPTOR;
    descriptor = exact_descriptor(source, input);
    assert(c5b8_initialize(&profile, &descriptor, &session) == C5B8_REFUSE_BINDING);
    assert(trace_count == 1 && trace[0] == C5B8_EFFECT_ENROLL_DESCRIPTOR);
}

static void test_full_completion_last_trace(void) {
    struct c5b8_session *session;
    struct c5b8_step_result result;
    size_t index;
    reset_double();
    initialize_session(&session);
    assert(advance_to_terminal(session, &result) == C5B8_OK);
    assert(result.controller_state == C5B3_STATE_TERMINAL_PROOF);
    assert(result.durable_commit_requested == 1 && result.delivery_performed == 0);
    assert(trace[trace_count - 1] == C5B5_EFFECT_REQUEST_DURABLE_COMMIT);
    assert(apply(session, C5B3_EVENT_DURABLE_COMMIT_CONFIRMED, &result) == C5B8_OK);
    assert(trace[trace_count - 1] == C5B5_EFFECT_DELIVER_STORED);
    assert(result.delivery_performed == 1);
    assert(apply(session, C5B3_EVENT_RESPONSE_DELIVERED, &result) == C5B8_OK);
    assert(result.controller_state == C5B3_STATE_COMPLETE);
    assert(apply(session, C5B3_EVENT_RESPONSE_LOST, &result) == C5B8_OK);
    assert(trace[trace_count - 1] == C5B5_EFFECT_REPLAY_STORED);
    for (index = 0; index < trace_count; index++) assert(trace_sequence[index] == index + 1);
}

static void test_out_of_order_cannot_select_effect(void) {
    struct c5b8_session *session;
    struct c5b8_step_result result;
    reset_double();
    initialize_session(&session);
    assert(apply(session, C5B3_EVENT_DURABLE_COMMIT_CONFIRMED,
        &result) == C5B8_REFUSE_CONTROLLER_ORDER);
    assert(trace_count == 3 && trace[0] == C5B8_EFFECT_ENROLL_DESCRIPTOR &&
        trace[1] == C5B8_EFFECT_OBSERVE_EVENT && trace[2] == C5B5_EFFECT_STOP_MISMATCH);
    assert(result.delivery_performed == 0 && result.durable_commit_requested == 0);
}

static void test_teardown_absence_cleanup_order(void) {
    struct c5b8_session *session;
    struct c5b8_step_result result;
    reset_double();
    initialize_session(&session);
    assert(apply(session, C5B3_EVENT_BIND_EXACT, &result) == C5B8_OK);
    assert(apply(session, C5B3_EVENT_CANCEL, &result) == C5B8_OK);
    assert(trace[trace_count - 1] == C5B5_EFFECT_REQUEST_TEARDOWN);
    assert(apply(session, C5B3_EVENT_TEARDOWN_CONFIRMED, &result) == C5B8_OK);
    assert(trace[trace_count - 1] == C5B5_EFFECT_PROVE_ABSENCE);
    assert(apply(session, C5B3_EVENT_ABSENCE_CONFIRMED, &result) == C5B8_OK);
    assert(trace[trace_count - 1] == C5B5_EFFECT_REMOVE_FIXED_ROOT);
    assert(apply(session, C5B3_EVENT_CLEANUP_CONFIRMED,
        &result) == C5B8_REFUSE_CONTROLLER_ORDER);
    assert(result.controller_state == C5B3_STATE_REFUSED_CLEAN);
    assert(result.teardown_requested == 1 && result.absence_proven == 1 &&
        result.root_removed == 1 && result.cleanup_unresolved == 0);
}

static void test_operation_binding_failure_recovers(void) {
    struct c5b8_session *session;
    struct c5b8_step_result result;
    reset_double();
    initialize_session(&session);
    assert(apply(session, C5B3_EVENT_BIND_EXACT, &result) == C5B8_OK);
    corrupt_binding_effect = C5B5_EFFECT_START_DRAINS;
    assert(apply(session, C5B3_EVENT_ENDPOINTS_VERIFIED,
        &result) == C5B8_FENCE_OPERATION_INDETERMINATE);
    assert(result.teardown_requested == 1 && result.cleanup_unresolved == 0 &&
        result.fenced == 1);
    assert(trace[trace_count - 2] == C5B5_EFFECT_REQUEST_TEARDOWN);
    assert(trace[trace_count - 1] == C5B5_EFFECT_FENCE_STORE);
}

static void test_indeterminate_commit_fences_before_delivery(void) {
    struct c5b8_session *session;
    struct c5b8_step_result result;
    reset_double();
    initialize_session(&session);
    injected_effect = C5B5_EFFECT_REQUEST_DURABLE_COMMIT;
    injected_outcome = C5B8_OPERATION_INDETERMINATE;
    assert(advance_to_terminal(session, &result) == C5B8_FENCE_OPERATION_INDETERMINATE);
    assert(result.fenced == 1 && result.teardown_requested == 1);
    assert(result.delivery_performed == 0);
    assert(trace[trace_count - 2] == C5B5_EFFECT_REQUEST_TEARDOWN);
    assert(trace[trace_count - 1] == C5B5_EFFECT_FENCE_STORE);
}

static void test_partial_cleanup_is_unresolved(void) {
    struct c5b8_session *session;
    struct c5b8_step_result result;
    size_t before;
    reset_double();
    initialize_session(&session);
    assert(apply(session, C5B3_EVENT_BIND_EXACT, &result) == C5B8_OK);
    partial_teardown = 1;
    assert(apply(session, C5B3_EVENT_CANCEL,
        &result) == C5B8_REFUSE_CLEANUP_UNRESOLVED);
    assert(result.cleanup_unresolved == 1);
    before = trace_count;
    assert(apply(session, C5B3_EVENT_TEARDOWN_CONFIRMED,
        &result) == C5B8_REFUSE_CLEANUP_UNRESOLVED);
    assert(trace_count == before);
}

static void test_context_release_failure_is_unresolved(void) {
    struct c5b8_session *session;
    struct c5b8_step_result result;
    reset_double();
    initialize_session(&session);
    assert(apply(session, C5B3_EVENT_BIND_EXACT, &result) == C5B8_OK);
    assert(apply(session, C5B3_EVENT_ENDPOINTS_VERIFIED, &result) == C5B8_OK);
    injected_effect = C5B5_EFFECT_KRUN_SET_VM_CONFIG;
    injected_outcome = C5B8_OPERATION_NOT_APPLIED;
    omit_context_release = 1;
    assert(apply(session, C5B3_EVENT_DRAINS_STARTED,
        &result) == C5B8_REFUSE_OPERATION_NOT_APPLIED);
    assert(result.cleanup_unresolved == 1 && result.teardown_requested == 0);
    assert(trace[trace_count - 1] == C5B5_EFFECT_REQUEST_TEARDOWN);
}

static void test_session_corruption_refused(void) {
    struct c5b8_session *session;
    struct c5b8_step_result result;
    reset_double();
    initialize_session(&session);
    c5b8_test_corrupt_authority_state(session);
    assert(apply(session, C5B3_EVENT_RESPONSE_LOST, &result) == C5B8_REFUSE_SESSION);
    assert(trace_count == 1 && trace[0] == C5B8_EFFECT_ENROLL_DESCRIPTOR);
}

static void test_observation_fact_substitution_fences(void) {
    struct c5b8_session *session;
    struct c5b8_step_result result;
    reset_double();
    initialize_session(&session);
    corrupt_observation_event = C5B3_EVENT_BIND_EXACT;
    assert(apply(session, C5B3_EVENT_BIND_EXACT,
        &result) == C5B8_FENCE_OPERATION_INDETERMINATE);
    assert(result.fenced == 1 && result.teardown_requested == 1);
    assert(result.controller_actions == 0 && result.delivery_performed == 0);
}

static void test_unknown_resource_delta_fences(void) {
    struct c5b8_session *session;
    struct c5b8_step_result result;
    reset_double();
    initialize_session(&session);
    assert(apply(session, C5B3_EVENT_BIND_EXACT, &result) == C5B8_OK);
    extra_resource_effect = C5B5_EFFECT_START_DRAINS;
    assert(apply(session, C5B3_EVENT_ENDPOINTS_VERIFIED,
        &result) == C5B8_FENCE_OPERATION_INDETERMINATE);
    assert(result.fenced == 1 && result.teardown_requested == 1);
}

static void test_indeterminate_recovery_teardown_fences(void) {
    struct c5b8_session *session;
    struct c5b8_step_result result;
    reset_double();
    initialize_session(&session);
    assert(apply(session, C5B3_EVENT_BIND_EXACT, &result) == C5B8_OK);
    injected_effect = C5B5_EFFECT_START_DRAINS;
    injected_outcome = C5B8_OPERATION_NOT_APPLIED;
    indeterminate_teardown = 1;
    assert(apply(session, C5B3_EVENT_ENDPOINTS_VERIFIED,
        &result) == C5B8_FENCE_OPERATION_INDETERMINATE);
    assert(result.fenced == 1 && result.cleanup_unresolved == 1 &&
        result.delivery_performed == 0);
    assert(trace[trace_count - 1] == C5B5_EFFECT_FENCE_STORE);
}

int main(void) {
    test_descriptor_validation();
    test_full_completion_last_trace();
    test_out_of_order_cannot_select_effect();
    test_teardown_absence_cleanup_order();
    test_operation_binding_failure_recovers();
    test_indeterminate_commit_fences_before_delivery();
    test_partial_cleanup_is_unresolved();
    test_context_release_failure_is_unresolved();
    test_session_corruption_refused();
    test_observation_fact_substitution_fences();
    test_unknown_resource_delta_fences();
    test_indeterminate_recovery_teardown_fences();
    puts("C5b8 controlled-test effect layer: PASSED");
    puts("No real libkrun symbol, VM, guest, process, signing, Keychain, or network operation ran.");
    return 0;
}
