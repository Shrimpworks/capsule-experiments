/*
 * Development-only Gate B installed-service lifecycle probe.
 *
 * This is deliberately not a product protocol implementation. It uses exact
 * code requirements and a constant test epoch to measure launchd/XPC behavior.
 */

#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#include <bsm/libbsm.h>
#include <mach/mach.h>
#include <mach/task_info.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <xpc/xpc.h>

#ifndef COMPONENT_ROLE
#define COMPONENT_ROLE "unspecified"
#endif

#ifndef COMPONENT_BUILD
#define COMPONENT_BUILD "unspecified"
#endif

enum {
    status_ok = 0,
    status_unknown_operation = 10,
    status_message_identity = 11,
    status_epoch_mismatch = 13,
    status_role_mismatch = 14,
};

struct listener_config {
    const char *service_name;
    const char *expected_epoch;
    const char *expected_peer_role;
    const char *requirement_text;
    SecRequirementRef requirement;
    char instance[33];
};

static au_asid_t current_asid(void) {
    audit_token_t token = {{0}};
    mach_msg_type_number_t count = TASK_AUDIT_TOKEN_COUNT;
    kern_return_t status = task_info(
        mach_task_self(), TASK_AUDIT_TOKEN, (task_info_t)&token, &count);
    if (status != KERN_SUCCESS || count != TASK_AUDIT_TOKEN_COUNT) {
        return AU_DEFAUDITSID;
    }
    return audit_token_to_asid(token);
}

static const char *dictionary_string(xpc_object_t dictionary, const char *key) {
    xpc_object_t value = xpc_dictionary_get_value(dictionary, key);
    if (value == NULL || xpc_get_type(value) != XPC_TYPE_STRING) {
        return NULL;
    }
    return xpc_string_get_string_ptr(value);
}

static SecRequirementRef make_requirement(const char *requirement_text) {
    CFStringRef text = CFStringCreateWithCString(
        kCFAllocatorDefault, requirement_text, kCFStringEncodingUTF8);
    SecRequirementRef requirement = NULL;
    OSStatus status = text == NULL
        ? errSecParam
        : SecRequirementCreateWithString(
              text, kSecCSDefaultFlags, &requirement);
    if (text != NULL) {
        CFRelease(text);
    }
    return status == errSecSuccess ? requirement : NULL;
}

static bool message_matches_requirement(
    xpc_object_t message,
    SecRequirementRef requirement
) {
    SecCodeRef sender = NULL;
    OSStatus status = SecCodeCreateWithXPCMessage(
        message, kSecCSDefaultFlags, &sender);
    bool valid = status == errSecSuccess && sender != NULL &&
        SecCodeCheckValidity(
            sender, kSecCSStrictValidate, requirement) == errSecSuccess;
    if (sender != NULL) {
        CFRelease(sender);
    }
    return valid;
}

static void set_common_reply_fields(
    xpc_object_t reply,
    xpc_connection_t peer,
    const struct listener_config *config
) {
    xpc_dictionary_set_string(reply, "serverRole", COMPONENT_ROLE);
    xpc_dictionary_set_string(reply, "serverBuild", COMPONENT_BUILD);
    xpc_dictionary_set_string(reply, "serverInstance", config->instance);
    xpc_dictionary_set_int64(reply, "serverPid", (int64_t)getpid());
    xpc_dictionary_set_int64(reply, "serverEuid", (int64_t)geteuid());
    xpc_dictionary_set_int64(reply, "serverAsid", (int64_t)current_asid());
    xpc_dictionary_set_int64(
        reply, "observedPeerEuid", (int64_t)xpc_connection_get_euid(peer));
    xpc_dictionary_set_int64(
        reply, "observedPeerAsid", (int64_t)xpc_connection_get_asid(peer));
}

