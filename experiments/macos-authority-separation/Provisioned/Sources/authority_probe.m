#import <Foundation/Foundation.h>
#import <LocalAuthentication/LocalAuthentication.h>
#import <Security/Security.h>

#ifndef BUILD_MARKER
#define BUILD_MARKER "v1"
#endif

static void PrintStatus(NSString *name, OSStatus status) {
    NSString *message = CFBridgingRelease(SecCopyErrorMessageString(status, NULL));
    printf("%s.status=%d message=%s\n", name.UTF8String, (int)status,
           message == nil ? "unknown" : message.UTF8String);
}

static NSDictionary *PasswordQuery(
    NSString *service,
    NSString *account,
    NSString *group
) {
    return @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrService: service,
        (__bridge id)kSecAttrAccount: account,
        (__bridge id)kSecAttrAccessGroup: group,
        (__bridge id)kSecUseDataProtectionKeychain: @YES,
    };
}

static int PutPassword(
    NSString *service,
    NSString *account,
    NSString *group,
    NSString *value
) {
    NSDictionary *query = PasswordQuery(service, account, group);
    SecItemDelete((__bridge CFDictionaryRef)query);
    NSMutableDictionary *attributes = [query mutableCopy];
    attributes[(__bridge id)kSecValueData] =
        [value dataUsingEncoding:NSUTF8StringEncoding];
    OSStatus status = SecItemAdd((__bridge CFDictionaryRef)attributes, NULL);
    PrintStatus(@"keychain.put", status);
    return 0;
}

static int GetPassword(NSString *service, NSString *account, NSString *group) {
    NSMutableDictionary *query = [PasswordQuery(service, account, group) mutableCopy];
    query[(__bridge id)kSecReturnData] = @YES;
    CFTypeRef result = NULL;
    OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
    PrintStatus(@"keychain.get", status);
    if (status == errSecSuccess && result != NULL) {
        NSData *data = CFBridgingRelease(result);
        printf("keychain.get.bytes=%lu\n", (unsigned long)data.length);
    } else if (result != NULL) {
        CFRelease(result);
    }
    return 0;
}

