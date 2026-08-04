#import <Foundation/Foundation.h>
#import <LocalAuthentication/LocalAuthentication.h>
#import <Security/Security.h>
#import <unistd.h>

static NSString *StatusName(OSStatus status) {
    NSString *message = CFBridgingRelease(SecCopyErrorMessageString(status, NULL));
    return message == nil ? [NSString stringWithFormat:@"%d", status]
                          : [NSString stringWithFormat:@"%d (%@)", status, message];
}

static NSString *ErrorName(CFErrorRef error) {
    if (error == NULL) return @"missing error";
    NSError *object = (__bridge NSError *)error;
    return [NSString stringWithFormat:@"domain=%@ code=%ld description=%@",
                                      object.domain,
                                      (long)object.code,
                                      object.localizedDescription];
}

static void DeleteKey(NSData *tag) {
    NSDictionary *query = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassKey,
        (__bridge id)kSecAttrApplicationTag: tag,
        (__bridge id)kSecUseDataProtectionKeychain: @YES,
    };
    SecItemDelete((__bridge CFDictionaryRef)query);
}

static SecKeyRef CreateSecureEnclaveKey(
    NSData *tag,
    BOOL userPresence,
    BOOL permanent,
    LAContext *context,
    CFErrorRef *error
) {
    SecAccessControlCreateFlags flags = kSecAccessControlPrivateKeyUsage;
    if (userPresence) {
        flags |= kSecAccessControlUserPresence;
    }

    SecAccessControlRef access = SecAccessControlCreateWithFlags(
        NULL,
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        flags,
        error
    );
    if (access == NULL) {
        return NULL;
    }

    NSMutableDictionary *privateAttributes = [@{
        (__bridge id)kSecAttrIsPermanent: @(permanent),
        (__bridge id)kSecAttrAccessControl: (__bridge id)access,
    } mutableCopy];
    if (permanent) {
        privateAttributes[(__bridge id)kSecAttrApplicationTag] = tag;
    }

    NSMutableDictionary *attributes = [@{
        (__bridge id)kSecAttrKeyType: (__bridge id)kSecAttrKeyTypeECSECPrimeRandom,
        (__bridge id)kSecAttrKeySizeInBits: @256,
        (__bridge id)kSecAttrTokenID: (__bridge id)kSecAttrTokenIDSecureEnclave,
        (__bridge id)kSecPrivateKeyAttrs: privateAttributes,
    } mutableCopy];
    if (context != nil) {
        attributes[(__bridge id)kSecUseAuthenticationContext] = context;
    }
    SecKeyRef key = SecKeyCreateRandomKey((__bridge CFDictionaryRef)attributes, error);
    CFRelease(access);
    return key;
}

static OSStatus RetrieveKey(NSData *tag, LAContext *context, SecKeyRef *key) {
    NSDictionary *query = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassKey,
        (__bridge id)kSecAttrApplicationTag: tag,
        (__bridge id)kSecReturnRef: @YES,
        (__bridge id)kSecUseDataProtectionKeychain: @YES,
        (__bridge id)kSecUseAuthenticationContext: context,
    };
    CFTypeRef result = NULL;
    OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
    *key = (SecKeyRef)result;
    return status;
}

static void ProbeExplicitUnauthorizedAccessGroup(NSString *service) {
    NSDictionary *query = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrService: service,
        (__bridge id)kSecAttrAccount: @"gate-b",
        (__bridge id)kSecAttrAccessGroup: @"invalid.example.gate-b",
        (__bridge id)kSecValueData: [@"not-secret" dataUsingEncoding:NSUTF8StringEncoding],
        (__bridge id)kSecUseDataProtectionKeychain: @YES,
    };
    OSStatus status = SecItemAdd((__bridge CFDictionaryRef)query, NULL);
    printf("access-group.unentitled-add=%s\n", StatusName(status).UTF8String);

    NSDictionary *cleanup = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrService: service,
        (__bridge id)kSecUseDataProtectionKeychain: @YES,
    };
    SecItemDelete((__bridge CFDictionaryRef)cleanup);
}

