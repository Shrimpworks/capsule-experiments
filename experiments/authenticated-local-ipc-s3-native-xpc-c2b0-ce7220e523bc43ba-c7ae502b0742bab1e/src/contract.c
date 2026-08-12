#include "capsule_c2b0.h"

#include <errno.h>
#include <stdlib.h>
#include <string.h>

enum {
    REASON_NONE = 0,
    REASON_KEY_SET = 1,
    REASON_VALUE_TYPE = 2,
    REASON_DATA_WIDTH = 3,
    REASON_DATA_CAP = 4,
    REASON_ZERO_IDENTIFIER = 5,
    REASON_EPOCH_SEQUENCE = 6,
    REASON_PROTOCOL_VERSION = 7,
    REASON_METHOD_VERSION = 8,
    REASON_MESSAGE_TAG = 9,
    REASON_METHOD_BINDING = 10,
    REASON_CURRENT_STATE = 11
};

static bool data_is_nonzero(const uint8_t *bytes, size_t length) {
    uint8_t accumulator = 0;
    for (size_t index = 0; index < length; index++) accumulator |= bytes[index];
    return accumulator != 0;
}

static bool value_has_type(xpc_object_t dictionary, const char *key, xpc_type_t type) {
    xpc_object_t value = xpc_dictionary_get_value(dictionary, key);
    return value != NULL && xpc_get_type(value) == type;
}

static bool data_matches(
    xpc_object_t dictionary,
    const char *key,
    const uint8_t *expected,
    size_t expected_length) {
    size_t actual_length = 0;
    const uint8_t *actual = xpc_dictionary_get_data(dictionary, key, &actual_length);
    return actual != NULL && actual_length == expected_length &&
        memcmp(actual, expected, expected_length) == 0;
}

const capsule_c2b0_method_spec *capsule_c2b0_method_named(const char *name) {
    if (name == NULL) return NULL;
    for (size_t index = 0; index < CAPSULE_C2B0_METHOD_COUNT; index++) {
        if (strcmp(CAPSULE_C2B0_METHODS[index].method, name) == 0) {
            return &CAPSULE_C2B0_METHODS[index];
        }
    }
    return NULL;
}

capsule_c2b0_result capsule_c2b0_validate_outer(
    xpc_object_t message,
    const capsule_c2b0_method_spec *method,
    const capsule_c2b0_current_state *state,
    uint64_t *reason) {
    if (reason != NULL) *reason = REASON_NONE;
    if (message == NULL || method == NULL || state == NULL || xpc_get_type(message) != XPC_TYPE_DICTIONARY) {
        if (reason != NULL) *reason = REASON_VALUE_TYPE;
        return CAPSULE_C2B0_MALFORMED;
    }
    if (xpc_dictionary_get_count(message) != method->request_key_count) {
        if (reason != NULL) *reason = REASON_KEY_SET;
        return CAPSULE_C2B0_MALFORMED;
    }

    const char *uint_keys[] = {
        "capsule.protocol-version", "capsule.method-version", "capsule.message-tag",
        "capsule.epoch-sequence"
    };
    for (size_t index = 0; index < sizeof(uint_keys) / sizeof(uint_keys[0]); index++) {
        if (!value_has_type(message, uint_keys[index], XPC_TYPE_UINT64)) {
            if (reason != NULL) *reason = REASON_VALUE_TYPE;
            return CAPSULE_C2B0_MALFORMED;
        }
    }
    const char *data_keys[] = {
        "capsule.request-id", "capsule.installation-id", "capsule.epoch-digest"
    };
    for (size_t index = 0; index < sizeof(data_keys) / sizeof(data_keys[0]); index++) {
        if (!value_has_type(message, data_keys[index], XPC_TYPE_DATA)) {
            if (reason != NULL) *reason = REASON_VALUE_TYPE;
            return CAPSULE_C2B0_MALFORMED;
        }
    }
    if (!value_has_type(message, "capsule.audience", XPC_TYPE_STRING) ||
        !value_has_type(message, "capsule.purpose", XPC_TYPE_STRING)) {
        if (reason != NULL) *reason = REASON_VALUE_TYPE;
        return CAPSULE_C2B0_MALFORMED;
    }

    if (xpc_dictionary_get_uint64(message, "capsule.protocol-version") != CAPSULE_C2B0_PROTOCOL_VERSION) {
        if (reason != NULL) *reason = REASON_PROTOCOL_VERSION;
        return CAPSULE_C2B0_UNSUPPORTED;
    }
    if (xpc_dictionary_get_uint64(message, "capsule.method-version") != method->method_version) {
        if (reason != NULL) *reason = REASON_METHOD_VERSION;
        return CAPSULE_C2B0_UNSUPPORTED;
    }
    if (xpc_dictionary_get_uint64(message, "capsule.message-tag") != method->message_tag) {
        if (reason != NULL) *reason = REASON_MESSAGE_TAG;
        return CAPSULE_C2B0_UNSUPPORTED;
    }
    if (strcmp(xpc_dictionary_get_string(message, "capsule.audience"), method->audience) != 0 ||
        strcmp(xpc_dictionary_get_string(message, "capsule.purpose"), method->purpose) != 0) {
        if (reason != NULL) *reason = REASON_METHOD_BINDING;
        return CAPSULE_C2B0_AUTHENTICATION;
    }

    size_t request_id_length = 0;
    const uint8_t *request_id = xpc_dictionary_get_data(message, "capsule.request-id", &request_id_length);
    if (request_id == NULL || request_id_length != 16) {
        if (reason != NULL) *reason = REASON_DATA_WIDTH;
        return CAPSULE_C2B0_SCHEMA;
    }
    if (!data_is_nonzero(request_id, request_id_length)) {
        if (reason != NULL) *reason = REASON_ZERO_IDENTIFIER;
        return CAPSULE_C2B0_SCHEMA;
    }
    if (!data_matches(message, "capsule.installation-id", state->installation_id, 16) ||
        !data_matches(message, "capsule.epoch-digest", state->epoch_digest, 32) ||
        xpc_dictionary_get_uint64(message, "capsule.epoch-sequence") != state->epoch_sequence) {
        if (reason != NULL) *reason = REASON_CURRENT_STATE;
        return CAPSULE_C2B0_BINDING;
    }
    if (state->epoch_sequence > CAPSULE_C2B0_UINT53_MAX) {
        if (reason != NULL) *reason = REASON_EPOCH_SEQUENCE;
        return CAPSULE_C2B0_SCHEMA;
    }

    size_t total = 0;
    for (size_t index = 0; index < method->body_field_count; index++) {
        const capsule_c2b0_body_field *field = &method->body_fields[index];
        if (!value_has_type(message, field->key, XPC_TYPE_DATA)) {
            if (reason != NULL) *reason = REASON_VALUE_TYPE;
            return CAPSULE_C2B0_MALFORMED;
        }
        size_t length = 0;
        const uint8_t *bytes = xpc_dictionary_get_data(message, field->key, &length);
        if (bytes == NULL || length < field->minimum_bytes) {
            if (reason != NULL) *reason = REASON_DATA_WIDTH;
            return CAPSULE_C2B0_SCHEMA;
        }
        if (length > field->maximum_bytes || total > method->application_data_maximum - length) {
            if (reason != NULL) *reason = REASON_DATA_CAP;
            return CAPSULE_C2B0_MALFORMED;
        }
        if (field->nonzero && !data_is_nonzero(bytes, length)) {
            if (reason != NULL) *reason = REASON_ZERO_IDENTIFIER;
            return CAPSULE_C2B0_SCHEMA;
        }
        total += length;
    }
    return CAPSULE_C2B0_OK;
}

