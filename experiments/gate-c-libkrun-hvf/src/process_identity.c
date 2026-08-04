#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#include <errno.h>
#include <inttypes.h>
#include <libproc.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/proc_info.h>
#include <unistd.h>

static void print_cf_string(const char *label, CFTypeRef value) {
    if (value == NULL || CFGetTypeID(value) != CFStringGetTypeID()) {
        printf("%s=unavailable\n", label);
        return;
    }

    char buffer[512];
    if (!CFStringGetCString((CFStringRef)value, buffer, sizeof(buffer),
                            kCFStringEncodingUTF8)) {
        printf("%s=unavailable\n", label);
        return;
    }
    printf("%s=%s\n", label, buffer);
}

static void print_cf_data_hex(const char *label, CFTypeRef value) {
    if (value == NULL || CFGetTypeID(value) != CFDataGetTypeID()) {
        printf("%s=unavailable\n", label);
        return;
    }

    CFDataRef data = (CFDataRef)value;
    const UInt8 *bytes = CFDataGetBytePtr(data);
    CFIndex length = CFDataGetLength(data);
    printf("%s=", label);
    for (CFIndex index = 0; index < length; index++) {
        printf("%02x", bytes[index]);
    }
    putchar('\n');
}

static int print_code_identity(pid_t pid) {
    int32_t raw_pid = pid;
    CFNumberRef pid_number =
        CFNumberCreate(kCFAllocatorDefault, kCFNumberSInt32Type, &raw_pid);
    if (pid_number == NULL) {
        fprintf(stderr, "CFNumberCreate failed\n");
        return 1;
    }

    const void *keys[] = {kSecGuestAttributePid};
    const void *values[] = {pid_number};
    CFDictionaryRef attributes = CFDictionaryCreate(
        kCFAllocatorDefault, keys, values, 1, &kCFTypeDictionaryKeyCallBacks,
        &kCFTypeDictionaryValueCallBacks);
    CFRelease(pid_number);
    if (attributes == NULL) {
        fprintf(stderr, "CFDictionaryCreate failed\n");
        return 1;
    }

    SecCodeRef code = NULL;
    OSStatus status = SecCodeCopyGuestWithAttributes(
        NULL, attributes, kSecCSDefaultFlags, &code);
    CFRelease(attributes);
    if (status != errSecSuccess) {
        fprintf(stderr, "SecCodeCopyGuestWithAttributes=%d\n", (int)status);
        return 1;
    }

    CFDictionaryRef signing = NULL;
    status = SecCodeCopySigningInformation(code, kSecCSSigningInformation,
                                           &signing);
    if (status != errSecSuccess) {
        fprintf(stderr, "SecCodeCopySigningInformation=%d\n", (int)status);
        CFRelease(code);
        return 1;
    }

    print_cf_string("codeIdentifier",
                    CFDictionaryGetValue(signing, kSecCodeInfoIdentifier));
    print_cf_string("teamIdentifier",
                    CFDictionaryGetValue(signing, kSecCodeInfoTeamIdentifier));
    print_cf_data_hex("cdhash",
                      CFDictionaryGetValue(signing, kSecCodeInfoUnique));

    CFStringRef requirement_text = CFSTR(
        "identifier \"com.capsulecorp.spike.libkrun-runner\" and "
        "anchor apple generic and certificate leaf[subject.OU] = "
        "\"3DDR84M4JS\"");
    SecRequirementRef requirement = NULL;
    status = SecRequirementCreateWithString(requirement_text,
                                            kSecCSDefaultFlags, &requirement);
    if (status == errSecSuccess) {
        status = SecCodeCheckValidity(code, kSecCSStrictValidate, requirement);
        CFRelease(requirement);
    }
    printf("codeRequirement=%s\n",
           status == errSecSuccess ? "valid" : "invalid");

    CFRelease(signing);
    CFRelease(code);
    return status == errSecSuccess ? 0 : 1;
}

static void usage(const char *program) {
    fprintf(stderr, "usage: %s PID\n", program);
}

int main(int argc, char *argv[]) {
    if (argc != 2) {
        usage(argv[0]);
        return 64;
    }

    char *end = NULL;
    errno = 0;
    long parsed = strtol(argv[1], &end, 10);
    if (errno != 0 || end == argv[1] || *end != '\0' || parsed <= 0 ||
        parsed > INT_MAX) {
        usage(argv[0]);
        return 64;
    }

    pid_t pid = (pid_t)parsed;
    struct proc_bsdinfo info;
    memset(&info, 0, sizeof(info));
    int count = proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, sizeof(info));
    if (count != (int)sizeof(info)) {
        perror("proc_pidinfo");
        return 1;
    }

    char path[PROC_PIDPATHINFO_MAXSIZE];
    memset(path, 0, sizeof(path));
    int length = proc_pidpath(pid, path, sizeof(path));
    if (length <= 0) {
        perror("proc_pidpath");
        return 1;
    }

    printf("pid=%d\n", pid);
    printf("ppid=%d\n", info.pbi_ppid);
    printf("startSec=%" PRIu64 "\n", info.pbi_start_tvsec);
    printf("startUsec=%" PRIu64 "\n", info.pbi_start_tvusec);
    printf("uid=%u\n", info.pbi_uid);
    printf("gid=%u\n", info.pbi_gid);
    printf("status=%u\n", info.pbi_status);
    printf("name=%s\n", info.pbi_name);
    printf("path=%s\n", path);
    return print_code_identity(pid);
}
