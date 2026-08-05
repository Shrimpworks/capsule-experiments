#include <CommonCrypto/CommonDigest.h>
#include <mach-o/dyld.h>
#include <sys/stat.h>
#include <xpc/xpc.h>

#include <fcntl.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#ifndef CAPSULE_ROLE
#error "CAPSULE_ROLE is required"
#endif

#ifndef CAPSULE_POLICY_SHA256
#error "CAPSULE_POLICY_SHA256 is required"
#endif

enum {
    kRequestHeaderBytes = 216,
    kRequestMaximumBytes = 262360,
    kPolicyBytes = 256,
};

static const uint8_t kRequestMagic[8] = {'C', 'S', 'V', '1', 'R', 'E', 'Q', '0'};
static const uint8_t kPolicyMagic[8] = {'C', 'S', 'V', '1', 'P', 'O', 'L', '0'};
static uint8_t g_policy_digest[CC_SHA256_DIGEST_LENGTH];

static uint16_t read_u16(const uint8_t *bytes) {
    return (uint16_t)(((uint16_t)bytes[0] << 8U) | bytes[1]);
}

static uint32_t read_u32(const uint8_t *bytes) {
    return ((uint32_t)bytes[0] << 24U) | ((uint32_t)bytes[1] << 16U) |
           ((uint32_t)bytes[2] << 8U) | bytes[3];
}

static bool all_zero(const uint8_t *bytes, size_t length) {
    uint8_t combined = 0;
    for (size_t index = 0; index < length; index++) {
        combined |= bytes[index];
    }
    return combined == 0;
}

static bool decode_hex_digest(const char *hex, uint8_t output[CC_SHA256_DIGEST_LENGTH]) {
    if (strlen(hex) != CC_SHA256_DIGEST_LENGTH * 2U) {
        return false;
    }
    for (size_t index = 0; index < CC_SHA256_DIGEST_LENGTH; index++) {
        unsigned int value = 0;
        if (sscanf(&hex[index * 2U], "%2x", &value) != 1) {
            return false;
        }
        output[index] = (uint8_t)value;
    }
    return true;
}

static bool validate_policy(const uint8_t *policy) {
    if (read_u32(policy) != kPolicyBytes - 4U ||
        memcmp(&policy[4], kPolicyMagic, sizeof(kPolicyMagic)) != 0 ||
        read_u16(&policy[12]) != 1U || read_u16(&policy[14]) != 3U ||
        read_u16(&policy[16]) != CAPSULE_ROLE || read_u16(&policy[18]) != 0U ||
        read_u16(&policy[20]) != 1U || !all_zero(&policy[22], 106U) ||
        read_u16(&policy[128]) != 1U || read_u16(&policy[130]) != 0U ||
        read_u16(&policy[132]) != 1U || read_u16(&policy[134]) != 2U ||
        read_u32(&policy[136]) != kRequestMaximumBytes || read_u32(&policy[140]) != 248U ||
        read_u32(&policy[144]) != 0U || read_u16(&policy[148]) != 1U ||
        read_u16(&policy[150]) != 0U || read_u32(&policy[152]) != 262608U ||
        !all_zero(&policy[156], 12U) || read_u16(&policy[168]) != 1U ||
        !all_zero(&policy[170], 86U)) {
        return false;
    }
    return true;
}

