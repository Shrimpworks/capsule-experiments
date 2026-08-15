#include "root_binding_successor.h"
#include "../generated/root_binding_values.h"
#include "../inputs/c5b8/source/controlled_effects_internal.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

#ifndef C5B8_FIXTURE_ROOT
#error "C5B8_FIXTURE_ROOT is required"
#endif

static uint8_t source_frame[C5B8_SOURCE_FRAME_BYTES];
static uint8_t input_frame[C5B8_INPUT_FRAME_BYTES];
static uint32_t operation_calls;
static uint32_t root_operation_calls;
static uint64_t root_operation_bytes;

static void read_exact(const char *path, uint8_t *output, size_t length) {
    FILE *file = fopen(path, "rb");
    assert(file != NULL);
    assert(fread(output, 1, length, file) == length);
    assert(fgetc(file) == EOF);
    assert(fclose(file) == 0);
}

static void load_frames(void) {
    read_exact(C5B8_FIXTURE_ROOT "/source.frame", source_frame, sizeof(source_frame));
    read_exact(C5B8_FIXTURE_ROOT "/input.frame", input_frame, sizeof(input_frame));
}

static uint8_t nibble(char value) {
    if (value >= '0' && value <= '9') return (uint8_t)(value - '0');
    return (uint8_t)(value - 'a' + 10);
}

static void decode32(uint8_t output[32], const char *hex) {
    size_t index;
    assert(strlen(hex) == 64);
    for (index = 0; index < 32; index++) {
        output[index] = (uint8_t)((nibble(hex[index * 2]) << 4) |
            nibble(hex[index * 2 + 1]));
    }
}

