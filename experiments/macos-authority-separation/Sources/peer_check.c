/*
 * Development-only Gate B probe. This checks a running process using the
 * Security framework's dynamic-code object. It is not an XPC authenticator and
 * ad-hoc cdhashes are not a replacement for the product Team-ID requirement.
 */

#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#include <errno.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>

int main(int argc, char **argv) {
    if (argc != 3) {
        fprintf(stderr, "usage: %s PID REQUIREMENT\n", argv[0]);
        return 64;
    }

    char *end = NULL;
    errno = 0;
    long parsed_pid = strtol(argv[1], &end, 10);
    if (errno != 0 || end == argv[1] || *end != '\0' || parsed_pid <= 0 ||
        parsed_pid > INT_MAX) {
        fprintf(stderr, "invalid pid\n");
        return 64;
    }

    CFNumberRef pid_number = CFNumberCreate(
        kCFAllocatorDefault, kCFNumberLongType, &parsed_pid);
    if (pid_number == NULL) {
        fprintf(stderr, "pid allocation failed\n");
        return 1;
    }
    const void *keys[] = {kSecGuestAttributePid};
    const void *values[] = {pid_number};
    CFDictionaryRef attributes = CFDictionaryCreate(
        kCFAllocatorDefault, keys, values, 1,
        &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    CFRelease(pid_number);
    if (attributes == NULL) {
        fprintf(stderr, "attribute allocation failed\n");
        return 1;
    }

    SecCodeRef guest = NULL;
    OSStatus status = SecCodeCopyGuestWithAttributes(
        NULL, attributes, kSecCSDefaultFlags, &guest);
    CFRelease(attributes);
    if (status != errSecSuccess) {
        printf("peer.dynamic-status=%d\n", (int)status);
        return 2;
    }

    CFStringRef requirement_text = CFStringCreateWithCString(
        kCFAllocatorDefault, argv[2], kCFStringEncodingUTF8);
    SecRequirementRef requirement = NULL;
    if (requirement_text == NULL) {
        CFRelease(guest);
        fprintf(stderr, "requirement allocation failed\n");
        return 1;
    }
    status = SecRequirementCreateWithString(
        requirement_text, kSecCSDefaultFlags, &requirement);
    CFRelease(requirement_text);
    if (status != errSecSuccess) {
        CFRelease(guest);
        printf("peer.requirement-parse-status=%d\n", (int)status);
        return 3;
    }

    status = SecCodeCheckValidity(guest, kSecCSStrictValidate, requirement);
    printf("peer.validity-status=%d\n", (int)status);
    CFRelease(requirement);
    CFRelease(guest);
    return status == errSecSuccess ? 0 : 4;
}
