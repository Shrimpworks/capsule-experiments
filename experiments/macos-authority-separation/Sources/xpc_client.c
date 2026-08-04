/* Development-only client for the XPC authority/descriptor probe. */

#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#include <errno.h>
#include <fcntl.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <xpc/xpc.h>

#ifndef BUILD
#define BUILD "unspecified"
#endif

#ifndef SERVICE_NAME
#define SERVICE_NAME "dev.capsule.gate-b.license-free"
#endif

static const char service_name[] = SERVICE_NAME;
static const char expected_bytes[] = "exact-cross-process-xpc-bytes";

int main(int argc, char **argv) {
    bool malformed = false;
    bool wrong_epoch = false;
    const char *server_requirement = NULL;
    for (int index = 1; index < argc; index++) {
        if (strcmp(argv[index], "--malformed") == 0) {
            malformed = true;
        } else if (strcmp(argv[index], "--wrong-epoch") == 0) {
            wrong_epoch = true;
        } else if (strcmp(argv[index], "--server-requirement") == 0 &&
                   index + 1 < argc) {
            server_requirement = argv[++index];
        } else {
            fprintf(stderr,
                    "usage: %s [--malformed] [--wrong-epoch] "
                    "[--server-requirement REQUIREMENT]\n",
                    argv[0]);
            return 64;
        }
    }
    char path[] = "/tmp/capsule-gate-b-xpc.XXXXXX";
    int writable = mkstemp(path);
    if (writable < 0 ||
        write(writable, expected_bytes, sizeof(expected_bytes) - 1) !=
            (ssize_t)(sizeof(expected_bytes) - 1) ||
        close(writable) != 0) {
        unlink(path);
        return 1;
    }
    int content = open(path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
    unlink(path);
    if (content < 0) {
        return 1;
    }

    xpc_connection_t connection = xpc_connection_create_mach_service(
        service_name, NULL, 0);
    if (server_requirement != NULL) {
        int requirement_status = xpc_connection_set_peer_code_signing_requirement(
            connection, server_requirement);
        if (requirement_status != 0) {
            fprintf(stderr, "server peer requirement setter failed: %d\n",
                    requirement_status);
            xpc_release(connection);
            return 65;
        }
    }
    xpc_connection_set_event_handler(connection, ^(xpc_object_t event) {
        (void)event;
    });
    xpc_connection_activate(connection);
    xpc_object_t request = xpc_dictionary_create_empty();
    xpc_dictionary_set_string(
        request, "operation", malformed ? "forged-operation" : "transfer-input");
    xpc_dictionary_set_string(request, "build", BUILD);
    xpc_dictionary_set_string(request, "epoch", wrong_epoch ? "epoch-0" : "epoch-1");
    xpc_dictionary_set_fd(request, "content", content);
    close(content);

    dispatch_semaphore_t reply_ready = dispatch_semaphore_create(0);
    __block xpc_object_t reply = NULL;
    xpc_connection_send_message_with_reply(
        connection, request, NULL, ^(xpc_object_t response) {
            reply = xpc_retain(response);
            dispatch_semaphore_signal(reply_ready);
        });
    xpc_release(request);
    if (dispatch_semaphore_wait(
            reply_ready, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC)) != 0) {
        printf("xpc.timeout=true build=%s\n", BUILD);
        xpc_connection_cancel(connection);
        xpc_release(connection);
        return 3;
    }
    if (reply == NULL || xpc_get_type(reply) == XPC_TYPE_ERROR) {
        const char *description = reply == NULL ? "no reply" :
            xpc_dictionary_get_string(reply, XPC_ERROR_KEY_DESCRIPTION);
        printf("xpc.peer-denied=true build=%s reason=%s\n", BUILD,
               description == NULL ? "unknown" : description);
        if (reply != NULL) {
            xpc_release(reply);
        }
        xpc_connection_cancel(connection);
        xpc_release(connection);
        return 2;
    }

    int64_t status = xpc_dictionary_get_int64(reply, "status");
    bool identity = xpc_dictionary_get_bool(reply, "messageDerivedIdentityValid");
    bool read_only = xpc_dictionary_get_bool(reply, "fdReadOnly");
    bool bytes_exact = xpc_dictionary_get_bool(reply, "bytesExact");
    bool server_identity = server_requirement == NULL;
    if (server_requirement != NULL) {
        CFStringRef requirement_text = CFStringCreateWithCString(
            kCFAllocatorDefault, server_requirement, kCFStringEncodingUTF8);
        SecRequirementRef requirement = NULL;
        SecCodeRef sender = NULL;
        OSStatus requirement_status = requirement_text == NULL
            ? errSecParam
            : SecRequirementCreateWithString(
                requirement_text, kSecCSDefaultFlags, &requirement);
        OSStatus sender_status = requirement_status == errSecSuccess
            ? SecCodeCreateWithXPCMessage(reply, kSecCSDefaultFlags, &sender)
            : requirement_status;
        server_identity = sender_status == errSecSuccess &&
            SecCodeCheckValidity(sender, kSecCSStrictValidate, requirement) == errSecSuccess;
        if (sender != NULL) CFRelease(sender);
        if (requirement != NULL) CFRelease(requirement);
        if (requirement_text != NULL) CFRelease(requirement_text);
    }
    const char *reason = xpc_dictionary_get_string(reply, "reason");
    printf("xpc.status=%lld build=%s identity=%s serverIdentity=%s "
           "fdReadOnly=%s bytesExact=%s reason=%s\n",
           (long long)status, BUILD, identity ? "true" : "false",
           server_identity ? "true" : "false",
           read_only ? "true" : "false", bytes_exact ? "true" : "false",
           reason == NULL ? "none" : reason);
    xpc_release(reply);
    xpc_connection_cancel(connection);
    xpc_release(connection);
    if (malformed) {
        return status == 10 && identity && server_identity ? 0 : 5;
    }
    if (wrong_epoch) {
        return status == 13 && identity && server_identity ? 0 : 7;
    }
    return status == 0 && identity && server_identity && read_only && bytes_exact ? 0 : 6;
}
