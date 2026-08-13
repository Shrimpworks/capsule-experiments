#include "effect_implementation.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

enum trace_id {
    TRACE_CREATE = 1,
    TRACE_FREE = 2,
    TRACE_VM = 3,
    TRACE_DISABLE_CONSOLE = 4,
    TRACE_DISABLE_INIT = 5,
    TRACE_DISABLE_VSOCK = 6,
    TRACE_ROOT = 7,
    TRACE_REMOUNT = 8,
    TRACE_CONSOLE = 9,
    TRACE_PORT = 10,
    TRACE_KERNEL_CONSOLE = 11,
    TRACE_WORKDIR = 12,
    TRACE_EXEC = 13,
    TRACE_START = 14,
    TRACE_WRITE = 20,
    TRACE_READ = 21,
    TRACE_CLOSE = 22,
};

static int trace_values[256];
static size_t trace_count;
static int fail_trace_id;
static int read_mode;
static int read_count;
static int write_mode;
static int fail_free;
static size_t request_count;
static uint32_t requests[64];
static size_t request_fail_at;

static void reset_doubles(void) {
    trace_count = 0;
    fail_trace_id = 0;
    read_mode = 0;
    read_count = 0;
    write_mode = 0;
    fail_free = 0;
    request_count = 0;
    request_fail_at = 0;
}

static int32_t record(int id) {
    assert(trace_count < sizeof(trace_values) / sizeof(trace_values[0]));
    trace_values[trace_count++] = id;
    return fail_trace_id == id ? -1000 - id : 0;
}

int32_t c5b7_test_krun_create_ctx(void) {
    int32_t status = record(TRACE_CREATE);
    return status == 0 ? 42 : status;
}
int32_t c5b7_test_krun_free_ctx(uint32_t ctx) {
    assert(ctx == 42);
    (void)record(TRACE_FREE);
    return fail_free ? -2002 : 0;
}
int32_t c5b7_test_krun_set_vm_config(uint32_t ctx, uint8_t vcpus, uint32_t ram) {
    assert(ctx == 42 && vcpus == 1 && ram == 256);
    return record(TRACE_VM);
}
int32_t c5b7_test_krun_disable_implicit_console(uint32_t ctx) {
    assert(ctx == 42); return record(TRACE_DISABLE_CONSOLE);
}
int32_t c5b7_test_krun_disable_implicit_init(uint32_t ctx) {
    assert(ctx == 42); return record(TRACE_DISABLE_INIT);
}
int32_t c5b7_test_krun_disable_implicit_vsock(uint32_t ctx) {
    assert(ctx == 42); return record(TRACE_DISABLE_VSOCK);
}
int32_t c5b7_test_krun_add_read_only_raw_root_fd(
    uint32_t ctx, int fd, uint64_t device, uint64_t inode, uint64_t length
) {
    assert(ctx == 42 && fd == 4 && device == 101 && inode == 202 &&
        length == UINT64_C(134217728));
    return record(TRACE_ROOT);
}
int32_t c5b7_test_krun_set_root_disk_remount(
    uint32_t ctx, const char *device, const char *filesystem, const char *options
) {
    assert(ctx == 42 && strcmp(device, "/dev/vda") == 0 &&
        strcmp(filesystem, "ext4") == 0 && strcmp(options, "ro,nosuid,nodev") == 0);
    return record(TRACE_REMOUNT);
}
int32_t c5b7_test_krun_add_virtio_console_multiport(uint32_t ctx) {
    int32_t status;
    assert(ctx == 42);
    status = record(TRACE_CONSOLE);
    return status == 0 ? 7 : status;
}
int32_t c5b7_test_krun_add_console_port_inout(
    uint32_t ctx, uint32_t console, const char *name, int input_fd, int output_fd
) {
    assert(ctx == 42 && console == 7);
    if (strcmp(name, "capsule.source") == 0) assert(input_fd == 5 && output_fd == -1);
    else if (strcmp(name, "capsule.input") == 0) assert(input_fd == 6 && output_fd == -1);
    else { assert(strcmp(name, "capsule.completion") == 0); assert(input_fd == -1 && output_fd == 7); }
    return record(TRACE_PORT);
}
int32_t c5b7_test_krun_set_kernel_console(uint32_t ctx, const char *console) {
    assert(ctx == 42 && strcmp(console, "hvc0") == 0);
    return record(TRACE_KERNEL_CONSOLE);
}
int32_t c5b7_test_krun_set_workdir(uint32_t ctx, const char *workdir) {
    assert(ctx == 42 && strcmp(workdir, "/") == 0);
    return record(TRACE_WORKDIR);
}
int32_t c5b7_test_krun_set_exec(
    uint32_t ctx, const char *path, const char *const argv[], const char *const envp[]
) {
    assert(ctx == 42 && strcmp(path, "/usr/local/libexec/capsule-init.krun") == 0);
    assert(argv != NULL && strcmp(argv[0], path) == 0 && argv[1] == NULL);
    assert(envp != NULL && envp[0] == NULL);
    return record(TRACE_EXEC);
}
int32_t c5b7_test_krun_start_enter(uint32_t ctx) {
    int32_t status;
    assert(ctx == 42);
    status = record(TRACE_START);
    return status == 0 ? -777 : status;
}

