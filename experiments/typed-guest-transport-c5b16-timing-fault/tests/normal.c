/* Uninterposed C entry point, linked with providers.o and the Go owner archive. */
#include <assert.h>
#include <sys/stat.h>
#include <unistd.h>
#include "../bridge/api.h"
#include "../inputs/attempt_bindings.h"
extern int32_t c5b16_drive_registered_attempt(const uint8_t [16]);
int main(void) {
    alarm(7);assert(BridgeContractCheck()==1);
    assert(mkdir("attempt-state",0700)==0 && BridgeOpen(1)==0);
    assert(c5b16_drive_registered_attempt(registration)==0 && BridgeFact(4)==1);
    assert(BridgeOpen(0)==0);
    assert(c5b16_drive_registered_attempt(registration)==0 && BridgeFact(5)==23);
    return 0;
}
