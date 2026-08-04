#import <CommonCrypto/CommonDigest.h>
#import <Foundation/Foundation.h>
#import <LocalAuthentication/LocalAuthentication.h>
#import <Security/Security.h>

#ifndef BUILD_MARKER
#define BUILD_MARKER "unknown"
#endif

static NSString *HexData(NSData *data) {
    const unsigned char *bytes = data.bytes;
    NSMutableString *result = [NSMutableString stringWithCapacity:data.length * 2];
    for (NSUInteger index = 0; index < data.length; index++) {
        [result appendFormat:@"%02x", bytes[index]];
    }
    return result;
}

static NSString *SHA256(NSData *data) {
    unsigned char output[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(data.bytes, (CC_LONG)data.length, output);
    return HexData([NSData dataWithBytes:output length:sizeof(output)]);
}

static void PrintStatus(NSString *name, OSStatus status) {
    NSString *message = CFBridgingRelease(SecCopyErrorMessageString(status, NULL));
    printf("%s.status=%d message=%s\n", name.UTF8String, (int)status,
           message == nil ? "unknown" : message.UTF8String);
}

static NSData *KeyTag(NSString *tag) {
    return [tag dataUsingEncoding:NSUTF8StringEncoding];
}

static NSDictionary *KeyQuery(NSString *group, NSString *tag) {
    return @{
        (__bridge id)kSecClass: (__bridge id)kSecClassKey,
        (__bridge id)kSecAttrApplicationTag: KeyTag(tag),
        (__bridge id)kSecAttrAccessGroup: group,
        (__bridge id)kSecUseDataProtectionKeychain: @YES,
    };
}

static SecKeyRef CopyKey(NSString *group, NSString *tag, OSStatus *statusOut) {
    LAContext *context = [[LAContext alloc] init];
    context.interactionNotAllowed = YES;
    NSMutableDictionary *query = [KeyQuery(group, tag) mutableCopy];
    query[(__bridge id)kSecReturnRef] = @YES;
    query[(__bridge id)kSecUseAuthenticationContext] = context;
    CFTypeRef result = NULL;
    OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
    if (statusOut != NULL) *statusOut = status;
    if (status != errSecSuccess || result == NULL) {
        if (result != NULL) CFRelease(result);
        return NULL;
    }
    return (SecKeyRef)result;
}

static NSString *KeyFingerprint(SecKeyRef privateKey) {
    SecKeyRef publicKey = SecKeyCopyPublicKey(privateKey);
    if (publicKey == NULL) return nil;
    CFErrorRef error = NULL;
    CFDataRef representation = SecKeyCopyExternalRepresentation(publicKey, &error);
    CFRelease(publicKey);
    if (representation == NULL) {
        if (error != NULL) CFRelease(error);
        return nil;
    }
    NSData *data = CFBridgingRelease(representation);
    return SHA256(data);
}

static int FingerprintKey(NSString *group, NSString *tag) {
    OSStatus status = errSecSuccess;
    SecKeyRef key = CopyKey(group, tag, &status);
    PrintStatus(@"key.lookup", status);
    if (key == NULL) {
        printf("key.fingerprint=false\n");
        return 0;
    }
    NSString *fingerprint = KeyFingerprint(key);
    printf("key.fingerprint=%s\n", fingerprint == nil ? "false" : fingerprint.UTF8String);
    CFRelease(key);
    return 0;
}

static int EnsureKey(NSString *group, NSString *tag, NSString *mode) {
    BOOL userPresence = [mode isEqualToString:@"approval"];
    if (!userPresence && ![mode isEqualToString:@"evidence"]) {
        printf("key.ensure=false error=invalid-mode\n");
        return 0;
    }
    OSStatus lookupStatus = errSecSuccess;
    SecKeyRef existing = CopyKey(group, tag, &lookupStatus);
    if (existing != NULL) {
        NSString *fingerprint = KeyFingerprint(existing);
        printf("key.ensure=true created=false fingerprint=%s mode=%s\n",
               fingerprint == nil ? "false" : fingerprint.UTF8String, mode.UTF8String);
        CFRelease(existing);
        return 0;
    }
    if (lookupStatus != errSecItemNotFound) {
        PrintStatus(@"key.ensure.lookup", lookupStatus);
        printf("key.ensure=false stage=lookup\n");
        return 0;
    }

    SecAccessControlCreateFlags flags = kSecAccessControlPrivateKeyUsage;
    if (userPresence) flags |= kSecAccessControlUserPresence;
    CFErrorRef accessError = NULL;
    SecAccessControlRef access = SecAccessControlCreateWithFlags(
        NULL, kSecAttrAccessibleWhenUnlockedThisDeviceOnly, flags, &accessError);
    if (access == NULL) {
        NSError *error = CFBridgingRelease(accessError);
        printf("key.ensure=false stage=access-control error=%s\n",
               error == nil ? "unknown" : error.localizedDescription.UTF8String);
        return 0;
    }
    NSDictionary *privateAttributes = @{
        (__bridge id)kSecAttrIsPermanent: @YES,
        (__bridge id)kSecAttrApplicationTag: KeyTag(tag),
        (__bridge id)kSecAttrAccessGroup: group,
        (__bridge id)kSecAttrAccessControl: (__bridge id)access,
    };
    NSDictionary *attributes = @{
        (__bridge id)kSecAttrKeyType: (__bridge id)kSecAttrKeyTypeECSECPrimeRandom,
        (__bridge id)kSecAttrKeySizeInBits: @256,
        (__bridge id)kSecAttrTokenID: (__bridge id)kSecAttrTokenIDSecureEnclave,
        (__bridge id)kSecPrivateKeyAttrs: privateAttributes,
    };
    CFErrorRef keyError = NULL;
    SecKeyRef key = SecKeyCreateRandomKey((__bridge CFDictionaryRef)attributes, &keyError);
    CFRelease(access);
    if (key == NULL) {
        NSError *error = CFBridgingRelease(keyError);
        printf("key.ensure=false stage=create error-domain=%s error-code=%ld description=%s\n",
               error == nil ? "missing" : error.domain.UTF8String,
               (long)(error == nil ? 0 : error.code),
               error == nil ? "unknown" : error.localizedDescription.UTF8String);
        return 0;
    }
    NSString *fingerprint = KeyFingerprint(key);
    NSDictionary *keyAttributes = CFBridgingRelease(SecKeyCopyAttributes(key));
    NSString *token = [keyAttributes[(__bridge id)kSecAttrTokenID] description];
    printf("key.ensure=true created=true fingerprint=%s mode=%s token=%s\n",
           fingerprint == nil ? "false" : fingerprint.UTF8String, mode.UTF8String,
           token == nil ? "missing" : token.UTF8String);
    CFRelease(key);
    return 0;
}

static int SignKey(NSString *group, NSString *tag) {
    OSStatus status = errSecSuccess;
    SecKeyRef key = CopyKey(group, tag, &status);
    PrintStatus(@"key.sign.lookup", status);
    if (key == NULL) {
        printf("key.sign=false stage=lookup\n");
        return 0;
    }
    NSData *messageDigest = [NSData dataWithBytes:(uint8_t[32]){0x52} length:32];
    CFErrorRef errorRef = NULL;
    CFDataRef signature = SecKeyCreateSignature(
        key, kSecKeyAlgorithmECDSASignatureDigestX962SHA256,
        (__bridge CFDataRef)messageDigest, &errorRef);
    NSError *error = CFBridgingRelease(errorRef);
    NSString *fingerprint = KeyFingerprint(key);
    printf("key.sign=%s fingerprint=%s bytes=%lu error-domain=%s error-code=%ld\n",
           signature == NULL ? "false" : "true",
           fingerprint == nil ? "false" : fingerprint.UTF8String,
           (unsigned long)(signature == NULL ? 0 : CFDataGetLength(signature)),
           error == nil ? "none" : error.domain.UTF8String,
           (long)(error == nil ? 0 : error.code));
    if (signature != NULL) CFRelease(signature);
    CFRelease(key);
    return 0;
}

static int DeleteKey(NSString *group, NSString *tag) {
    OSStatus status = SecItemDelete((__bridge CFDictionaryRef)KeyQuery(group, tag));
    PrintStatus(@"key.delete", status);
    return 0;
}

static int PrintIdentity(void) {
    SecCodeRef code = NULL;
    CFDictionaryRef information = NULL;
    OSStatus status = SecCodeCopySelf(kSecCSDefaultFlags, &code);
    if (status == errSecSuccess) {
        status = SecCodeCopySigningInformation(code, kSecCSSigningInformation, &information);
    }
    PrintStatus(@"identity", status);
    if (status == errSecSuccess && information != NULL) {
        NSDictionary *object = CFBridgingRelease(information);
        NSDictionary *entitlements = object[(__bridge id)kSecCodeInfoEntitlementsDict];
        NSData *unique = object[(__bridge id)kSecCodeInfoUnique];
        NSArray *groups = entitlements[@"keychain-access-groups"];
        printf("identity.identifier=%s\n",
               [object[(__bridge id)kSecCodeInfoIdentifier] UTF8String]);
        printf("identity.team=%s\n",
               [object[(__bridge id)kSecCodeInfoTeamIdentifier] UTF8String]);
        printf("identity.build=%s\n", BUILD_MARKER);
        printf("identity.cdhash=%s\n", unique == nil ? "missing" : HexData(unique).UTF8String);
        printf("identity.keychain-groups=%s\n",
               groups == nil ? "none" :
               [[groups componentsJoinedByString:@","] UTF8String]);
    } else if (information != NULL) {
        CFRelease(information);
    }
    if (code != NULL) CFRelease(code);
    return 0;
}

static void Usage(const char *program) {
    fprintf(stderr,
            "usage: %s identity | ensure-key GROUP TAG evidence|approval | "
            "fingerprint-key GROUP TAG | sign-key GROUP TAG | delete-key GROUP TAG\n",
            program);
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc == 2 && strcmp(argv[1], "identity") == 0) return PrintIdentity();
        if (argc == 5 && strcmp(argv[1], "ensure-key") == 0) {
            return EnsureKey(@(argv[2]), @(argv[3]), @(argv[4]));
        }
        if (argc == 4 && strcmp(argv[1], "fingerprint-key") == 0) {
            return FingerprintKey(@(argv[2]), @(argv[3]));
        }
        if (argc == 4 && strcmp(argv[1], "sign-key") == 0) {
            return SignKey(@(argv[2]), @(argv[3]));
        }
        if (argc == 4 && strcmp(argv[1], "delete-key") == 0) {
            return DeleteKey(@(argv[2]), @(argv[3]));
        }
        Usage(argv[0]);
        return 64;
    }
}