/* Satisfy C5b5's typed, never-called import anchors with the same doubles. */
int32_t krun_create_ctx(void) { return c5b7_test_krun_create_ctx(); }
int32_t krun_set_vm_config(uint32_t c, uint8_t v, uint32_t r) { return c5b7_test_krun_set_vm_config(c, v, r); }
int32_t krun_disable_implicit_console(uint32_t c) { return c5b7_test_krun_disable_implicit_console(c); }
int32_t krun_disable_implicit_init(uint32_t c) { return c5b7_test_krun_disable_implicit_init(c); }
int32_t krun_disable_implicit_vsock(uint32_t c) { return c5b7_test_krun_disable_implicit_vsock(c); }
int32_t krun_add_read_only_raw_root_fd(uint32_t c, int f, uint64_t d, uint64_t i, uint64_t l) { return c5b7_test_krun_add_read_only_raw_root_fd(c, f, d, i, l); }
int32_t krun_set_root_disk_remount(uint32_t c, const char *d, const char *f, const char *o) { return c5b7_test_krun_set_root_disk_remount(c, d, f, o); }
int32_t krun_add_virtio_console_multiport(uint32_t c) { return c5b7_test_krun_add_virtio_console_multiport(c); }
int32_t krun_add_console_port_inout(uint32_t c, uint32_t p, const char *n, int i, int o) { return c5b7_test_krun_add_console_port_inout(c, p, n, i, o); }
int32_t krun_set_kernel_console(uint32_t c, const char *n) { return c5b7_test_krun_set_kernel_console(c, n); }
int32_t krun_set_workdir(uint32_t c, const char *w) { return c5b7_test_krun_set_workdir(c, w); }
int32_t krun_set_exec(uint32_t c, const char *p, const char *const a[], const char *const e[]) { return c5b7_test_krun_set_exec(c, p, a, e); }
int32_t krun_start_enter(uint32_t c) { return c5b7_test_krun_start_enter(c); }

ssize_t c5b7_test_write(int fd, const void *bytes, size_t length) {
    int32_t status = record(TRACE_WRITE);
    assert(fd == 1 || fd == 5 || fd == 6);
    assert(bytes != NULL && length > 0);
    if (status != 0 || write_mode == 2) return -1;
    if (write_mode == 1) return 0;
    if (write_mode == 3 && length > 1) return 1;
    return (ssize_t)length;
}
ssize_t c5b7_test_read(int fd, void *output, size_t length) {
    uint8_t *byte = output;
    int32_t status = record(TRACE_READ);
    assert(fd == 3 && length == 1);
    if (status != 0 || read_mode == 3) return -1;
    read_count++;
    if (read_count == 1) {
        *byte = read_mode == 1 ? (uint8_t)'X' : (uint8_t)'G';
        return 1;
    }
    if (read_mode == 2) { *byte = (uint8_t)'X'; return 1; }
    return 0;
}
int c5b7_test_close(int fd) {
    int32_t status;
    assert(fd == 5 || fd == 6);
    status = record(TRACE_CLOSE);
    return status == 0 ? 0 : -1;
}

