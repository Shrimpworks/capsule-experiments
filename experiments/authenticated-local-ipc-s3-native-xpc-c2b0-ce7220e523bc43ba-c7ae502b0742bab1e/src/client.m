#include "capsule_c2b0.h"
#include "capsule_c2b0_fixtures.generated.h"

#include <dispatch/dispatch.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sysexits.h>

#ifndef CAPSULE_C2B0_CLIENT_ROLE
#error CAPSULE_C2B0_CLIENT_ROLE must be defined by the build
#endif

#ifndef CAPSULE_C2B0_CLIENT_ALLOWED_TAG
#error CAPSULE_C2B0_CLIENT_ALLOWED_TAG must be defined by the build
#endif

static const char CAPSULE_C2B0_CLIENT_ROLE_MARKER[] = CAPSULE_C2B0_CLIENT_ROLE;

static const char *argument_value(int argc, const char *const argv[], const char *name) {
    for (int index = 3; index + 1 < argc; index += 2) {
        if (strcmp(argv[index], name) == 0) return argv[index + 1];
    }
    return NULL;
}

static xpc_object_t base_request(const capsule_c2b0_method_spec *method) {
    xpc_object_t request = xpc_dictionary_create(NULL, NULL, 0);
    uint8_t request_id[16];
    uint8_t installation_id[16];
    uint8_t epoch_digest[32];
    memset(request_id, method->message_tag == 1 ? 0x31 : method->message_tag == 2 ? 0x41 : 0x51, sizeof(request_id));
    memset(installation_id, 0x11, sizeof(installation_id));
    memset(epoch_digest, 0x22, sizeof(epoch_digest));
    xpc_dictionary_set_uint64(request, "capsule.protocol-version", 0);
    xpc_dictionary_set_uint64(request, "capsule.method-version", method->method_version);
    xpc_dictionary_set_uint64(request, "capsule.message-tag", method->message_tag);
    xpc_dictionary_set_data(request, "capsule.request-id", request_id, sizeof(request_id));
    xpc_dictionary_set_data(request, "capsule.installation-id", installation_id, sizeof(installation_id));
    xpc_dictionary_set_uint64(request, "capsule.epoch-sequence", 7);
    xpc_dictionary_set_data(request, "capsule.epoch-digest", epoch_digest, sizeof(epoch_digest));
    xpc_dictionary_set_string(request, "capsule.audience", method->audience);
    xpc_dictionary_set_string(request, "capsule.purpose", method->purpose);
    if (method->message_tag == 1) {
        xpc_dictionary_set_data(request, "capsule.job-proposal", CAPSULE_C2B0_JOB_PROPOSAL, CAPSULE_C2B0_JOB_PROPOSAL_LENGTH);
    } else if (method->message_tag == 2) {
        xpc_dictionary_set_data(request, "capsule.execution-plan", CAPSULE_C2B0_EXECUTION_PLAN, CAPSULE_C2B0_EXECUTION_PLAN_LENGTH);
        xpc_dictionary_set_data(request, "capsule.role-bindings", CAPSULE_C2B0_ROLE_BINDINGS, CAPSULE_C2B0_ROLE_BINDINGS_LENGTH);
        xpc_dictionary_set_data(request, "capsule.source-manifest", CAPSULE_C2B0_SOURCE_MANIFEST, CAPSULE_C2B0_SOURCE_MANIFEST_LENGTH);
        xpc_dictionary_set_data(request, "capsule.source", CAPSULE_C2B0_SOURCE, CAPSULE_C2B0_SOURCE_LENGTH);
    } else if (method->message_tag == 3) {
        uint8_t registration_id[16];
        memset(registration_id, 0x77, sizeof(registration_id));
        xpc_dictionary_set_data(request, "capsule.registration-id", registration_id, sizeof(registration_id));
    }
    return request;
}

