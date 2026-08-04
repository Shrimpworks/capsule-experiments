#import <Foundation/Foundation.h>
#import <ServiceManagement/ServiceManagement.h>

static const char *status_name(SMAppServiceStatus status) {
    switch (status) {
        case SMAppServiceStatusNotRegistered: return "not-registered";
        case SMAppServiceStatusEnabled: return "enabled";
        case SMAppServiceStatusRequiresApproval: return "requires-approval";
        case SMAppServiceStatusNotFound: return "not-found";
    }
    return "unknown";
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 2) {
            fprintf(stderr, "usage: %s register|unregister|status\n", argv[0]);
            return 64;
        }
        NSString *plist = @"com.capsulecorp.spike.p0-4a-installed-topology.supervisor.plist";
        SMAppService *service = [SMAppService agentServiceWithPlistName:plist];
        NSString *operation = [NSString stringWithUTF8String:argv[1]];
        if ([operation isEqualToString:@"status"]) {
            printf("serviceStatus=%s\n", status_name(service.status));
            return 0;
        }
        NSError *error = nil;
        BOOL ok = NO;
        if ([operation isEqualToString:@"register"]) {
            ok = [service registerAndReturnError:&error];
        } else if ([operation isEqualToString:@"unregister"]) {
            ok = [service unregisterAndReturnError:&error];
        } else {
            fprintf(stderr, "unknown operation: %s\n", argv[1]);
            return 64;
        }
        printf("operation=%s ok=%s serviceStatus=%s", argv[1], ok ? "true" : "false",
               status_name(service.status));
        if (error != nil) {
            printf(" errorDomain=%s errorCode=%ld", error.domain.UTF8String,
                   (long)error.code);
        }
        putchar('\n');
        return ok ? 0 : 1;
    }
}