static int32_t handle_request(const struct c5b7_request_record *request, void *opaque) {
    (void)opaque;
    assert(request != NULL && request->request >= C5B7_REQUEST_CREATE_ENDPOINTS &&
        request->request <= C5B7_REQUEST_STOP_MISMATCH);
    assert(request_count < sizeof(requests) / sizeof(requests[0]));
    requests[request_count++] = request->request;
    return request_fail_at != 0 && request_count == request_fail_at ? -901 : 0;
}

static uint8_t nibble(char value) {
    if (value >= '0' && value <= '9') return (uint8_t)(value - '0');
    return (uint8_t)(value - 'a' + 10);
}
static void decode32(uint8_t output[32], const char *hex) {
    size_t index;
    assert(strlen(hex) == 64);
    for (index = 0; index < 32; index++) output[index] = (uint8_t)((nibble(hex[index * 2]) << 4) | nibble(hex[index * 2 + 1]));
}

static struct c5b5_immutable_profile exact_profile(void) {
    struct c5b5_immutable_profile profile = {0};
    profile.magic = C5B5_PROFILE_MAGIC;
    profile.version = C5B5_PROFILE_VERSION;
    profile.structure_bytes = sizeof(profile);
    profile.host_root_fd = 4; profile.source_fd = 5; profile.input_fd = 6; profile.completion_fd = 7;
    profile.vcpus = 1; profile.ram_mib = 256; profile.root_bytes = UINT64_C(134217728);
    profile.source_physical_maximum = UINT64_C(262296);
    profile.input_physical_maximum = UINT64_C(262296);
    profile.completion_physical_maximum = UINT64_C(262368);
    profile.completion_retention_bytes = UINT64_C(262369);
    decode32(profile.controller_contract_sha256, "36285d7fa3f27a992fda413afb38c1ed05a3af30f496c5784b2165d5b2f90e59");
    decode32(profile.controller_header_sha256, "0ae153a47d5a2d0cdfbae7e149139b72abbd35f7f1223dd5745f03df86cadd12");
    decode32(profile.libkrun_header_sha256, "dce44d1d70ab770b1089e57646e025281a4137fe5052b9dd8eaefb80c01a1bd8");
    decode32(profile.libkrun_dylib_sha256, "055d9d18dc964fec4aba21948c4a344cb7a51cb48a2c70017484b718eae12f9f");
    decode32(profile.libkrunfw_dylib_sha256, "0b14f4b8005dafd33c38df5935b9efdb6381c724224b3967ba1cecbecf10b6e9");
    return profile;
}

static struct c5b7_execution_inputs exact_inputs(void) {
    static const uint8_t source[] = {1, 2, 3};
    static const uint8_t input[] = {4, 5};
    struct c5b7_execution_inputs value = {0};
    value.version = C5B7_INPUTS_VERSION;
    value.structure_bytes = sizeof(value);
    value.root_device = 101; value.root_inode = 202;
    value.root_bytes = UINT64_C(134217728);
    value.source_frame = source; value.source_frame_bytes = sizeof(source);
    value.input_frame = input; value.input_frame_bytes = sizeof(input);
    value.request_handler = handle_request;
    return value;
}

static int32_t execute(uint64_t actions, struct c5b7_execution_result *result) {
    struct c5b5_immutable_profile profile = exact_profile();
    struct c5b7_execution_inputs inputs = exact_inputs();
    return c5b7_execute_controller_actions(&profile, actions, &inputs, result);
}

extern int32_t c5b7_test_execute_operation(
    const struct c5b7_execution_inputs *, const struct c5b5_operation *,
    struct c5b7_execution_result *
);

