#include "CapsuleProbe.h"

#include <mach-o/dyld.h>
#include <xpc/xpc.h>

#include <dispatch/dispatch.h>
#include <fcntl.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#ifndef CAPSULE_OWN_SERVICE
#error "CAPSULE_OWN_SERVICE is required"
#endif

#ifndef CAPSULE_WRONG_SERVICE
#error "CAPSULE_WRONG_SERVICE is required"
#endif

#ifndef CAPSULE_REQUEST_RESOURCE
#error "CAPSULE_REQUEST_RESOURCE is required"
#endif

enum probe_result {
    kProbeTimeout = 1,
    kProbeInterrupted = 2,
    kProbeInvalid = 3,
    kProbeUnexpectedReply = 4,
    kProbeUnexpectedEvent = 5,
    kProbeLocalFailure = 6,
};

struct probe_state {
    dispatch_semaphore_t completed;
    enum probe_result result;
};

static bool read_request(uint8_t **bytes_out, size_t *length_out) {
    char executable[4096];
    uint32_t executable_length = sizeof(executable);
    if (_NSGetExecutablePath(executable, &executable_length) != 0) {
        return false;
    }
    const char marker[] = "/Contents/MacOS/";
    char *contents = strstr(executable, marker);
    if (contents == NULL) {
        return false;
    }
    *contents = '\0';
    const char suffix[] = "/Contents/Resources/CapsuleI1BR3/" CAPSULE_REQUEST_RESOURCE;
    if (strlen(executable) + sizeof(suffix) > sizeof(executable)) {
        return false;
    }
    strcat(executable, suffix);

    int descriptor = open(executable, O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    if (descriptor < 0) {
        return false;
    }
    struct stat status;
    bool valid = fstat(descriptor, &status) == 0 && S_ISREG(status.st_mode) &&
                 status.st_size >= 216 && status.st_size <= 262360;
    uint8_t *bytes = NULL;
    if (valid) {
        bytes = malloc((size_t)status.st_size);
        valid = bytes != NULL;
    }
    size_t offset = 0;
    while (valid && offset < (size_t)status.st_size) {
        ssize_t count = read(descriptor, &bytes[offset], (size_t)status.st_size - offset);
        if (count <= 0) {
            valid = false;
        } else {
            offset += (size_t)count;
        }
    }
    uint8_t extra = 0;
    if (valid && read(descriptor, &extra, 1) != 0) {
        valid = false;
    }
    if (close(descriptor) != 0) {
        valid = false;
    }
    if (!valid) {
        free(bytes);
        return false;
    }
    *bytes_out = bytes;
    *length_out = (size_t)status.st_size;
    return true;
}

static enum probe_result probe_service(const char *service, const char *method,
                                       const uint8_t *request, size_t length) {
    __block struct probe_state state = {
        .completed = dispatch_semaphore_create(0),
        .result = kProbeTimeout,
    };
    if (state.completed == NULL) {
        return kProbeLocalFailure;
    }

    xpc_connection_t connection = xpc_connection_create(service, NULL);
    if (connection == NULL) {
        return kProbeLocalFailure;
    }
    xpc_connection_set_event_handler(connection, ^(xpc_object_t event) {
        if (event == XPC_ERROR_CONNECTION_INTERRUPTED) {
            state.result = kProbeInterrupted;
        } else if (event == XPC_ERROR_CONNECTION_INVALID) {
            state.result = kProbeInvalid;
        } else if (xpc_get_type(event) == XPC_TYPE_DICTIONARY) {
            state.result = kProbeUnexpectedReply;
        } else {
            state.result = kProbeUnexpectedEvent;
        }
        dispatch_semaphore_signal(state.completed);
    });
    xpc_connection_activate(connection);

    xpc_object_t message = xpc_dictionary_create(NULL, NULL, 0);
    xpc_object_t data = xpc_data_create(request, length);
    if (message == NULL || data == NULL) {
        if (message != NULL) xpc_release(message);
        if (data != NULL) xpc_release(data);
        xpc_connection_cancel(connection);
        xpc_release(connection);
        return kProbeLocalFailure;
    }
    xpc_dictionary_set_value(message, method, data);
    xpc_connection_send_message(connection, message);
    xpc_release(data);
    xpc_release(message);

    dispatch_time_t deadline = dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC);
    if (dispatch_semaphore_wait(state.completed, deadline) != 0) {
        state.result = kProbeTimeout;
    }
    xpc_connection_cancel(connection);
    xpc_release(connection);
    return state.result;
}

static const char *result_name(enum probe_result result) {
    switch (result) {
        case kProbeTimeout: return "timeout";
        case kProbeInterrupted: return "connection-interrupted";
        case kProbeInvalid: return "connection-invalid";
        case kProbeUnexpectedReply: return "unexpected-reply";
        case kProbeUnexpectedEvent: return "unexpected-event";
        case kProbeLocalFailure: return "local-failure";
    }
    return "unknown";
}

int capsule_run_source_validator_probe(void) {
    uint8_t *request = NULL;
    size_t request_length = 0;
    if (!read_request(&request, &request_length)) {
        fputs("{\"probe\":\"local-failure\",\"execution\":\"disabled\"}\n", stdout);
        return 70;
    }
    enum probe_result own_cold =
        probe_service(CAPSULE_OWN_SERVICE, "request", request, request_length);
    enum probe_result own = own_cold;
    if (own_cold == kProbeInvalid) {
        usleep(100000);
        own = probe_service(CAPSULE_OWN_SERVICE, "request", request, request_length);
    }
    enum probe_result wrong_method =
        probe_service(CAPSULE_OWN_SERVICE, "wrong-method", request, request_length);
    request[request_length - 1U] ^= 0x01U;
    enum probe_result tampered_request =
        probe_service(CAPSULE_OWN_SERVICE, "request", request, request_length);
    request[request_length - 1U] ^= 0x01U;
    enum probe_result wrong =
        probe_service(CAPSULE_WRONG_SERVICE, "request", request, request_length);
    free(request);

    printf("{\"own_service_cold_start\":\"%s\",\"own_service\":\"%s\",\"wrong_method\":\"%s\","
           "\"tampered_request\":\"%s\",\"wrong_service\":\"%s\","
           "\"parser_spawn\":\"prohibited-by-inactive-policy\",\"execution\":\"disabled\"}\n",
           result_name(own_cold), result_name(own), result_name(wrong_method), result_name(tampered_request),
           result_name(wrong));
    return own == kProbeInterrupted && wrong_method == kProbeInterrupted &&
                   tampered_request == kProbeInterrupted && wrong == kProbeInvalid
               ? 0
               : 71;
}