int main(void) {
    @autoreleasepool {
        NSData *evidenceTag = [[NSString stringWithFormat:@"dev.capsule.gate-b.evidence.%d", getpid()]
            dataUsingEncoding:NSUTF8StringEncoding];
        NSData *approvalTag = [[NSString stringWithFormat:@"dev.capsule.gate-b.approval.%d", getpid()]
            dataUsingEncoding:NSUTF8StringEncoding];
        NSString *deniedService = [NSString stringWithFormat:@"dev.capsule.gate-b.denied.%d", getpid()];

        DeleteKey(evidenceTag);
        DeleteKey(approvalTag);
        ProbeExplicitUnauthorizedAccessGroup(deniedService);

        CFErrorRef error = NULL;
        SecKeyRef evidenceKey = CreateSecureEnclaveKey(evidenceTag, NO, YES, nil, &error);
        if (evidenceKey == NULL) {
            printf("secure-enclave.evidence-created=false error=%s\n",
                   ErrorName(error).UTF8String);
            if (error != NULL) CFRelease(error);
        } else {
            printf("secure-enclave.evidence-created=true\n");
            CFDictionaryRef attributes = SecKeyCopyAttributes(evidenceKey);
            NSDictionary *attributesObject = CFBridgingRelease(attributes);
            printf("secure-enclave.evidence-token=%s\n",
                   [attributesObject[(__bridge id)kSecAttrTokenID] description].UTF8String);
            printf("secure-enclave.evidence-key-size=%s\n",
                   [attributesObject[(__bridge id)kSecAttrKeySizeInBits] description].UTF8String);

            CFErrorRef exportError = NULL;
            CFDataRef exported = SecKeyCopyExternalRepresentation(evidenceKey, &exportError);
            printf("secure-enclave.private-exported=%s\n", exported == NULL ? "false" : "true");
            if (exported != NULL) CFRelease(exported);
            if (exportError != NULL) {
                printf("secure-enclave.private-export-error=%s\n",
                       ErrorName(exportError).UTF8String);
                CFRelease(exportError);
            }

            NSData *digest = [NSData dataWithBytes:(uint8_t[32]){0x42} length:32];
            CFErrorRef signError = NULL;
            CFDataRef signature = SecKeyCreateSignature(
                evidenceKey,
                kSecKeyAlgorithmECDSASignatureDigestX962SHA256,
                (__bridge CFDataRef)digest,
                &signError
            );
            printf("secure-enclave.evidence-noninteractive-sign=%s\n",
                   signature == NULL ? "false" : "true");
            if (signature != NULL) CFRelease(signature);
            if (signError != NULL) {
                printf("secure-enclave.evidence-sign-error=%s\n",
                       ErrorName(signError).UTF8String);
                CFRelease(signError);
            }
            CFRelease(evidenceKey);
        }

        error = NULL;
        SecKeyRef ephemeralEvidenceKey = CreateSecureEnclaveKey(evidenceTag, NO, NO, nil, &error);
        if (ephemeralEvidenceKey == NULL) {
            printf("secure-enclave.ephemeral-evidence-created=false error=%s\n",
                   ErrorName(error).UTF8String);
            if (error != NULL) CFRelease(error);
        } else {
            printf("secure-enclave.ephemeral-evidence-created=true\n");
            NSData *digest = [NSData dataWithBytes:(uint8_t[32]){0x33} length:32];
            CFErrorRef signError = NULL;
            CFDataRef signature = SecKeyCreateSignature(
                ephemeralEvidenceKey,
                kSecKeyAlgorithmECDSASignatureDigestX962SHA256,
                (__bridge CFDataRef)digest,
                &signError
            );
            printf("secure-enclave.ephemeral-evidence-sign=%s\n",
                   signature == NULL ? "false" : "true");
            if (signature != NULL) CFRelease(signature);
            if (signError != NULL) {
                printf("secure-enclave.ephemeral-evidence-sign-error=%s\n",
                       ErrorName(signError).UTF8String);
                CFRelease(signError);
            }
            CFRelease(ephemeralEvidenceKey);
        }

        error = NULL;
        SecKeyRef approvalKey = CreateSecureEnclaveKey(approvalTag, YES, YES, nil, &error);
        if (approvalKey == NULL) {
            printf("secure-enclave.approval-created=false error=%s\n",
                   ErrorName(error).UTF8String);
            if (error != NULL) CFRelease(error);
        } else {
            printf("secure-enclave.approval-created=true\n");
            CFRelease(approvalKey);

            LAContext *context = [[LAContext alloc] init];
            context.interactionNotAllowed = YES;
            context.localizedReason = @"Gate B noninteractive denial probe";
            SecKeyRef retrieved = NULL;
            OSStatus status = RetrieveKey(approvalTag, context, &retrieved);
            printf("secure-enclave.approval-noninteractive-retrieve=%s\n",
                   StatusName(status).UTF8String);
            if (retrieved != NULL) {
                CFErrorRef signError = NULL;
                NSData *digest = [NSData dataWithBytes:(uint8_t[32]){0x24} length:32];
                CFDataRef signature = SecKeyCreateSignature(
                    retrieved,
                    kSecKeyAlgorithmECDSASignatureDigestX962SHA256,
                    (__bridge CFDataRef)digest,
                    &signError
                );
                printf("secure-enclave.approval-noninteractive-sign=%s\n",
                       signature == NULL ? "false" : "true");
                if (signature != NULL) CFRelease(signature);
                if (signError != NULL) {
                    printf("secure-enclave.approval-sign-error=%s\n",
                           ErrorName(signError).UTF8String);
                    CFRelease(signError);
                }
                CFRelease(retrieved);
            }
        }

        LAContext *noninteractiveContext = [[LAContext alloc] init];
        noninteractiveContext.interactionNotAllowed = YES;
        noninteractiveContext.localizedReason = @"Gate B noninteractive denial probe";
        error = NULL;
        SecKeyRef ephemeralApprovalKey = CreateSecureEnclaveKey(
            approvalTag,
            YES,
            NO,
            noninteractiveContext,
            &error
        );
        if (ephemeralApprovalKey == NULL) {
            printf("secure-enclave.ephemeral-approval-created=false error=%s\n",
                   ErrorName(error).UTF8String);
            if (error != NULL) CFRelease(error);
        } else {
            printf("secure-enclave.ephemeral-approval-created=true\n");
            NSData *digest = [NSData dataWithBytes:(uint8_t[32]){0x55} length:32];
            CFErrorRef signError = NULL;
            CFDataRef signature = SecKeyCreateSignature(
                ephemeralApprovalKey,
                kSecKeyAlgorithmECDSASignatureDigestX962SHA256,
                (__bridge CFDataRef)digest,
                &signError
            );
            printf("secure-enclave.ephemeral-approval-noninteractive-sign=%s\n",
                   signature == NULL ? "false" : "true");
            if (signature != NULL) CFRelease(signature);
            if (signError != NULL) {
                printf("secure-enclave.ephemeral-approval-sign-error=%s\n",
                       ErrorName(signError).UTF8String);
                CFRelease(signError);
            }
            CFRelease(ephemeralApprovalKey);
        }

        DeleteKey(evidenceTag);
        DeleteKey(approvalTag);
    }
    return 0;
}