static void test_validation(void) {
    struct c5b5_immutable_profile profile = exact_profile();
    struct c5b7_execution_inputs inputs = exact_inputs();
    struct c5b7_execution_result result;
    assert(c5b7_validate_execution_inputs(NULL, &inputs) == C5B5_REFUSE_PROFILE_ABSENT);
    profile.magic++;
    assert(c5b7_validate_execution_inputs(&profile, &inputs) == C5B5_REFUSE_PROFILE_MISMATCH);
    profile = exact_profile();
    assert(c5b7_validate_execution_inputs(&profile, NULL) == C5B7_REFUSE_INPUTS_ABSENT);
    inputs.structure_bytes--;
    assert(c5b7_validate_execution_inputs(&profile, &inputs) == C5B7_REFUSE_INPUTS_MISMATCH);
    inputs = exact_inputs(); inputs.root_inode = 0;
    assert(c5b7_validate_execution_inputs(&profile, &inputs) == C5B7_REFUSE_ROOT_IDENTITY);
    inputs = exact_inputs(); inputs.root_bytes = UINT64_C(100663296);
    assert(c5b7_validate_execution_inputs(&profile, &inputs) == C5B7_REFUSE_ROOT_IDENTITY);
    inputs = exact_inputs(); inputs.source_frame_bytes = UINT64_C(262297);
    assert(c5b7_validate_execution_inputs(&profile, &inputs) == C5B7_REFUSE_FRAME_CAP);
    reset_doubles();
    assert(execute(UINT64_C(1) << 15, &result) == C5B5_REFUSE_ACTION_UNKNOWN);
    assert(trace_count == 0 && request_count == 0);
}

static void test_closed_runner_sequence(void) {
    static const int expected[] = {
        TRACE_CREATE, TRACE_VM, TRACE_DISABLE_CONSOLE, TRACE_DISABLE_INIT,
        TRACE_DISABLE_VSOCK, TRACE_ROOT, TRACE_REMOUNT, TRACE_CONSOLE,
        TRACE_PORT, TRACE_PORT, TRACE_PORT, TRACE_KERNEL_CONSOLE,
        TRACE_WORKDIR, TRACE_EXEC, TRACE_WRITE, TRACE_READ, TRACE_READ, TRACE_START,
    };
    struct c5b7_execution_result result;
    size_t index;
    reset_doubles();
    assert(execute(C5B3_ACTION_START_RUNNER, &result) == C5B7_REFUSE_KRUN_ERROR);
    assert(result.failed_effect == C5B5_EFFECT_KRUN_START_ENTER && result.raw_status == -777);
    assert(result.completed_operations == 16 && result.context_created == 1 &&
        result.context_consumed == 1 && result.context_free_attempted == 0 &&
        result.context_freed == 0 && result.execution_authorized == 0);
    assert(trace_count == sizeof(expected) / sizeof(expected[0]));
    for (index = 0; index < trace_count; index++) assert(trace_values[index] == expected[index]);
}

static void test_first_error_and_cleanup(void) {
    static const int failing[] = {
        TRACE_VM, TRACE_DISABLE_CONSOLE, TRACE_DISABLE_INIT, TRACE_DISABLE_VSOCK,
        TRACE_ROOT, TRACE_REMOUNT, TRACE_CONSOLE, TRACE_PORT,
        TRACE_KERNEL_CONSOLE, TRACE_WORKDIR, TRACE_EXEC,
    };
    struct c5b7_execution_result result;
    size_t index;
    for (index = 0; index < sizeof(failing) / sizeof(failing[0]); index++) {
        reset_doubles(); fail_trace_id = failing[index];
        assert(execute(C5B3_ACTION_START_RUNNER, &result) == C5B7_REFUSE_KRUN_ERROR);
        assert(result.context_created == 1 && result.context_free_attempted == 1 &&
            result.context_freed == 1 && result.context_free_status == 0 && result.context_consumed == 0);
        assert(trace_values[trace_count - 1] == TRACE_FREE);
        assert(result.raw_status == -1000 - failing[index]);
    }
    reset_doubles(); fail_trace_id = TRACE_CREATE;
    assert(execute(C5B3_ACTION_START_RUNNER, &result) == C5B7_REFUSE_KRUN_ERROR);
    assert(result.context_created == 0 && result.context_freed == 0 && trace_count == 1);
    reset_doubles(); fail_trace_id = TRACE_VM; fail_free = 1;
    assert(execute(C5B3_ACTION_START_RUNNER, &result) == C5B7_REFUSE_KRUN_ERROR);
    assert(result.context_free_attempted == 1 && result.context_freed == 0 &&
        result.context_free_status == -2002 && result.raw_status == -1003);
}