capsule_c2b0_result capsule_c2b0_copy_body(
    xpc_object_t message,
    const capsule_c2b0_method_spec *method,
    capsule_c2b0_copy *copy,
    uint64_t *reason) {
    if (copy == NULL || method == NULL) {
        if (reason != NULL) *reason = REASON_VALUE_TYPE;
        return CAPSULE_C2B0_LOCAL_FAILURE;
    }
    memset(copy, 0, sizeof(*copy));
    for (size_t index = 0; index < method->body_field_count; index++) {
        size_t length = 0;
        const uint8_t *source = xpc_dictionary_get_data(message, method->body_fields[index].key, &length);
        size_t allocation = length == 0 ? 1 : length;
        copy->parts[index] = malloc(allocation);
        if (copy->parts[index] == NULL) {
            capsule_c2b0_copy_destroy(copy);
            return CAPSULE_C2B0_LOCAL_FAILURE;
        }
        if (length != 0) memcpy(copy->parts[index], source, length);
        copy->lengths[index] = length;
        copy->count++;
    }
    return CAPSULE_C2B0_OK;
}

void capsule_c2b0_copy_destroy(capsule_c2b0_copy *copy) {
    if (copy == NULL) return;
    for (size_t index = 0; index < sizeof(copy->parts) / sizeof(copy->parts[0]); index++) {
        free(copy->parts[index]);
        copy->parts[index] = NULL;
        copy->lengths[index] = 0;
    }
    copy->count = 0;
}

bool capsule_c2b0_validate_message_sender(xpc_object_t message, SecRequirementRef requirement) {
    if (message == NULL || requirement == NULL) return false;
    SecCodeRef code = NULL;
    OSStatus status = SecCodeCreateWithXPCMessage(message, kSecCSDefaultFlags, &code);
    if (status != errSecSuccess || code == NULL) return false;
    status = SecCodeCheckValidity(code, kSecCSCheckAllArchitectures, requirement);
    CFRelease(code);
    return status == errSecSuccess;
}

bool capsule_c2b0_connection_matches_session(
    xpc_connection_t connection,
    const capsule_c2b0_current_state *state) {
    return connection != NULL && state != NULL &&
        xpc_connection_get_euid(connection) == state->expected_euid &&
        xpc_connection_get_asid(connection) == state->expected_asid;
}

bool capsule_c2b0_execution_gate(int argc, const char *const argv[]) {
    return argc >= 3 && strcmp(argv[1], "--authorized-run-gate") == 0 &&
        strcmp(argv[2], CAPSULE_C2B0_REQUIRED_FUTURE_GATE) == 0;
}