static void send_reply(
    xpc_connection_t peer,
    xpc_object_t reply,
    int64_t status,
    const char *reason
) {
    xpc_dictionary_set_int64(reply, "status", status);
    xpc_dictionary_set_string(reply, "reason", reason);
    xpc_connection_send_message(peer, reply);
    xpc_release(reply);
}

static void handle_message(
    xpc_connection_t peer,
    xpc_object_t message,
    const struct listener_config *config
) {
    if (xpc_get_type(message) != XPC_TYPE_DICTIONARY) {
        return;
    }
    xpc_object_t reply = xpc_dictionary_create_reply(message);
    if (reply == NULL) {
        return;
    }
    set_common_reply_fields(reply, peer, config);

    if (!message_matches_requirement(message, config->requirement)) {
        send_reply(
            peer, reply, status_message_identity,
            "message-derived identity invalid");
        return;
    }
    xpc_dictionary_set_bool(reply, "messageDerivedIdentityValid", true);

    const char *peer_role = dictionary_string(message, "peerRole");
    if (peer_role == NULL ||
        strcmp(peer_role, config->expected_peer_role) != 0) {
        send_reply(peer, reply, status_role_mismatch, "peer role mismatch");
        return;
    }

    const char *operation = dictionary_string(message, "operation");
    if (operation == NULL || strcmp(operation, "probe") != 0) {
        send_reply(
            peer, reply, status_unknown_operation, "unknown operation");
        return;
    }

    const char *epoch = dictionary_string(message, "epoch");
    if (epoch == NULL || strcmp(epoch, config->expected_epoch) != 0) {
        send_reply(peer, reply, status_epoch_mismatch, "epoch mismatch");
        return;
    }

    send_reply(peer, reply, status_ok, "accepted");
}

static bool start_listener(
    struct listener_config *config,
    const char *service_name,
    const char *requirement_text,
    const char *expected_peer_role,
    const char *expected_epoch,
    const char *instance
) {
    config->service_name = service_name;
    config->requirement_text = requirement_text;
    config->expected_peer_role = expected_peer_role;
    config->expected_epoch = expected_epoch;
    (void)snprintf(config->instance, sizeof(config->instance), "%s", instance);
    config->requirement = make_requirement(requirement_text);
    if (config->requirement == NULL) {
        fprintf(stderr, "invalid peer requirement for %s\n", service_name);
        return false;
    }

    xpc_connection_t listener = xpc_connection_create_mach_service(
        service_name, NULL, XPC_CONNECTION_MACH_SERVICE_LISTENER);
    if (listener == NULL) {
        fprintf(stderr, "listener creation failed for %s\n", service_name);
        return false;
    }
    int requirement_status = xpc_connection_set_peer_code_signing_requirement(
        listener, requirement_text);
    if (requirement_status != 0) {
        fprintf(
            stderr, "peer requirement setter failed for %s: %d\n",
            service_name, requirement_status);
        xpc_release(listener);
        return false;
    }

    xpc_connection_set_event_handler(listener, ^(xpc_object_t event) {
        if (xpc_get_type(event) != XPC_TYPE_CONNECTION) {
            return;
        }
        xpc_connection_t peer = (xpc_connection_t)event;
        xpc_connection_set_event_handler(peer, ^(xpc_object_t message) {
            handle_message(peer, message, config);
        });
        xpc_connection_activate(peer);
    });
    xpc_connection_activate(listener);
    return true;
}

static void make_instance(char output[33]) {
    uint8_t bytes[16] = {0};
    arc4random_buf(bytes, sizeof(bytes));
    for (size_t index = 0; index < sizeof(bytes); index++) {
        (void)snprintf(
            output + (index * 2), 3, "%02x", (unsigned int)bytes[index]);
    }
}

