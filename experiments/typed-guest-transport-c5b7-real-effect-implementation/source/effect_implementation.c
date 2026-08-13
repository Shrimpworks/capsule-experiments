#include "effect_implementation.h"

#include <stdbool.h>
#include <unistd.h>

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wcomment"
#pragma clang diagnostic ignored "-Wstrict-prototypes"
#include "../inputs/c5b2/libkrun.h"
#pragma clang diagnostic pop

#ifdef C5B7_TEST_DOUBLE
#define krun_create_ctx c5b7_test_krun_create_ctx
#define krun_free_ctx c5b7_test_krun_free_ctx
#define krun_set_vm_config c5b7_test_krun_set_vm_config
#define krun_disable_implicit_console c5b7_test_krun_disable_implicit_console
#define krun_disable_implicit_init c5b7_test_krun_disable_implicit_init
#define krun_disable_implicit_vsock c5b7_test_krun_disable_implicit_vsock
#define krun_add_read_only_raw_root_fd c5b7_test_krun_add_read_only_raw_root_fd
#define krun_set_root_disk_remount c5b7_test_krun_set_root_disk_remount
#define krun_add_virtio_console_multiport c5b7_test_krun_add_virtio_console_multiport
#define krun_add_console_port_inout c5b7_test_krun_add_console_port_inout
#define krun_set_kernel_console c5b7_test_krun_set_kernel_console
#define krun_set_workdir c5b7_test_krun_set_workdir
#define krun_set_exec c5b7_test_krun_set_exec
#define krun_start_enter c5b7_test_krun_start_enter
#define read c5b7_test_read
#define write c5b7_test_write
#define close c5b7_test_close
extern int32_t c5b7_test_krun_create_ctx(void);
extern int32_t c5b7_test_krun_free_ctx(uint32_t);
extern int32_t c5b7_test_krun_set_vm_config(uint32_t, uint8_t, uint32_t);
extern int32_t c5b7_test_krun_disable_implicit_console(uint32_t);
extern int32_t c5b7_test_krun_disable_implicit_init(uint32_t);
extern int32_t c5b7_test_krun_disable_implicit_vsock(uint32_t);
extern int32_t c5b7_test_krun_add_read_only_raw_root_fd(uint32_t, int, uint64_t, uint64_t, uint64_t);
extern int32_t c5b7_test_krun_set_root_disk_remount(uint32_t, const char *, const char *, const char *);
extern int32_t c5b7_test_krun_add_virtio_console_multiport(uint32_t);
extern int32_t c5b7_test_krun_add_console_port_inout(uint32_t, uint32_t, const char *, int, int);
extern int32_t c5b7_test_krun_set_kernel_console(uint32_t, const char *);
extern int32_t c5b7_test_krun_set_workdir(uint32_t, const char *);
extern int32_t c5b7_test_krun_set_exec(uint32_t, const char *, const char *const[], const char *const[]);
extern int32_t c5b7_test_krun_start_enter(uint32_t);
extern ssize_t c5b7_test_read(int, void *, size_t);
extern ssize_t c5b7_test_write(int, const void *, size_t);
extern int c5b7_test_close(int);
#endif

static const char c5b7_root_device[] = "/dev/vda";
static const char c5b7_root_filesystem[] = "ext4";
static const char c5b7_root_options[] = "ro,nosuid,nodev";
static const char c5b7_source_port[] = "capsule.source";
static const char c5b7_input_port[] = "capsule.input";
static const char c5b7_completion_port[] = "capsule.completion";
static const char c5b7_kernel_console[] = "hvc0";
static const char c5b7_workdir[] = "/";
static const char c5b7_executable[] = "/usr/local/libexec/capsule-init.krun";
static const char *const c5b7_argv[] = {c5b7_executable, NULL};
static const char *const c5b7_envp[] = {NULL};

_Static_assert(sizeof(struct c5b7_execution_inputs) == 80, "inputs ABI changed");
_Static_assert(sizeof(struct c5b7_execution_result) == 68, "result ABI changed");

static void initialize_result(struct c5b7_execution_result *result) {
    result->status = C5B7_OK;
    result->failed_effect = 0;
    result->raw_status = 0;
    result->completed_operations = 0;
    result->context_id = -1;
    result->console_id = -1;
    result->context_created = 0;
    result->context_free_attempted = 0;
    result->context_freed = 0;
    result->context_free_status = 0;
    result->context_consumed = 0;
    result->teardown_requested = 0;
    result->absence_requested = 0;
    result->cleanup_requested = 0;
    result->durable_commit_requested = 0;
    result->stored_delivery_requested = 0;
    result->execution_authorized = 0;
}

