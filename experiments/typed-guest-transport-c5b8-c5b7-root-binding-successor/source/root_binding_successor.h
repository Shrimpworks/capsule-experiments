#ifndef CAPSULE_C5B8_ROOT_BINDING_SUCCESSOR_H
#define CAPSULE_C5B8_ROOT_BINDING_SUCCESSOR_H

#include "../inputs/c5b8/inputs/c5b5/source/effect_adapter.h"

#define C5B8_SUCCESSOR_PROFILE_MAGIC UINT32_C(0x43354253)
#define C5B8_SUCCESSOR_PROFILE_VERSION UINT32_C(2)
#define C5B8_SUCCESSOR_ROOT_BYTES UINT64_C(100663296)
#define C5B8_HISTORICAL_ROOT_BYTES UINT64_C(134217728)

/*
 * The sealed C5b8 object imports the historical symbol names and the fixed
 * 240-byte ABI. These definitions are a new profile implementation, not a
 * mutation or relabeling of C5b5. They accept only the versioned successor.
 */
int32_t c5b5_validate_immutable_profile(
    const struct c5b5_immutable_profile *profile
);

int32_t c5b5_translate_controller_actions(
    const struct c5b5_immutable_profile *profile,
    uint64_t controller_actions,
    struct c5b5_plan *plan
);

#endif