static bool apply_closed_mutation(xpc_object_t request, const char *mutation) {
    if (strcmp(mutation, "exact") == 0) return true;
    if (strcmp(mutation, "missing-purpose") == 0) {
        xpc_dictionary_set_value(request, "capsule.purpose", NULL);
        return true;
    }
    if (strcmp(mutation, "extra-key") == 0) {
        xpc_dictionary_set_uint64(request, "capsule.extra", 1);
        return true;
    }
    if (strcmp(mutation, "wrong-request-id-type") == 0) {
        xpc_dictionary_set_string(request, "capsule.request-id", "not-data");
        return true;
    }
    if (strcmp(mutation, "zero-request-id") == 0) {
        uint8_t zero[16] = {0};
        xpc_dictionary_set_data(request, "capsule.request-id", zero, sizeof(zero));
        return true;
    }
    if (strcmp(mutation, "unknown-protocol") == 0) {
        xpc_dictionary_set_uint64(request, "capsule.protocol-version", 1);
        return true;
    }
    if (strcmp(mutation, "unknown-method") == 0) {
        xpc_dictionary_set_uint64(request, "capsule.method-version", 1);
        return true;
    }
    if (strncmp(mutation, "foreign-tag-", 12) == 0) {
        char *end = NULL;
        unsigned long tag = strtoul(mutation + 12, &end, 10);
        if (end == mutation + 12 || *end != '\0' || tag < 1 || tag > 5) return false;
        xpc_dictionary_set_uint64(request, "capsule.message-tag", tag);
        return true;
    }
    if (strcmp(mutation, "wrong-audience") == 0) {
        xpc_dictionary_set_string(request, "capsule.audience", "capsule.execution-supervisor");
        return true;
    }
    if (strcmp(mutation, "wrong-purpose") == 0) {
        xpc_dictionary_set_string(request, "capsule.purpose", "capsule.plan.approve");
        return true;
    }
    if (strcmp(mutation, "wrong-installation") == 0) {
        uint8_t other[16];
        memset(other, 0x99, sizeof(other));
        xpc_dictionary_set_data(request, "capsule.installation-id", other, sizeof(other));
        return true;
    }
    if (strcmp(mutation, "wrong-epoch") == 0) {
        uint8_t other[32];
        memset(other, 0x99, sizeof(other));
        xpc_dictionary_set_data(request, "capsule.epoch-digest", other, sizeof(other));
        return true;
    }
    if (strcmp(mutation, "epoch-uint53-plus-one") == 0) {
        xpc_dictionary_set_uint64(request, "capsule.epoch-sequence", CAPSULE_C2B0_UINT53_MAX + 1);
        return true;
    }
    return false;
}

int main(int argc, const char *argv[]) {
    if (!capsule_c2b0_execution_gate(argc, argv)) {
        fputs("C2b execution is blocked: exact future owner authorization gate required.\n", stderr);
        return EX_USAGE;
    }
    const char *method_name = argument_value(argc, argv, "--method");
    const char *mutation = argument_value(argc, argv, "--mutation");
    const capsule_c2b0_method_spec *method = capsule_c2b0_method_named(method_name);
    if (method == NULL || mutation == NULL ||
        (CAPSULE_C2B0_CLIENT_ALLOWED_TAG != 0 && method->message_tag != CAPSULE_C2B0_CLIENT_ALLOWED_TAG)) {
        fputs("C2b client method/mutation is outside this exact role build.\n", stderr);
        return EX_USAGE;
    }
    xpc_object_t request = base_request(method);
    if (request == NULL || !apply_closed_mutation(request, mutation)) {
        fputs("C2b client rejected an unknown mutation.\n", stderr);
        return EX_USAGE;
    }
    dispatch_queue_t queue = dispatch_queue_create(CAPSULE_C2B0_CLIENT_ROLE_MARKER, DISPATCH_QUEUE_SERIAL);
    xpc_connection_t connection = xpc_connection_create_mach_service(method->experimental_service, queue, 0);
    if (connection == NULL) return EX_UNAVAILABLE;
    dispatch_semaphore_t done = dispatch_semaphore_create(0);
    __block int result = EX_UNAVAILABLE;
    xpc_connection_set_event_handler(connection, ^(xpc_object_t event) {
        if (xpc_get_type(event) == XPC_TYPE_ERROR) {
            result = EX_UNAVAILABLE;
            dispatch_semaphore_signal(done);
        }
    });
    xpc_connection_resume(connection);
    xpc_connection_send_message_with_reply(connection, request, queue, ^(xpc_object_t reply) {
        result = xpc_get_type(reply) == XPC_TYPE_DICTIONARY ? EX_OK : EX_UNAVAILABLE;
        dispatch_semaphore_signal(done);
    });
    dispatch_semaphore_wait(done, DISPATCH_TIME_FOREVER);
    xpc_connection_cancel(connection);
    xpc_release(request);
    return result;
}