int32_t c5b7_validate_execution_inputs(
    const struct c5b5_immutable_profile *profile,
    const struct c5b7_execution_inputs *inputs
) {
    int32_t status = c5b5_validate_immutable_profile(profile);
    if (status != C5B5_OK) {
        return status;
    }
    if (inputs == NULL) {
        return C5B7_REFUSE_INPUTS_ABSENT;
    }
    if (inputs->version != C5B7_INPUTS_VERSION ||
        inputs->structure_bytes != sizeof(*inputs)) {
        return C5B7_REFUSE_INPUTS_MISMATCH;
    }
    if (inputs->root_device == 0 || inputs->root_inode == 0 ||
        inputs->root_bytes != profile->root_bytes) {
        return C5B7_REFUSE_ROOT_IDENTITY;
    }
    if ((inputs->source_frame == NULL) != (inputs->source_frame_bytes == 0) ||
        (inputs->input_frame == NULL) != (inputs->input_frame_bytes == 0)) {
        return C5B7_REFUSE_FRAME_ABSENT;
    }
    if (inputs->source_frame_bytes > profile->source_physical_maximum ||
        inputs->input_frame_bytes > profile->input_physical_maximum) {
        return C5B7_REFUSE_FRAME_CAP;
    }
    return C5B7_OK;
}

static int32_t fail(
    struct c5b7_execution_result *result,
    uint32_t status,
    uint32_t effect,
    int32_t raw_status
) {
    result->status = status;
    result->failed_effect = effect;
    result->raw_status = raw_status;
    return (int32_t)status;
}

static void free_live_context(struct c5b7_execution_result *result) {
    if (result->context_created != 0 && result->context_consumed == 0 &&
        result->context_freed == 0 && result->context_id >= 0) {
        result->context_free_attempted = 1;
        result->context_free_status = krun_free_ctx((uint32_t)result->context_id);
        result->context_freed = result->context_free_status == 0;
    }
}

static int32_t krun_zero(
    struct c5b7_execution_result *result,
    uint32_t effect,
    int32_t raw_status
) {
    if (raw_status < 0) {
        free_live_context(result);
        return fail(result, C5B7_REFUSE_KRUN_ERROR, effect, raw_status);
    }
    if (raw_status != 0) {
        free_live_context(result);
        return fail(result, C5B7_REFUSE_KRUN_ERROR, effect, raw_status);
    }
    return C5B7_OK;
}

static int32_t write_all(
    struct c5b7_execution_result *result,
    uint32_t effect,
    int fd,
    const uint8_t *bytes,
    uint64_t length
) {
    uint64_t offset = 0;
    while (offset < length) {
        size_t remaining = (size_t)(length - offset);
        ssize_t count = write(fd, bytes + offset, remaining);
        if (count < 0) {
            free_live_context(result);
            return fail(result, C5B7_REFUSE_WRITE_ERROR, effect, (int32_t)count);
        }
        if (count == 0) {
            free_live_context(result);
            return fail(result, C5B7_REFUSE_WRITE_ZERO, effect, 0);
        }
        if ((uint64_t)count > length - offset) {
            free_live_context(result);
            return fail(result, C5B7_REFUSE_WRITE_ERROR, effect, (int32_t)count);
        }
        offset += (uint64_t)count;
    }
    return C5B7_OK;
}

static int32_t require_start_byte(struct c5b7_execution_result *result, uint32_t effect) {
    uint8_t byte = 0;
    ssize_t count = read(3, &byte, 1);
    if (count < 0) {
        free_live_context(result);
        return fail(result, C5B7_REFUSE_READ_ERROR, effect, (int32_t)count);
    }
    if (count != 1 || byte != (uint8_t)'G') {
        free_live_context(result);
        return fail(result, C5B7_REFUSE_START_BYTE, effect, count == 1 ? (int32_t)byte : (int32_t)count);
    }
    count = read(3, &byte, 1);
    if (count < 0) {
        free_live_context(result);
        return fail(result, C5B7_REFUSE_READ_ERROR, effect, (int32_t)count);
    }
    if (count != 0) {
        free_live_context(result);
        return fail(result, C5B7_REFUSE_START_TRAILING, effect, (int32_t)count);
    }
    return C5B7_OK;
}

static int32_t request(
    const struct c5b7_execution_inputs *inputs,
    struct c5b7_execution_result *result,
    uint32_t request_id,
    uint32_t effect,
    uint64_t value_a,
    uint64_t value_b
) {
    struct c5b7_request_record record = {request_id, effect, value_a, value_b};
    int32_t raw_status;
    if (inputs->request_handler == NULL) {
        free_live_context(result);
        return fail(result, C5B7_REFUSE_REQUEST_HANDLER, effect, 0);
    }
    raw_status = inputs->request_handler(&record, inputs->request_opaque);
    if (raw_status != 0) {
        free_live_context(result);
        return fail(result, C5B7_REFUSE_REQUEST_ERROR, effect, raw_status);
    }
    return C5B7_OK;
}

