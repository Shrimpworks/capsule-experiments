#ifndef CAPSULE_C5B14B_BRIDGE_H
#define CAPSULE_C5B14B_BRIDGE_H
#include "../inputs/supervisor_effect_abi.h"
#include <stdint.h>
struct bridge_reply { uint64_t facts; uint32_t fresh, failure, step, resume; };
_Static_assert(sizeof(struct c5b14b_effect_request)==168,"request ABI drift");
_Static_assert(sizeof(struct c5b14b_effect_result)==160,"result ABI drift");
/* Private synchronous copied-value interface. No pointer survives a call. */
int BridgeOpen(int create);
int BridgeApply(struct c5b14b_effect_request *,struct bridge_reply *);
int BridgeFact(int selector);
int BridgeCopyDelivery(unsigned char *,int);
int BridgeSetFault(int effect,int edge,int mode);
int BridgeContractCheck(void);
int bridge_observed_completion(unsigned char *,int);
#endif