static bool read_bundled_policy(uint8_t output[kPolicyBytes]) {
    char executable[4096];
    uint32_t executable_length = sizeof(executable);
    if (_NSGetExecutablePath(executable, &executable_length) != 0) {
        return false;
    }
    const char marker[] = "/Contents/MacOS/";
    char *contents = strstr(executable, marker);
    if (contents == NULL) {
        return false;
    }
    *contents = '\0';
    const char suffix[] = "/Contents/Resources/resource-policy-inactive.bin";
    if (strlen(executable) + sizeof(suffix) > sizeof(executable)) {
        return false;
    }
    strcat(executable, suffix);

    int descriptor = open(executable, O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    if (descriptor < 0) {
        return false;
    }
    struct stat status;
    bool valid = fstat(descriptor, &status) == 0 && S_ISREG(status.st_mode) &&
                 status.st_size == kPolicyBytes;
    size_t offset = 0;
    while (valid && offset < kPolicyBytes) {
        ssize_t count = read(descriptor, &output[offset], kPolicyBytes - offset);
        if (count <= 0) {
            valid = false;
        } else {
            offset += (size_t)count;
        }
    }
    uint8_t extra = 0;
    if (valid && read(descriptor, &extra, 1U) != 0) {
        valid = false;
    }
    if (close(descriptor) != 0) {
        valid = false;
    }
    return valid && validate_policy(output);
}

static bool validate_request(const uint8_t *frame, size_t length, const uint8_t policy_digest[32]) {
    if (length < kRequestHeaderBytes || length > kRequestMaximumBytes ||
        read_u32(frame) != length - 4U ||
        memcmp(&frame[4], kRequestMagic, sizeof(kRequestMagic)) != 0 ||
        read_u16(&frame[12]) != 1U || read_u16(&frame[14]) != 1U ||
        read_u16(&frame[16]) != CAPSULE_ROLE) {
        return false;
    }
    for (size_t index = 0; index < 11U; index++) {
        if (read_u16(&frame[18U + index * 2U]) != CAPSULE_ROLE * 0x100U + index + 1U) {
            return false;
        }
    }
    if (!all_zero(&frame[40], 4U) || all_zero(&frame[44], 16U) ||
        all_zero(&frame[60], 16U) || all_zero(&frame[76], 8U) ||
        all_zero(&frame[84], 32U) || all_zero(&frame[120], 32U) ||
        all_zero(&frame[152], 32U) || all_zero(&frame[184], 32U) ||
        read_u32(&frame[116]) != length - kRequestHeaderBytes ||
        memcmp(&frame[184], policy_digest, 32U) != 0) {
        return false;
    }
    uint8_t source_digest[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(&frame[kRequestHeaderBytes], (CC_LONG)(length - kRequestHeaderBytes), source_digest);
    return memcmp(&frame[120], source_digest, sizeof(source_digest)) == 0;
}

static void handle_peer(xpc_connection_t peer) {
    xpc_connection_set_event_handler(peer, ^(xpc_object_t event) {
        if (xpc_get_type(event) != XPC_TYPE_DICTIONARY ||
            xpc_dictionary_get_count(event) != 1U) {
            xpc_connection_cancel(peer);
            return;
        }
        xpc_object_t request = xpc_dictionary_get_value(event, "request");
        if (request == NULL || xpc_get_type(request) != XPC_TYPE_DATA) {
            xpc_connection_cancel(peer);
            return;
        }
        size_t length = xpc_data_get_length(request);
        const uint8_t *bytes = xpc_data_get_bytes_ptr(request);
        if (bytes == NULL || !validate_request(bytes, length, g_policy_digest)) {
            xpc_connection_cancel(peer);
            return;
        }

        /*
         * R2 deliberately bundles the canonical inactive policy. No supported,
         * measured R4 resource values exist yet, so spawning would invent
         * authority. A conforming R2 launcher therefore refuses after exact
         * predecode and never creates a parser child.
         */
        xpc_connection_cancel(peer);
    });
    xpc_connection_resume(peer);
}

static void accept_peer(xpc_connection_t peer) {
    handle_peer(peer);
}

int main(void) {
    uint8_t policy[kPolicyBytes];
    uint8_t expected_digest[CC_SHA256_DIGEST_LENGTH];
    if (!read_bundled_policy(policy) ||
        CC_SHA256(policy, sizeof(policy), g_policy_digest) == NULL ||
        !decode_hex_digest(CAPSULE_POLICY_SHA256, expected_digest) ||
        memcmp(g_policy_digest, expected_digest, sizeof(g_policy_digest)) != 0) {
        return 78;
    }
    xpc_main(accept_peer);
    return 0;
}
