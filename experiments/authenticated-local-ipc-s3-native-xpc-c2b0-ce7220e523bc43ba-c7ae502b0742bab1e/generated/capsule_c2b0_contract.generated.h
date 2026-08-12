/* Generated from the exact imported Capsule native-XPC contract. */
#ifndef CAPSULE_C2B0_CONTRACT_GENERATED_H
#define CAPSULE_C2B0_CONTRACT_GENERATED_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct capsule_c2b0_body_field {
    const char *key;
    size_t minimum_bytes;
    size_t maximum_bytes;
    bool nonzero;
} capsule_c2b0_body_field;

typedef struct capsule_c2b0_method_spec {
    const char *method;
    const char *entry_point;
    const char *canonical_service;
    const char *experimental_service;
    const char *expected_role;
    const char *audience;
    const char *purpose;
    uint64_t message_tag;
    uint64_t method_version;
    uint64_t deadline_milliseconds;
    size_t request_key_count;
    size_t application_data_maximum;
    size_t body_field_count;
    capsule_c2b0_body_field body_fields[4];
} capsule_c2b0_method_spec;

#define CAPSULE_C2B0_PROTOCOL_VERSION 0u
#define CAPSULE_C2B0_UINT53_MAX 9007199254740991ULL
#define CAPSULE_C2B0_METHOD_COUNT 3u
#define CAPSULE_C2B0_C4_SUBMIT_APPROVAL_TAG 4u
#define CAPSULE_C2B0_C4_REQUEST_ATTEMPT_TAG 5u
#define CAPSULE_C2B0_REQUIRED_FUTURE_GATE "CAPSULE_C2B_AUTHORIZATION_V1"

static const capsule_c2b0_method_spec CAPSULE_C2B0_METHODS[CAPSULE_C2B0_METHOD_COUNT] = {
    {
        "SubmitMainMJSV0", "SubmitMainMJSV0", "com.capsulecorp.capsule.daemon.cli.v0",
        "com.capsulecorp.experiments.c2s3.ce7220e523bc43ba.c7ae502b0742bab1e.daemon-cli.v0", "internal-alpha-cli",
        "capsule.daemon.local.v0", "capsule.ipc.submit-main-mjs.v0",
        1u, 0u, 10000u,
        10u, 2097152u, 1u,
        {
            { "capsule.job-proposal", 1u, 2097152u, false },
            { NULL, 0u, 0u, false },
            { NULL, 0u, 0u, false },
            { NULL, 0u, 0u, false }
        }
    },
    {
        "RegisterPlanV0", "RegisterPlanV0", "com.capsulecorp.capsule.supervisor.daemon.v0",
        "com.capsulecorp.experiments.c2s3.ce7220e523bc43ba.c7ae502b0742bab1e.supervisor-daemon.v0", "daemon",
        "capsule.execution-supervisor.local.v0", "capsule.ipc.register-plan.v0",
        2u, 0u, 5000u,
        13u, 328337u, 4u,
        {
            { "capsule.execution-plan", 1u, 65536u, false },
            { "capsule.role-bindings", 562u, 562u, false },
            { "capsule.source-manifest", 87u, 95u, false },
            { "capsule.source", 0u, 262144u, false }
        }
    },
    {
        "GetRegisteredPlanV0", "GetRegisteredPlanV0", "com.capsulecorp.capsule.supervisor.broker.v0",
        "com.capsulecorp.experiments.c2s3.ce7220e523bc43ba.c7ae502b0742bab1e.supervisor-broker.v0", "broker",
        "capsule.execution-supervisor.local.v0", "capsule.ipc.get-registered-plan.v0",
        3u, 0u, 2000u,
        10u, 16u, 1u,
        {
            { "capsule.registration-id", 16u, 16u, true },
            { NULL, 0u, 0u, false },
            { NULL, 0u, 0u, false },
            { NULL, 0u, 0u, false }
        }
    }
};

#endif
