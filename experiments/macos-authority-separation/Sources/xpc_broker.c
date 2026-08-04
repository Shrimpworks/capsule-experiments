/* Development-only XPC authority/descriptor probe. */

#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <xpc/xpc.h>

#ifndef SERVICE_NAME
#define SERVICE_NAME "dev.capsule.gate-b.license-free"
#endif

static const char service_name[] = SERVICE_NAME;
static const char expected_bytes[] = "exact-cross-process-xpc-bytes";
static const char expected_epoch[] = "epoch-1";

static void handle_message(
    xpc_connection_t peer,
    xpc_object_t message,
    SecRequirementRef requirement
) {
    if (xpc_get_type(message) != XPC_TYPE_DICTIONARY) {
        return;
    }
    xpc_object_t reply = xpc_dictionary_create_reply(message);
    if (reply == NULL) {
        return;
    }

    SecCodeRef sender = NULL;
    OSStatus code_status = SecCodeCreateWithXPCMessage(
        message, kSecCSDefaultFlags, &sender);
    if (code_status != errSecSuccess ||
        SecCodeCheckValidity(sender, kSecCSStrictValidate, requirement) != errSecSuccess) {
        if (sender != NULL) {
            CFRelease(sender);
        }
        xpc_dictionary_set_int64(reply, "status", 11);
        xpc_dictionary_set_string(reply, "reason", "message-derived identity invalid");
        xpc_connection_send_message(peer, reply);
        xpc_release(reply);
        return;
    }
    CFRelease(sender);
    xpc_dictionary_set_bool(reply, "messageDerivedIdentityValid", true);

    const char *operation = xpc_dictionary_get_string(message, "operation");
    if (operation == NULL || strcmp(operation, "transfer-input") != 0) {
        xpc_dictionary_set_int64(reply, "status", 10);
        xpc_dictionary_set_string(reply, "reason", "unknown operation");
        xpc_connection_send_message(peer, reply);
        xpc_release(reply);
        return;
    }

    const char *epoch = xpc_dictionary_get_string(message, "epoch");
    if (epoch == NULL || strcmp(epoch, expected_epoch) != 0) {
        xpc_dictionary_set_int64(reply, "status", 13);
        xpc_dictionary_set_string(reply, "reason", "epoch mismatch");
        xpc_connection_send_message(peer, reply);
        xpc_release(reply);
        return;
    }

    int content = xpc_dictionary_dup_fd(message, "content");
    char actual[sizeof(expected_bytes)] = {0};
    ssize_t count = content < 0 ? -1 : read(content, actual, sizeof(expected_bytes) - 1);
    bool read_only = false;
    if (content >= 0) {
        errno = 0;
        read_only = write(content, "x", 1) < 0 && errno == EBADF;
        close(content);
    }
    bool bytes_exact = count == (ssize_t)(sizeof(expected_bytes) - 1) &&
        memcmp(actual, expected_bytes, sizeof(expected_bytes) - 1) == 0;
    xpc_dictionary_set_int64(reply, "status", read_only && bytes_exact ? 0 : 12);
    xpc_dictionary_set_bool(reply, "fdReadOnly", read_only);
    xpc_dictionary_set_bool(reply, "bytesExact", bytes_exact);
    xpc_connection_send_message(peer, reply);
    xpc_release(reply);
    printf("accepted exact peer message: fdReadOnly=%s bytesExact=%s\n",
           read_only ? "true" : "false", bytes_exact ? "true" : "false");
    fflush(stdout);
}

int main(int argc, char **argv) {
    if (argc != 2) {
        fprintf(stderr, "usage: %s CODE_REQUIREMENT\n", argv[0]);
        return 64;
    }
    CFStringRef text = CFStringCreateWithCString(
        kCFAllocatorDefault, argv[1], kCFStringEncodingUTF8);
    SecRequirementRef requirement = NULL;
    if (text == NULL || SecRequirementCreateWithString(
            text, kSecCSDefaultFlags, &requirement) != errSecSuccess) {
        if (text != NULL) {
            CFRelease(text);
        }
        fprintf(stderr, "invalid peer requirement\n");
        return 65;
    }
    CFRelease(text);

    xpc_connection_t listener = xpc_connection_create_mach_service(
        service_name, NULL, XPC_CONNECTION_MACH_SERVICE_LISTENER);
    if (listener == NULL) {
        fprintf(stderr, "listener creation failed\n");
        return 1;
    }
    int status = xpc_connection_set_peer_code_signing_requirement(listener, argv[1]);
    if (status != 0) {
        fprintf(stderr, "peer requirement setter failed: %d\n", status);
        return 1;
    }
    xpc_connection_set_event_handler(listener, ^(xpc_object_t event) {
        if (xpc_get_type(event) != XPC_TYPE_CONNECTION) {
            return;
        }
        xpc_connection_t peer = (xpc_connection_t)event;
        xpc_connection_set_event_handler(peer, ^(xpc_object_t message) {
            handle_message(peer, message, requirement);
        });
        xpc_connection_activate(peer);
    });
    xpc_connection_activate(listener);
    dispatch_main();
}