static struct c5b5_immutable_profile successor_profile(void) {
    struct c5b5_immutable_profile profile = {0};
    profile.magic = C5B8_SUCCESSOR_PROFILE_MAGIC;
    profile.version = C5B8_SUCCESSOR_PROFILE_VERSION;
    profile.structure_bytes = sizeof(profile);
    profile.host_root_fd = 4;
    profile.source_fd = 5;
    profile.input_fd = 6;
    profile.completion_fd = 7;
    profile.vcpus = 1;
    profile.ram_mib = 256;
    profile.root_bytes = C5B8_SUCCESSOR_ROOT_BYTES;
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

static struct c5b8_supervisor_descriptor successor_descriptor(void) {
    struct c5b8_supervisor_descriptor descriptor = {0};
    descriptor.magic = C5B8_DESCRIPTOR_MAGIC;
    descriptor.version = C5B8_DESCRIPTOR_VERSION;
    descriptor.structure_bytes = sizeof(descriptor);
    memcpy(descriptor.attempt_id, c5b8_bound_attempt_id, sizeof(descriptor.attempt_id));
    memcpy(descriptor.registration_id, c5b8_bound_registration_id,
        sizeof(descriptor.registration_id));
    memcpy(descriptor.registered_plan_sha256, c5b8_bound_plan_sha256,
        sizeof(descriptor.registered_plan_sha256));
    memcpy(descriptor.profile_binding_sha256, c5b8_bound_profile_sha256,
        sizeof(descriptor.profile_binding_sha256));
    descriptor.root_device = 101;
    descriptor.root_inode = 202;
    descriptor.root_bytes = C5B8_BOUND_ROOT_BYTES;
    descriptor.source_frame = source_frame;
    descriptor.source_frame_bytes = sizeof(source_frame);
    descriptor.input_frame = input_frame;
    descriptor.input_frame_bytes = sizeof(input_frame);
    return descriptor;
}

static uint64_t facts_for_event(uint32_t event) {
    switch (event) {
        case C5B3_EVENT_BIND_EXACT:
            return C5B3_FACT_EXACT_PROFILE | C5B3_FACT_EXACT_AUTHORIZATION |
                C5B3_FACT_EXACT_ARTIFACTS | C5B3_FACT_FIXED_ROOT_ABSENT;
        case C5B3_EVENT_ENDPOINTS_VERIFIED: return C5B3_FACT_ENDPOINTS_DISTINCT;
        case C5B3_EVENT_DRAINS_STARTED: return C5B3_FACT_DRAINS_ACTIVE;
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
    assert(request->root_device == 101 && request->root_inode == 202);
    assert(request->root_bytes == C5B8_BOUND_ROOT_BYTES);
    operation_calls++;

    memset(result, 0, sizeof(*result));
    result->magic = C5B8_OPERATION_MAGIC;
    result->version = C5B8_OPERATION_VERSION;
    result->structure_bytes = sizeof(*result);
    result->outcome = C5B8_OPERATION_APPLIED;
    memcpy(result->attempt_id, request->attempt_id, sizeof(result->attempt_id));
    memcpy(result->registration_id, request->registration_id, sizeof(result->registration_id));
    memcpy(result->registered_plan_sha256, request->registered_plan_sha256,
        sizeof(result->registered_plan_sha256));
    memcpy(result->profile_binding_sha256, request->profile_binding_sha256,
        sizeof(result->profile_binding_sha256));
    result->sequence = request->sequence;
    result->effect = request->operation.effect;
    result->resource_state = request->expected_resource_state;

    if (memcmp(request->registered_plan_sha256, c5b8_bound_plan_sha256, 32) != 0) {
        result->registered_plan_sha256[0] ^= UINT8_C(0xff);
        return 0;
    }
    if (memcmp(request->profile_binding_sha256, c5b8_bound_profile_sha256, 32) != 0) {
        result->profile_binding_sha256[0] ^= UINT8_C(0xff);
        return 0;
    }
    if (request->operation.effect == C5B8_EFFECT_ENROLL_DESCRIPTOR) {
        assert(request->source_frame_length == sizeof(source_frame));
        assert(request->input_frame_length == sizeof(input_frame));
        assert(memcmp(request->source_frame, source_frame, sizeof(source_frame)) == 0);
        assert(memcmp(request->input_frame, input_frame, sizeof(input_frame)) == 0);
    } else {
        assert(request->source_frame == NULL && request->source_frame_length == 0);
        assert(request->input_frame == NULL && request->input_frame_length == 0);
    }
    if (request->operation.effect == C5B5_EFFECT_KRUN_ADD_READ_ONLY_RAW_ROOT_FD) {
        root_operation_calls++;
        root_operation_bytes = request->operation.value_a;
        assert(request->operation.input_fd == 4);
        assert(request->operation.output_fd == -1);
        assert(request->operation.value_b == UINT64_C(0400));
    }
    if (request->operation.effect == C5B8_EFFECT_OBSERVE_EVENT) {
        result->observed_event = request->requested_event;
        result->observed_facts = facts_for_event(request->requested_event);
    }
    return 0;
}

/* Link-only anchors. Any call is a test failure. */
int32_t krun_create_ctx(void) { assert(0); return -1; }
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

static void expect_initialize_status(
    struct c5b5_immutable_profile *profile,
    struct c5b8_supervisor_descriptor *descriptor,
    int32_t expected
) {
    struct c5b8_session *session = (struct c5b8_session *)(uintptr_t)1;
    assert(c5b8_initialize(profile, descriptor, &session) == expected);
    assert(session == NULL);
}

static void test_success(void) {
    struct c5b5_immutable_profile profile = successor_profile();
    struct c5b8_supervisor_descriptor descriptor = successor_descriptor();
    struct c5b8_session *session;
    struct c5b8_step_result result;
    struct c5b5_plan plan;
    uint32_t index;
    uint32_t direct_root_operations = 0;

    assert(c5b5_translate_controller_actions(&profile, C5B3_ACTION_START_RUNNER, &plan) == C5B5_OK);
    assert(plan.execution_authorized == 0);
    for (index = 0; index < plan.count; index++) {
        if (plan.operations[index].effect == C5B5_EFFECT_KRUN_ADD_READ_ONLY_RAW_ROOT_FD) {
            direct_root_operations++;
            assert(plan.operations[index].value_a == C5B8_BOUND_ROOT_BYTES);
        }
    }
    assert(direct_root_operations == 1);

    assert(c5b8_initialize(&profile, &descriptor, &session) == C5B8_OK);
    assert(session != NULL);
    assert(c5b8_apply_observation(session, C5B3_EVENT_BIND_EXACT, &result) == C5B8_OK);
    assert(c5b8_apply_observation(session, C5B3_EVENT_ENDPOINTS_VERIFIED, &result) == C5B8_OK);
    assert(c5b8_apply_observation(session, C5B3_EVENT_DRAINS_STARTED, &result) == C5B8_OK);
    assert(root_operation_calls == 1);
    assert(root_operation_bytes == C5B8_BOUND_ROOT_BYTES);
    assert(operation_calls > root_operation_calls);
}

int main(int argc, char **argv) {
    struct c5b5_immutable_profile profile;
    struct c5b8_supervisor_descriptor descriptor;
    static const uint8_t historical_profile_digest[32] = {
        0xc0, 0xa2, 0xd0, 0xec, 0x63, 0x37, 0xd4, 0xcb,
        0x4e, 0xd5, 0x2e, 0x8a, 0x93, 0x0a, 0x54, 0xa5,
        0x9e, 0xc3, 0xe6, 0x77, 0xd4, 0xad, 0x9d, 0xa1,
        0xa6, 0x02, 0xc4, 0xcd, 0x71, 0x24, 0xf0, 0x4b,
    };
    assert(argc == 2);
    load_frames();
    profile = successor_profile();
    descriptor = successor_descriptor();

    if (strcmp(argv[1], "success") == 0) {
        test_success();
    } else if (strcmp(argv[1], "historical-profile") == 0) {
        profile.magic = C5B5_PROFILE_MAGIC;
        profile.version = C5B5_PROFILE_VERSION;
        profile.root_bytes = C5B8_HISTORICAL_ROOT_BYTES;
        expect_initialize_status(&profile, &descriptor, C5B8_REFUSE_PROFILE);
        assert(operation_calls == 0);
    } else if (strcmp(argv[1], "historical-size") == 0) {
        profile.root_bytes = C5B8_HISTORICAL_ROOT_BYTES;
        expect_initialize_status(&profile, &descriptor, C5B8_REFUSE_PROFILE);
        assert(operation_calls == 0);
    } else if (strcmp(argv[1], "descriptor-size") == 0) {
        descriptor.root_bytes = C5B8_HISTORICAL_ROOT_BYTES;
        expect_initialize_status(&profile, &descriptor, C5B8_REFUSE_ROOT_IDENTITY);
        assert(operation_calls == 0);
    } else if (strcmp(argv[1], "historical-profile-digest") == 0) {
        memcpy(descriptor.profile_binding_sha256, historical_profile_digest,
            sizeof(historical_profile_digest));
        expect_initialize_status(&profile, &descriptor, C5B8_REFUSE_BINDING);
        assert(operation_calls == 1);
    } else if (strcmp(argv[1], "plan-substitution") == 0) {
        descriptor.registered_plan_sha256[0] ^= UINT8_C(0xff);
        expect_initialize_status(&profile, &descriptor, C5B8_REFUSE_BINDING);
        assert(operation_calls == 1);
    } else if (strcmp(argv[1], "authority-field") == 0) {
        profile.ram_mib = 512;
        expect_initialize_status(&profile, &descriptor, C5B8_REFUSE_PROFILE);
        assert(operation_calls == 0);
    } else {
        assert(0 && "unknown test case");
    }

    puts("C5b8/C5b7 root-binding test double: PASSED");
    puts("No retained dylib, runtime artifact, HVF, VM, guest, or live backend was loaded or invoked.");
    return 0;
}
