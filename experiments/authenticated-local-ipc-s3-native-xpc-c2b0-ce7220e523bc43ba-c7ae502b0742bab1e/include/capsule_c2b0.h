#ifndef CAPSULE_C2B0_H
#define CAPSULE_C2B0_H

#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <sys/types.h>
#include <xpc/xpc.h>

#include "capsule_c2b0_contract.generated.h"

typedef enum capsule_c2b0_result {
    CAPSULE_C2B0_OK = 0,
    CAPSULE_C2B0_MALFORMED = 1,
    CAPSULE_C2B0_UNSUPPORTED = 2,
    CAPSULE_C2B0_SCHEMA = 3,
    CAPSULE_C2B0_BINDING = 4,
    CAPSULE_C2B0_AUTHENTICATION = 5,
    CAPSULE_C2B0_CAPACITY = 8,
    CAPSULE_C2B0_LOCAL_FAILURE = 10
} capsule_c2b0_result;

typedef struct capsule_c2b0_current_state {
    uint8_t installation_id[16];
    uint64_t epoch_sequence;
    uint8_t epoch_digest[32];
    uid_t expected_euid;
    au_asid_t expected_asid;
} capsule_c2b0_current_state;

typedef struct capsule_c2b0_copy {
    uint8_t *parts[4];
    size_t lengths[4];
    size_t count;
} capsule_c2b0_copy;

const capsule_c2b0_method_spec *capsule_c2b0_method_named(const char *name);
capsule_c2b0_result capsule_c2b0_validate_outer(
    xpc_object_t message,
    const capsule_c2b0_method_spec *method,
    const capsule_c2b0_current_state *state,
    uint64_t *reason);
capsule_c2b0_result capsule_c2b0_copy_body(
    xpc_object_t message,
    const capsule_c2b0_method_spec *method,
    capsule_c2b0_copy *copy,
    uint64_t *reason);
void capsule_c2b0_copy_destroy(capsule_c2b0_copy *copy);
bool capsule_c2b0_validate_message_sender(xpc_object_t message, SecRequirementRef requirement);
bool capsule_c2b0_connection_matches_session(
    xpc_connection_t connection,
    const capsule_c2b0_current_state *state);
bool capsule_c2b0_execution_gate(int argc, const char *const argv[]);

#endif