static int serve(int argc, char **argv) {
    if (argc < 6 || ((argc - 3) % 3) != 0) {
        fprintf(
            stderr,
            "usage: %s serve EPOCH SERVICE REQUIREMENT EXPECTED_ROLE "
            "[SERVICE REQUIREMENT EXPECTED_ROLE ...]\n",
            argv[0]);
        return 64;
    }

    size_t listener_count = (size_t)(argc - 3) / 3;
    struct listener_config *configs = calloc(listener_count, sizeof(*configs));
    if (configs == NULL) {
        return 1;
    }
    char instance[33] = {0};
    make_instance(instance);

    for (size_t index = 0; index < listener_count; index++) {
        size_t argument = 3 + (index * 3);
        if (!start_listener(
                &configs[index], argv[argument], argv[argument + 1],
                argv[argument + 2], argv[2], instance)) {
            return 65;
        }
    }
    printf(
        "service.ready=true role=%s build=%s pid=%d instance=%s "
        "euid=%u asid=%d listeners=%zu\n",
        COMPONENT_ROLE, COMPONENT_BUILD, getpid(), instance,
        (unsigned int)geteuid(), (int)current_asid(), listener_count);
    fflush(stdout);
    dispatch_main();
}

static int client(int argc, char **argv) {
    if (argc != 8) {
        fprintf(
            stderr,
            "usage: %s client SERVICE SERVER_REQUIREMENT EXPECTED_SERVER_ROLE "
            "OPERATION EPOCH EXPECTED_STATUS\n",
            argv[0]);
        return 64;
    }
    const char *service_name = argv[2];
    const char *server_requirement_text = argv[3];
    const char *expected_server_role = argv[4];
    const char *operation = argv[5];
    const char *epoch = argv[6];
    char *status_end = NULL;
    long expected_status = strtol(argv[7], &status_end, 10);
    if (status_end == argv[7] || *status_end != '\0') {
        fprintf(stderr, "invalid expected status\n");
        return 64;
    }

    SecRequirementRef server_requirement =
        make_requirement(server_requirement_text);
    if (server_requirement == NULL) {
        fprintf(stderr, "invalid server requirement\n");
        return 65;
    }
    xpc_connection_t connection = xpc_connection_create_mach_service(
        service_name, NULL, 0);
    if (connection == NULL) {
        CFRelease(server_requirement);
        return 1;
    }
    int requirement_status = xpc_connection_set_peer_code_signing_requirement(
        connection, server_requirement_text);
    if (requirement_status != 0) {
        fprintf(stderr, "server requirement setter failed: %d\n", requirement_status);
        xpc_release(connection);
        CFRelease(server_requirement);
        return 65;
    }
    xpc_connection_set_event_handler(connection, ^(xpc_object_t event) {
        (void)event;
    });
    xpc_connection_activate(connection);

    xpc_object_t request = xpc_dictionary_create_empty();
    xpc_dictionary_set_string(request, "peerRole", COMPONENT_ROLE);
    xpc_dictionary_set_string(request, "peerBuild", COMPONENT_BUILD);
    xpc_dictionary_set_string(request, "operation", operation);
    xpc_dictionary_set_string(request, "epoch", epoch);

    dispatch_semaphore_t reply_ready = dispatch_semaphore_create(0);
    __block xpc_object_t reply = NULL;
    xpc_connection_send_message_with_reply(
        connection, request, NULL, ^(xpc_object_t response) {
            reply = xpc_retain(response);
            dispatch_semaphore_signal(reply_ready);
        });
    xpc_release(request);

    if (dispatch_semaphore_wait(
            reply_ready,
            dispatch_time(DISPATCH_TIME_NOW, 10 * NSEC_PER_SEC)) != 0) {
        printf(
            "result=timeout clientRole=%s clientBuild=%s service=%s\n",
            COMPONENT_ROLE, COMPONENT_BUILD, service_name);
        xpc_connection_cancel(connection);
        xpc_release(connection);
        CFRelease(server_requirement);
        return 3;
    }
    if (reply == NULL || xpc_get_type(reply) == XPC_TYPE_ERROR) {
        const char *description = reply == NULL
            ? "no reply"
            : xpc_dictionary_get_string(reply, XPC_ERROR_KEY_DESCRIPTION);
        printf(
            "result=peer-denied clientRole=%s clientBuild=%s service=%s "
            "reason=%s\n",
            COMPONENT_ROLE, COMPONENT_BUILD, service_name,
            description == NULL ? "unknown" : description);
        if (reply != NULL) {
            xpc_release(reply);
        }
        xpc_connection_cancel(connection);
        xpc_release(connection);
        CFRelease(server_requirement);
        return 2;
    }

    bool server_identity = message_matches_requirement(reply, server_requirement);
    int64_t status = xpc_dictionary_get_int64(reply, "status");
    int64_t server_pid = xpc_dictionary_get_int64(reply, "serverPid");
    int64_t server_euid = xpc_dictionary_get_int64(reply, "serverEuid");
    int64_t server_asid = xpc_dictionary_get_int64(reply, "serverAsid");
    int64_t observed_peer_euid =
        xpc_dictionary_get_int64(reply, "observedPeerEuid");
    int64_t observed_peer_asid =
        xpc_dictionary_get_int64(reply, "observedPeerAsid");
    const char *server_role = dictionary_string(reply, "serverRole");
    const char *server_build = dictionary_string(reply, "serverBuild");
    const char *server_instance = dictionary_string(reply, "serverInstance");
    const char *reason = dictionary_string(reply, "reason");
    bool message_identity =
        xpc_dictionary_get_bool(reply, "messageDerivedIdentityValid");

    uid_t local_euid = geteuid();
    au_asid_t local_asid = current_asid();
    uid_t connection_euid = xpc_connection_get_euid(connection);
    au_asid_t connection_asid = xpc_connection_get_asid(connection);
    bool role_valid = server_role != NULL &&
        strcmp(server_role, expected_server_role) == 0;
    bool euid_valid = observed_peer_euid == (int64_t)local_euid &&
        server_euid == (int64_t)connection_euid &&
        server_euid == (int64_t)local_euid;
    bool asid_valid = observed_peer_asid == (int64_t)local_asid &&
        server_asid == (int64_t)connection_asid &&
        server_asid == (int64_t)local_asid;

    printf(
        "result=reply clientRole=%s clientBuild=%s service=%s status=%lld "
        "serverRole=%s serverBuild=%s serverPid=%lld serverInstance=%s "
        "serverIdentity=%s messageIdentity=%s euidValid=%s asidValid=%s "
        "localEuid=%u localAsid=%d observedPeerEuid=%lld "
        "observedPeerAsid=%lld reason=%s\n",
        COMPONENT_ROLE, COMPONENT_BUILD, service_name, (long long)status,
        server_role == NULL ? "missing" : server_role,
        server_build == NULL ? "missing" : server_build,
        (long long)server_pid,
        server_instance == NULL ? "missing" : server_instance,
        server_identity ? "true" : "false",
        message_identity ? "true" : "false",
        euid_valid ? "true" : "false", asid_valid ? "true" : "false",
        (unsigned int)local_euid, (int)local_asid,
        (long long)observed_peer_euid, (long long)observed_peer_asid,
        reason == NULL ? "missing" : reason);

    bool accepted = status == (int64_t)expected_status && server_identity &&
        message_identity && role_valid && euid_valid && asid_valid &&
        server_instance != NULL;
    xpc_release(reply);
    xpc_connection_cancel(connection);
    xpc_release(connection);
    CFRelease(server_requirement);
    return accepted ? 0 : 6;
}

int main(int argc, char **argv) {
    if (argc < 2) {
        fprintf(stderr, "usage: %s serve|client ...\n", argv[0]);
        return 64;
    }
    if (strcmp(argv[1], "serve") == 0) {
        return serve(argc, argv);
    }
    if (strcmp(argv[1], "client") == 0) {
        return client(argc, argv);
    }
    fprintf(stderr, "unknown mode: %s\n", argv[1]);
    return 64;
}
