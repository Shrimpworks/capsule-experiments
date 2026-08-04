#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>

int main(void) {
    SecCodeRef code = NULL;
    CFDictionaryRef info = NULL;
    uint32_t status_bits = 0;

    OSStatus status = SecCodeCopySelf(kSecCSDefaultFlags, &code);
    if (status != errSecSuccess) {
        printf("seccode-self-error=%d\n", (int)status);
        return 1;
    }

    status = SecCodeCopySigningInformation(code, kSecCSDynamicInformation, &info);
    if (status != errSecSuccess) {
        printf("seccode-info-error=%d\n", (int)status);
        CFRelease(code);
        return 1;
    }

    CFNumberRef status_number = CFDictionaryGetValue(info, kSecCodeInfoStatus);
    if (status_number == NULL ||
        !CFNumberGetValue(status_number, kCFNumberSInt32Type, &status_bits)) {
        printf("seccode-status-missing=true\n");
        CFRelease(info);
        CFRelease(code);
        return 1;
    }

    printf("seccode.dynamic-valid=%s\n",
           (status_bits & kSecCodeStatusValid) != 0 ? "true" : "false");
    printf("seccode.debugged=%s\n",
           (status_bits & kSecCodeStatusDebugged) != 0 ? "true" : "false");

    CFRelease(info);
    CFRelease(code);
    return 0;
}
