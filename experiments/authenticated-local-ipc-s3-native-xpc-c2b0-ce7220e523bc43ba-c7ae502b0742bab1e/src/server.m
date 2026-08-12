#include "capsule_c2b0.h"
#include "capsule_c2b0_fixtures.generated.h"

#include <dispatch/dispatch.h>
#include <errno.h>
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sysexits.h>

typedef struct service_context {
    const capsule_c2b0_method_spec *method;
    capsule_c2b0_current_state state;
    SecRequirementRef requirement;
    xpc_connection_t listener;
} service_context;

static bool parse_unsigned(const char *text, uint64_t maximum, uint64_t *value) {
    if (text == NULL || text[0] == '\0') return false;
    char *end = NULL;
    errno = 0;
    unsigned long long parsed = strtoull(text, &end, 10);
    if (errno != 0 || end == text || *end != '\0' || parsed > maximum) return false;
    *value = (uint64_t)parsed;
    return true;
}

static const char *argument_value(int argc, const char *const argv[], const char *name) {
    for (int index = 3; index + 1 < argc; index += 2) {
        if (strcmp(argv[index], name) == 0) return argv[index + 1];
    }
    return NULL;
}

static SecRequirementRef requirement_from_text(const char *text) {
    if (text == NULL) return NULL;
    CFStringRef string = CFStringCreateWithCString(kCFAllocatorDefault, text, kCFStringEncodingUTF8);
    if (string == NULL) return NULL;
    SecRequirementRef requirement = NULL;
    OSStatus status = SecRequirementCreateWithString(string, kSecCSDefaultFlags, &requirement);
    CFRelease(string);
    return status == errSecSuccess ? requirement : NULL;
}

static void add_reply_common(
    xpc_object_t reply,
    xpc_object_t request,
    const capsule_c2b0_method_spec *method,
    uint64_t status,
    uint64_t reason) {
    size_t request_id_length = 0;
    const void *request_id = xpc_dictionary_get_data(request, "capsule.request-id", &request_id_length);
    xpc_dictionary_set_uint64(reply, "capsule.protocol-version", CAPSULE_C2B0_PROTOCOL_VERSION);
    xpc_dictionary_set_uint64(reply, "capsule.method-version", method->method_version);
    xpc_dictionary_set_uint64(reply, "capsule.message-tag", method->message_tag);
    xpc_dictionary_set_data(reply, "capsule.request-id", request_id, request_id_length);
    xpc_dictionary_set_uint64(reply, "capsule.status", status);
    xpc_dictionary_set_uint64(reply, "capsule.reason", reason);
}

static xpc_object_t success_reply(
    xpc_object_t request,
    const capsule_c2b0_method_spec *method) {
    xpc_object_t reply = xpc_dictionary_create_reply(request);
    if (reply == NULL) return NULL;
    add_reply_common(reply, request, method, 0, 0);
    if (method->message_tag == 1) {
        uint8_t registration_id[16];
        memset(registration_id, 0x77, sizeof(registration_id));
        xpc_dictionary_set_data(reply, "capsule.registration-id", registration_id, sizeof(registration_id));
    } else if (method->message_tag == 2) {
        xpc_dictionary_set_data(
            reply,
            "capsule.plan-registration",
            CAPSULE_C2B0_PLAN_REGISTRATION,
            CAPSULE_C2B0_PLAN_REGISTRATION_LENGTH);
    } else if (method->message_tag == 3) {
        xpc_dictionary_set_data(reply, "capsule.execution-plan", CAPSULE_C2B0_EXECUTION_PLAN, CAPSULE_C2B0_EXECUTION_PLAN_LENGTH);
        xpc_dictionary_set_data(reply, "capsule.role-bindings", CAPSULE_C2B0_ROLE_BINDINGS, CAPSULE_C2B0_ROLE_BINDINGS_LENGTH);
        xpc_dictionary_set_data(reply, "capsule.plan-registration", CAPSULE_C2B0_PLAN_REGISTRATION, CAPSULE_C2B0_PLAN_REGISTRATION_LENGTH);
        xpc_dictionary_set_data(reply, "capsule.source-manifest", CAPSULE_C2B0_SOURCE_MANIFEST, CAPSULE_C2B0_SOURCE_MANIFEST_LENGTH);
        xpc_dictionary_set_data(reply, "capsule.source", CAPSULE_C2B0_SOURCE, CAPSULE_C2B0_SOURCE_LENGTH);
    }
    return reply;
}

