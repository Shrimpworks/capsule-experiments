#include "root_binding_successor.h"
#include "../generated/historical_adapter_local.c"

#define C5B8_EXPECTED_ROOT_ACTION C5B3_ACTION_START_RUNNER

_Static_assert(sizeof(struct c5b5_immutable_profile) == 240,
    "successor profile ABI changed");
_Static_assert(sizeof(struct c5b5_operation) == 32,
    "successor operation ABI changed");

static struct c5b5_immutable_profile historical_copy(
    const struct c5b5_immutable_profile *profile
) {
    struct c5b5_immutable_profile copy = *profile;
    copy.magic = C5B5_PROFILE_MAGIC;
    copy.version = C5B5_PROFILE_VERSION;
    copy.root_bytes = C5B8_HISTORICAL_ROOT_BYTES;
    return copy;
}

int32_t c5b5_validate_immutable_profile(
    const struct c5b5_immutable_profile *profile
) {
    struct c5b5_immutable_profile copy;
    if (profile == NULL) return C5B5_REFUSE_PROFILE_ABSENT;
    if (profile->magic != C5B8_SUCCESSOR_PROFILE_MAGIC ||
        profile->version != C5B8_SUCCESSOR_PROFILE_VERSION ||
        profile->structure_bytes != sizeof(*profile) ||
        profile->root_bytes != C5B8_SUCCESSOR_ROOT_BYTES) {
        return C5B5_REFUSE_PROFILE_MISMATCH;
    }
    copy = historical_copy(profile);
    return c5b5_historical_validate_immutable_profile(&copy);
}

int32_t c5b5_translate_controller_actions(
    const struct c5b5_immutable_profile *profile,
    uint64_t controller_actions,
    struct c5b5_plan *plan
) {
    struct c5b5_immutable_profile copy;
    uint32_t index;
    uint32_t root_operations = 0;
    int32_t status = c5b5_validate_immutable_profile(profile);
    if (status != C5B5_OK) return status;
    if (plan == NULL) return C5B5_REFUSE_OUTPUT_ABSENT;

    copy = historical_copy(profile);
    status = c5b5_historical_translate_controller_actions(
        &copy, controller_actions, plan);
    if (status != C5B5_OK) return status;
    if (plan->execution_authorized != 0 || plan->count > C5B5_PLAN_CAPACITY) {
        return C5B5_REFUSE_PROFILE_MISMATCH;
    }

    for (index = 0; index < plan->count; index++) {
        struct c5b5_operation *operation = &plan->operations[index];
        if (operation->effect != C5B5_EFFECT_KRUN_ADD_READ_ONLY_RAW_ROOT_FD) continue;
        if (operation->controller_action != C5B8_EXPECTED_ROOT_ACTION ||
            operation->input_fd != 4 || operation->output_fd != -1 ||
            operation->value_a != C5B8_HISTORICAL_ROOT_BYTES ||
            operation->value_b != UINT64_C(0400)) {
            return C5B5_REFUSE_PROFILE_MISMATCH;
        }
        operation->value_a = C5B8_SUCCESSOR_ROOT_BYTES;
        root_operations++;
    }

    if ((controller_actions & C5B8_EXPECTED_ROOT_ACTION) != 0) {
        if (root_operations != 1) return C5B5_REFUSE_PROFILE_MISMATCH;
    } else if (root_operations != 0) {
        return C5B5_REFUSE_PROFILE_MISMATCH;
    }
    return C5B5_OK;
}