static int DeletePassword(NSString *service, NSString *account, NSString *group) {
    OSStatus status = SecItemDelete((__bridge CFDictionaryRef)
        PasswordQuery(service, account, group));
    PrintStatus(@"keychain.delete", status);
    return 0;
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

static int DeleteKey(NSString *group, NSString *tag) {
    OSStatus status = SecItemDelete((__bridge CFDictionaryRef)KeyQuery(group, tag));
    PrintStatus(@"key.delete", status);
    return 0;
}

static int CreateKey(NSString *group, NSString *tag, NSString *mode) {
    BOOL userPresence = [mode isEqualToString:@"approval"];
    if (!userPresence && ![mode isEqualToString:@"evidence"]) {
        printf("key.create=false error=invalid-mode\n");
        return 0;
    }
    SecItemDelete((__bridge CFDictionaryRef)KeyQuery(group, tag));

    CFErrorRef accessError = NULL;
    SecAccessControlCreateFlags flags = kSecAccessControlPrivateKeyUsage;
    if (userPresence) flags |= kSecAccessControlUserPresence;
    SecAccessControlRef access = SecAccessControlCreateWithFlags(
        NULL, kSecAttrAccessibleWhenUnlockedThisDeviceOnly, flags, &accessError);
    if (access == NULL) {
        NSError *error = CFBridgingRelease(accessError);
        printf("key.create=false error=%s\n",
               error == nil ? "access-control" : error.localizedDescription.UTF8String);
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
    SecKeyRef key = SecKeyCreateRandomKey(
        (__bridge CFDictionaryRef)attributes, &keyError);
    CFRelease(access);
    if (key == NULL) {
        NSError *error = CFBridgingRelease(keyError);
        printf("key.create=false error-domain=%s error-code=%ld description=%s\n",
               error == nil ? "missing" : error.domain.UTF8String,
               (long)(error == nil ? 0 : error.code),
               error == nil ? "unknown" : error.localizedDescription.UTF8String);
        return 0;
    }

    NSDictionary *keyAttributes = CFBridgingRelease(SecKeyCopyAttributes(key));
    NSString *token = [keyAttributes[(__bridge id)kSecAttrTokenID] description];
    printf("key.create=true mode=%s token=%s\n", mode.UTF8String,
           token == nil ? "missing" : token.UTF8String);
    CFRelease(key);
    return 0;
}

static int SignWithKey(
    NSString *group,
    NSString *tag,
    NSString *interaction
) {
    if (![interaction isEqualToString:@"allow"] &&
        ![interaction isEqualToString:@"deny"]) {
        printf("key.sign=false error=invalid-interaction-mode\n");
        return 0;
    }
    LAContext *context = [[LAContext alloc] init];
    context.localizedReason = @"Authorize the Capsule Gate B approval-key spike";
    context.interactionNotAllowed = [interaction isEqualToString:@"deny"];
    NSMutableDictionary *query = [KeyQuery(group, tag) mutableCopy];
    query[(__bridge id)kSecReturnRef] = @YES;
    query[(__bridge id)kSecUseAuthenticationContext] = context;
    CFTypeRef result = NULL;
    OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);
    PrintStatus(@"key.retrieve", status);
    if (status != errSecSuccess || result == NULL) {
        if (result != NULL) CFRelease(result);
        printf("key.sign=false stage=retrieve\n");
        return 0;
    }

    SecKeyRef key = (SecKeyRef)result;
    NSData *digest = [NSData dataWithBytes:(uint8_t[32]){0x42} length:32];
    CFErrorRef signError = NULL;
    CFDataRef signature = SecKeyCreateSignature(
        key,
        kSecKeyAlgorithmECDSASignatureDigestX962SHA256,
        (__bridge CFDataRef)digest,
        &signError);
    NSError *error = CFBridgingRelease(signError);
    printf("key.sign=%s bytes=%lu error-domain=%s error-code=%ld description=%s\n",
           signature == NULL ? "false" : "true",
           (unsigned long)(signature == NULL ? 0 : CFDataGetLength(signature)),
           error == nil ? "none" : error.domain.UTF8String,
           (long)(error == nil ? 0 : error.code),
           error == nil ? "none" : error.localizedDescription.UTF8String);
    if (signature != NULL) CFRelease(signature);
    CFRelease(key);
    return 0;
}

static NSURL *StoreURL(void) {
    NSArray<NSURL *> *directories = [[NSFileManager defaultManager]
        URLsForDirectory:NSApplicationSupportDirectory
        inDomains:NSUserDomainMask];
    if (directories.count == 0) return nil;
    return [directories[0] URLByAppendingPathComponent:@"CapsuleGateB/store.bin"];
}

static int WriteStore(NSString *value) {
    NSURL *url = StoreURL();
    if (url == nil) {
        printf("store.write=false error=no-application-support-directory\n");
        return 0;
    }
    NSError *error = nil;
    BOOL directoryCreated = [[NSFileManager defaultManager]
        createDirectoryAtURL:url.URLByDeletingLastPathComponent
        withIntermediateDirectories:YES
        attributes:nil
        error:&error];
    NSData *data = [value dataUsingEncoding:NSUTF8StringEncoding];
    BOOL written = directoryCreated &&
        [data writeToURL:url options:NSDataWritingAtomic error:&error];
    printf("store.write=%s path=%s error=%s\n", written ? "true" : "false",
           url.path.UTF8String,
           error == nil ? "none" : error.localizedDescription.UTF8String);
    return 0;
}

static int ReadStore(NSString *path) {
    NSError *error = nil;
    NSData *data = [NSData dataWithContentsOfFile:path
        options:NSDataReadingMappedIfSafe error:&error];
    printf("store.read=%s bytes=%lu error=%s\n", data == nil ? "false" : "true",
           (unsigned long)(data == nil ? 0 : data.length),
           error == nil ? "none" : error.localizedDescription.UTF8String);
    return 0;
}

static int DeleteStore(void) {
    NSURL *url = StoreURL();
    NSError *error = nil;
    BOOL removed = url != nil && [[NSFileManager defaultManager]
        removeItemAtURL:url error:&error];
    printf("store.delete=%s error=%s\n", removed ? "true" : "false",
           error == nil ? "none" : error.localizedDescription.UTF8String);
    return 0;
}

static int PrintIdentity(void) {
    SecCodeRef code = NULL;
    CFDictionaryRef information = NULL;
    OSStatus status = SecCodeCopySelf(kSecCSDefaultFlags, &code);
    if (status == errSecSuccess) {
        status = SecCodeCopySigningInformation(
            code, kSecCSSigningInformation, &information);
    }
    PrintStatus(@"identity", status);
    if (status == errSecSuccess && information != NULL) {
        NSDictionary *object = CFBridgingRelease(information);
        NSString *identifier = object[(__bridge id)kSecCodeInfoIdentifier];
        NSString *team = object[(__bridge id)kSecCodeInfoTeamIdentifier];
        NSDictionary *entitlements = object[(__bridge id)kSecCodeInfoEntitlementsDict];
        NSArray *groups = entitlements[@"keychain-access-groups"];
        printf("identity.identifier=%s\n",
               identifier == nil ? "missing" : identifier.UTF8String);
        printf("identity.build=%s\n", BUILD_MARKER);
        printf("identity.team=%s\n", team == nil ? "missing" : team.UTF8String);
        printf("identity.sandbox=%s\n",
               [entitlements[@"com.apple.security.app-sandbox"] boolValue]
                   ? "true" : "false");
        printf("identity.keychain-groups=%s\n",
               groups == nil ? "none" :
                   [[groups componentsJoinedByString:@","] UTF8String]);
    } else if (information != NULL) {
        CFRelease(information);
    }
    if (code != NULL) CFRelease(code);
    return 0;
}

static void PrintUsage(const char *program) {
    fprintf(stderr,
        "usage: %s identity | put SERVICE ACCOUNT GROUP VALUE | "
        "get SERVICE ACCOUNT GROUP | delete SERVICE ACCOUNT GROUP | "
        "create-key GROUP TAG evidence|approval | "
        "sign-key GROUP TAG allow|deny | delete-key GROUP TAG | "
        "write-store VALUE | read-store PATH | delete-store\n",
        program);
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc == 2 && strcmp(argv[1], "identity") == 0) {
            return PrintIdentity();
        }
        if (argc == 6 && strcmp(argv[1], "put") == 0) {
            return PutPassword(@(argv[2]), @(argv[3]), @(argv[4]), @(argv[5]));
        }
        if (argc == 5 && strcmp(argv[1], "get") == 0) {
            return GetPassword(@(argv[2]), @(argv[3]), @(argv[4]));
        }
        if (argc == 5 && strcmp(argv[1], "delete") == 0) {
            return DeletePassword(@(argv[2]), @(argv[3]), @(argv[4]));
        }
        if (argc == 5 && strcmp(argv[1], "create-key") == 0) {
            return CreateKey(@(argv[2]), @(argv[3]), @(argv[4]));
        }
        if (argc == 5 && strcmp(argv[1], "sign-key") == 0) {
            return SignWithKey(@(argv[2]), @(argv[3]), @(argv[4]));
        }
        if (argc == 4 && strcmp(argv[1], "delete-key") == 0) {
            return DeleteKey(@(argv[2]), @(argv[3]));
        }
        if (argc == 3 && strcmp(argv[1], "write-store") == 0) {
            return WriteStore(@(argv[2]));
        }
        if (argc == 3 && strcmp(argv[1], "read-store") == 0) {
            return ReadStore(@(argv[2]));
        }
        if (argc == 2 && strcmp(argv[1], "delete-store") == 0) {
            return DeleteStore();
        }
        PrintUsage(argv[0]);
        return 64;
    }
}