static void test_io_faults(void) {
    struct c5b7_execution_result result;
    reset_doubles(); write_mode = 3;
    assert(execute(C5B3_ACTION_WRITE_SOURCE | C5B3_ACTION_WRITE_INPUT, &result) == C5B7_OK);
    assert(result.completed_operations == 2 && trace_count == 5);
    reset_doubles(); write_mode = 1;
    assert(execute(C5B3_ACTION_WRITE_SOURCE | C5B3_ACTION_WRITE_INPUT, &result) == C5B7_REFUSE_WRITE_ZERO);
    assert(result.failed_effect == C5B5_EFFECT_WRITE_SOURCE && result.completed_operations == 0);
    reset_doubles(); write_mode = 2;
    assert(execute(C5B3_ACTION_WRITE_SOURCE, &result) == C5B7_REFUSE_WRITE_ERROR);
    assert(result.failed_effect == C5B5_EFFECT_WRITE_SOURCE && result.completed_operations == 0);
    reset_doubles(); read_mode = 1;
    assert(execute(C5B3_ACTION_START_RUNNER, &result) == C5B7_REFUSE_START_BYTE);
    assert(result.context_freed == 1 && trace_values[trace_count - 1] == TRACE_FREE);
    reset_doubles(); read_mode = 2;
    assert(execute(C5B3_ACTION_START_RUNNER, &result) == C5B7_REFUSE_START_TRAILING);
    assert(result.context_freed == 1);
    reset_doubles(); read_mode = 3;
    assert(execute(C5B3_ACTION_START_RUNNER, &result) == C5B7_REFUSE_READ_ERROR);
    assert(result.context_free_attempted == 1 && result.context_freed == 1);
    reset_doubles(); fail_trace_id = TRACE_CLOSE;
    assert(execute(C5B3_ACTION_CLOSE_INPUT_WRITERS | C5B3_ACTION_ALLOW_CHILD, &result) == C5B7_REFUSE_CLOSE_ERROR);
    assert(request_count == 0 && result.completed_operations == 0);
}

static void test_requests_and_order(void) {
    struct c5b7_execution_result result;
    reset_doubles();
    assert(execute(C5B3_ACTION_REQUEST_TEARDOWN | C5B3_ACTION_PROVE_ABSENCE |
        C5B3_ACTION_REMOVE_FIXED_ROOT, &result) == C5B7_OK);
    assert(request_count == 3 && requests[0] == C5B7_REQUEST_TEARDOWN &&
        requests[1] == C5B7_REQUEST_PROVE_ABSENCE && requests[2] == C5B7_REQUEST_REMOVE_FIXED_ROOT);
    assert(result.teardown_requested == 1 && result.absence_requested == 1 && result.cleanup_requested == 1);
    reset_doubles();
    assert(execute(C5B3_ACTION_PROVE_ABSENCE, &result) == C5B7_OK);
    assert(request_count == 1 && requests[0] == C5B7_REQUEST_PROVE_ABSENCE);
    reset_doubles();
    assert(execute(C5B3_ACTION_REQUEST_DURABLE_COMMIT | C5B3_ACTION_DELIVER_STORED, &result) == C5B7_OK);
    assert(request_count == 2 && requests[0] == C5B7_REQUEST_DURABLE_COMMIT &&
        requests[1] == C5B7_REQUEST_DELIVER_STORED && result.stored_delivery_requested == 1);
    reset_doubles();
    assert(execute(C5B3_ACTION_DELIVER_STORED, &result) == C5B7_OK);
    assert(request_count == 1 && requests[0] == C5B7_REQUEST_DELIVER_STORED);
    reset_doubles(); request_fail_at = 1;
    assert(execute(C5B3_ACTION_REQUEST_TEARDOWN | C5B3_ACTION_PROVE_ABSENCE, &result) == C5B7_REFUSE_REQUEST_ERROR);
    assert(request_count == 1 && result.completed_operations == 0 && result.teardown_requested == 0);
}