static void handle_message(service_context *context, xpc_connection_t peer, xpc_object_t message) {
    uint64_t reason = 0;
    capsule_c2b0_result result = CAPSULE_C2B0_AUTHENTICATION;
    if (xpc_get_type(message) == XPC_TYPE_DICTIONARY &&
        capsule_c2b0_validate_message_sender(message, context->requirement)) {
        result = capsule_c2b0_validate_outer(message, context->method, &context->state, &reason);
    }
    if (result != CAPSULE_C2B0_OK) {
        xpc_object_t reply = xpc_dictionary_create_reply(message);
        if (reply != NULL) {
            add_reply_common(reply, message, context->method, (uint64_t)result, reason);
            xpc_connection_send_message(peer, reply);
            xpc_release(reply);
        }
        return;
    }

    capsule_c2b0_copy copy;
    result = capsule_c2b0_copy_body(message, context->method, &copy, &reason);
    if (result != CAPSULE_C2B0_OK) abort();
    xpc_object_t reply = success_reply(message, context->method);
    capsule_c2b0_copy_destroy(&copy);
    if (reply == NULL) abort();
    xpc_connection_send_message(peer, reply);
    xpc_release(reply);
}

static bool activate_service(service_context *context, const char *requirement_text) {
    context->requirement = requirement_from_text(requirement_text);
    if (context->requirement == NULL) return false;
    dispatch_queue_t queue = dispatch_queue_create(context->method->experimental_service, DISPATCH_QUEUE_SERIAL);
    if (queue == NULL) return false;
    context->listener = xpc_connection_create_mach_service(
        context->method->experimental_service,
        queue,
        XPC_CONNECTION_MACH_SERVICE_LISTENER);
    if (context->listener == NULL) return false;
    if (xpc_connection_set_peer_code_signing_requirement(context->listener, requirement_text) != 0) {
        return false;
    }
    xpc_connection_set_event_handler(context->listener, ^(xpc_object_t event) {
        if (xpc_get_type(event) != XPC_TYPE_CONNECTION) return;
        xpc_connection_t peer = (xpc_connection_t)event;
        if (!capsule_c2b0_connection_matches_session(peer, &context->state)) {
            xpc_connection_cancel(peer);
            return;
        }
        xpc_connection_set_event_handler(peer, ^(xpc_object_t message) {
            handle_message(context, peer, message);
        });
        xpc_connection_resume(peer);
    });
    xpc_connection_resume(context->listener);
    return true;
}

int main(int argc, const char *argv[]) {
    if (!capsule_c2b0_execution_gate(argc, argv)) {
        fputs("C2b execution is blocked: exact future owner authorization gate required.\n", stderr);
        return EX_USAGE;
    }
    const char *cli_requirement = argument_value(argc, argv, "--cli-requirement");
    const char *daemon_requirement = argument_value(argc, argv, "--daemon-requirement");
    const char *broker_requirement = argument_value(argc, argv, "--broker-requirement");
    const char *euid_text = argument_value(argc, argv, "--expected-euid");
    const char *asid_text = argument_value(argc, argv, "--expected-asid");
    uint64_t euid = 0;
    uint64_t asid = 0;
    if (cli_requirement == NULL || daemon_requirement == NULL || broker_requirement == NULL ||
        !parse_unsigned(euid_text, UINT32_MAX, &euid) ||
        !parse_unsigned(asid_text, UINT32_MAX, &asid)) {
        fputs("C2b server arguments are incomplete or out of range.\n", stderr);
        return EX_USAGE;
    }

    service_context contexts[CAPSULE_C2B0_METHOD_COUNT];
    memset(contexts, 0, sizeof(contexts));
    const char *requirements[] = {cli_requirement, daemon_requirement, broker_requirement};
    for (size_t index = 0; index < CAPSULE_C2B0_METHOD_COUNT; index++) {
        contexts[index].method = &CAPSULE_C2B0_METHODS[index];
        memset(contexts[index].state.installation_id, 0x11, sizeof(contexts[index].state.installation_id));
        contexts[index].state.epoch_sequence = 7;
        memset(contexts[index].state.epoch_digest, 0x22, sizeof(contexts[index].state.epoch_digest));
        contexts[index].state.expected_euid = (uid_t)euid;
        contexts[index].state.expected_asid = (au_asid_t)asid;
        if (!activate_service(&contexts[index], requirements[index])) {
            fputs("C2b server failed closed before completing listener activation.\n", stderr);
            return EX_UNAVAILABLE;
        }
    }
    dispatch_main();
}