static int32_t execute_operation(
    const struct c5b7_execution_inputs *inputs,
    const struct c5b5_operation *operation,
    struct c5b7_execution_result *result
) {
    int32_t status;
    int32_t raw_status;
    switch (operation->effect) {
        case C5B5_EFFECT_CREATE_ENDPOINTS:
            return request(inputs, result, C5B7_REQUEST_CREATE_ENDPOINTS,
                operation->effect, 5, 7);
        case C5B5_EFFECT_START_DRAINS:
            return request(inputs, result, C5B7_REQUEST_START_DRAINS,
                operation->effect, UINT64_C(262369), UINT64_C(1000));
        case C5B5_EFFECT_KRUN_CREATE_CTX:
            raw_status = krun_create_ctx();
            if (raw_status < 0) {
                return fail(result, C5B7_REFUSE_KRUN_ERROR, operation->effect, raw_status);
            }
            result->context_id = raw_status;
            result->context_created = 1;
            return C5B7_OK;
        case C5B5_EFFECT_KRUN_SET_VM_CONFIG:
            return krun_zero(result, operation->effect,
                krun_set_vm_config((uint32_t)result->context_id, 1, 256));
        case C5B5_EFFECT_KRUN_DISABLE_IMPLICIT_CONSOLE:
            return krun_zero(result, operation->effect,
                krun_disable_implicit_console((uint32_t)result->context_id));
        case C5B5_EFFECT_KRUN_DISABLE_IMPLICIT_INIT:
            return krun_zero(result, operation->effect,
                krun_disable_implicit_init((uint32_t)result->context_id));
        case C5B5_EFFECT_KRUN_DISABLE_IMPLICIT_VSOCK:
            return krun_zero(result, operation->effect,
                krun_disable_implicit_vsock((uint32_t)result->context_id));
        case C5B5_EFFECT_KRUN_ADD_READ_ONLY_RAW_ROOT_FD:
            return krun_zero(result, operation->effect,
                krun_add_read_only_raw_root_fd((uint32_t)result->context_id, 4,
                    inputs->root_device, inputs->root_inode, inputs->root_bytes));
        case C5B5_EFFECT_KRUN_SET_ROOT_DISK_REMOUNT:
            return krun_zero(result, operation->effect,
                krun_set_root_disk_remount((uint32_t)result->context_id,
                    c5b7_root_device, c5b7_root_filesystem, c5b7_root_options));
        case C5B5_EFFECT_KRUN_ADD_VIRTIO_CONSOLE_MULTIPORT:
            raw_status = krun_add_virtio_console_multiport((uint32_t)result->context_id);
            if (raw_status < 0) {
                free_live_context(result);
                return fail(result, C5B7_REFUSE_KRUN_ERROR, operation->effect, raw_status);
            }
            result->console_id = raw_status;
            return C5B7_OK;
        case C5B5_EFFECT_KRUN_ADD_SOURCE_PORT:
            return krun_zero(result, operation->effect,
                krun_add_console_port_inout((uint32_t)result->context_id,
                    (uint32_t)result->console_id, c5b7_source_port, 5, -1));
        case C5B5_EFFECT_KRUN_ADD_INPUT_PORT:
            return krun_zero(result, operation->effect,
                krun_add_console_port_inout((uint32_t)result->context_id,
                    (uint32_t)result->console_id, c5b7_input_port, 6, -1));
        case C5B5_EFFECT_KRUN_ADD_COMPLETION_PORT:
            return krun_zero(result, operation->effect,
                krun_add_console_port_inout((uint32_t)result->context_id,
                    (uint32_t)result->console_id, c5b7_completion_port, -1, 7));
        case C5B5_EFFECT_KRUN_SET_KERNEL_CONSOLE:
            return krun_zero(result, operation->effect,
                krun_set_kernel_console((uint32_t)result->context_id, c5b7_kernel_console));
        case C5B5_EFFECT_KRUN_SET_WORKDIR:
            return krun_zero(result, operation->effect,
                krun_set_workdir((uint32_t)result->context_id, c5b7_workdir));
        case C5B5_EFFECT_KRUN_SET_EXEC:
            return krun_zero(result, operation->effect,
                krun_set_exec((uint32_t)result->context_id, c5b7_executable,
                    c5b7_argv, c5b7_envp));
        case C5B5_EFFECT_WRITE_READY: {
            const uint8_t ready = (uint8_t)'R';
            return write_all(result, operation->effect, 1, &ready, 1);
        }
        case C5B5_EFFECT_REQUIRE_START_BYTE:
            return require_start_byte(result, operation->effect);
        case C5B5_EFFECT_KRUN_START_ENTER:
            result->context_consumed = 1;
            raw_status = krun_start_enter((uint32_t)result->context_id);
            return fail(result, C5B7_REFUSE_KRUN_ERROR, operation->effect, raw_status);
        case C5B5_EFFECT_WRITE_SOURCE:
            if (inputs->source_frame == NULL || inputs->source_frame_bytes == 0) {
                return fail(result, C5B7_REFUSE_FRAME_ABSENT, operation->effect, 0);
            }
            return write_all(result, operation->effect, 5,
                inputs->source_frame, inputs->source_frame_bytes);
        case C5B5_EFFECT_WRITE_INPUT:
            if (inputs->input_frame == NULL || inputs->input_frame_bytes == 0) {
                return fail(result, C5B7_REFUSE_FRAME_ABSENT, operation->effect, 0);
            }
            return write_all(result, operation->effect, 6,
                inputs->input_frame, inputs->input_frame_bytes);
        case C5B5_EFFECT_CLOSE_INPUT_WRITERS:
            raw_status = close(5);
            if (raw_status != 0) {
                return fail(result, C5B7_REFUSE_CLOSE_ERROR, operation->effect, raw_status);
            }
            raw_status = close(6);
            if (raw_status != 0) {
                return fail(result, C5B7_REFUSE_CLOSE_ERROR, operation->effect, raw_status);
            }
            return C5B7_OK;
        case C5B5_EFFECT_ALLOW_CHILD:
            return request(inputs, result, C5B7_REQUEST_ALLOW_CHILD,
                operation->effect, (uint64_t)'G', 0);
        case C5B5_EFFECT_REQUEST_TEARDOWN:
            status = request(inputs, result, C5B7_REQUEST_TEARDOWN,
                operation->effect, 0, 0);
            if (status == C5B7_OK) result->teardown_requested = 1;
            return status;
        case C5B5_EFFECT_PROVE_ABSENCE:
            status = request(inputs, result, C5B7_REQUEST_PROVE_ABSENCE,
                operation->effect, 0, 0);
            if (status == C5B7_OK) result->absence_requested = 1;
            return status;
        case C5B5_EFFECT_REMOVE_FIXED_ROOT:
            status = request(inputs, result, C5B7_REQUEST_REMOVE_FIXED_ROOT,
                operation->effect, 0, 0);
            if (status == C5B7_OK) result->cleanup_requested = 1;
            return status;
        case C5B5_EFFECT_REQUEST_DURABLE_COMMIT:
            status = request(inputs, result, C5B7_REQUEST_DURABLE_COMMIT,
                operation->effect, 0, 0);
            if (status == C5B7_OK) result->durable_commit_requested = 1;
            return status;
        case C5B5_EFFECT_DELIVER_STORED:
            status = request(inputs, result, C5B7_REQUEST_DELIVER_STORED,
                operation->effect, 0, 0);
            if (status == C5B7_OK) result->stored_delivery_requested = 1;
            return status;
        case C5B5_EFFECT_REPLAY_STORED:
            return request(inputs, result, C5B7_REQUEST_REPLAY_STORED,
                operation->effect, 0, 0);
        case C5B5_EFFECT_FENCE_STORE:
            return request(inputs, result, C5B7_REQUEST_FENCE_STORE,
                operation->effect, 0, 0);
        case C5B5_EFFECT_STOP_MISMATCH:
            return request(inputs, result, C5B7_REQUEST_STOP_MISMATCH,
                operation->effect, 0, 0);
        default:
            return fail(result, C5B7_REFUSE_UNKNOWN_EFFECT, operation->effect, 0);
    }
}