static void execute_step_actions(struct c5b3_step step) {
    struct c5b7_execution_result result;
    if (step.actions != C5B3_ACTION_NONE) {
        assert(execute(step.actions, &result) == C5B7_OK);
    }
}

static void test_real_controller_request_sequences(void) {
    struct c5b3_controller controller;
    struct c5b3_step step;
    reset_doubles();
    c5b3_controller_reset(&controller);
    step = c5b3_controller_step(&controller, C5B3_EVENT_BIND_EXACT,
        C5B3_FACT_EXACT_PROFILE | C5B3_FACT_EXACT_AUTHORIZATION |
        C5B3_FACT_EXACT_ARTIFACTS | C5B3_FACT_FIXED_ROOT_ABSENT);
    execute_step_actions(step);
    step = c5b3_controller_step(&controller, C5B3_EVENT_CANCEL, 0);
    execute_step_actions(step);
    assert(requests[request_count - 1] == C5B7_REQUEST_TEARDOWN);
    step = c5b3_controller_step(&controller, C5B3_EVENT_TEARDOWN_CONFIRMED,
        C5B3_FACT_TEARDOWN_RESOLVED);
    execute_step_actions(step);
    assert(requests[request_count - 1] == C5B7_REQUEST_PROVE_ABSENCE);
    step = c5b3_controller_step(&controller, C5B3_EVENT_ABSENCE_CONFIRMED,
        C5B3_FACT_CHILD_TREE_ABSENT | C5B3_FACT_RUNNER_ABSENT);
    execute_step_actions(step);
    assert(requests[request_count - 1] == C5B7_REQUEST_REMOVE_FIXED_ROOT);

    reset_doubles();
    c5b3_controller_reset(&controller);
    controller.state = C5B3_STATE_FRAME_OBSERVED;
    step = c5b3_controller_step(&controller, C5B3_EVENT_TERMINAL_FACTS_JOINED,
        C5B3_FACT_CHILD_TREE_ABSENT | C5B3_FACT_RUNNER_TERMINAL |
        C5B3_FACT_RUNNER_ABSENT | C5B3_FACT_TEARDOWN_RESOLVED |
        C5B3_FACT_CLEANUP_FALSE);
    execute_step_actions(step);
    assert(request_count == 1 && requests[0] == C5B7_REQUEST_DURABLE_COMMIT);
    step = c5b3_controller_step(&controller, C5B3_EVENT_DURABLE_COMMIT_CONFIRMED,
        C5B3_FACT_DURABLE_RECORD);
    execute_step_actions(step);
    assert(request_count == 2 && requests[1] == C5B7_REQUEST_DELIVER_STORED);
}

static void test_unknown_effect(void) {
    struct c5b7_execution_inputs inputs = exact_inputs();
    struct c5b7_execution_result result;
    struct c5b5_operation operation = {999, 0, -1, -1, 0, 0};
    reset_doubles();
    assert(c5b7_test_execute_operation(&inputs, &operation, &result) == C5B7_REFUSE_UNKNOWN_EFFECT);
    assert(result.failed_effect == 999 && trace_count == 0 && request_count == 0);
}

int main(void) {
    test_validation();
    test_closed_runner_sequence();
    test_first_error_and_cleanup();
    test_io_faults();
    test_requests_and_order();
    test_real_controller_request_sequences();
    test_unknown_effect();
    puts("C5b7 test-double executor: PASSED");
    puts("No real libkrun symbol, runtime, VMM, VM, or guest was resolved or executed.");
    return 0;
}