#ifdef C5B7_TEST_DOUBLE
int32_t c5b7_test_execute_operation(
    const struct c5b7_execution_inputs *inputs,
    const struct c5b5_operation *operation,
    struct c5b7_execution_result *result
) {
    initialize_result(result);
    return execute_operation(inputs, operation, result);
}
#endif

int32_t c5b7_execute_controller_actions(
    const struct c5b5_immutable_profile *profile,
    uint64_t controller_actions,
    const struct c5b7_execution_inputs *inputs,
    struct c5b7_execution_result *result
) {
    struct c5b5_plan plan;
    uint32_t index;
    int32_t status;
    if (result == NULL) {
        return C5B7_REFUSE_INPUTS_ABSENT;
    }
    initialize_result(result);
    status = c5b7_validate_execution_inputs(profile, inputs);
    if (status != C5B7_OK) {
        result->status = (uint32_t)status;
        return status;
    }
    status = c5b5_translate_controller_actions(profile, controller_actions, &plan);
    if (status != C5B5_OK) {
        result->status = (uint32_t)status;
        return status;
    }
    for (index = 0; index < plan.count; index++) {
        status = execute_operation(inputs, &plan.operations[index], result);
        if (status != C5B7_OK) {
            return status;
        }
        result->completed_operations++;
    }
    return C5B7_OK;
}
