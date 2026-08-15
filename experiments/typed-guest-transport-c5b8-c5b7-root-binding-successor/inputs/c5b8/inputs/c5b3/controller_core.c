#include "controller_core.h"

#define C5B3_BIND_FACTS ( \
    C5B3_FACT_EXACT_PROFILE | C5B3_FACT_EXACT_AUTHORIZATION | \
    C5B3_FACT_EXACT_ARTIFACTS | C5B3_FACT_FIXED_ROOT_ABSENT)

#define C5B3_TERMINAL_FACTS ( \
    C5B3_FACT_CHILD_TREE_ABSENT | C5B3_FACT_RUNNER_TERMINAL | \
    C5B3_FACT_RUNNER_ABSENT | C5B3_FACT_TEARDOWN_RESOLVED | \
    C5B3_FACT_CLEANUP_FALSE)

static struct c5b3_step result(
    struct c5b3_controller *controller,
    uint32_t state,
    uint32_t disposition,
    uint64_t actions
) {
    controller->state = state;
    return (struct c5b3_step){state, disposition, actions};
}

static int has_all(uint64_t facts, uint64_t required) {
    return (facts & required) == required;
}

static int is_fault(uint32_t event) {
    return event == C5B3_EVENT_CANCEL ||
        event == C5B3_EVENT_DEADLINE ||
        event == C5B3_EVENT_STALL ||
        event == C5B3_EVENT_STREAM_RESET ||
        event == C5B3_EVENT_CAP_PLUS_ONE ||
        event == C5B3_EVENT_SHORT_WRITE ||
        event == C5B3_EVENT_READER_DEATH ||
        event == C5B3_EVENT_PROCESS_FAULT ||
        event == C5B3_EVENT_BINDING_MISMATCH;
}

void c5b3_controller_reset(struct c5b3_controller *controller) {
    if (controller != 0) {
        controller->state = C5B3_STATE_STOPPED;
        controller->durable = 0;
    }
}

struct c5b3_step c5b3_controller_step(
    struct c5b3_controller *controller,
    uint32_t event,
    uint64_t facts
) {
    if (controller == 0) {
        return (struct c5b3_step){
            C5B3_STATE_REFUSED,
            C5B3_DISPOSITION_REFUSED,
            C5B3_ACTION_STOP_MISMATCH,
        };
    }

    if (event == C5B3_EVENT_STORE_INDETERMINATE) {
        controller->durable = 0;
        return result(
            controller,
            C5B3_STATE_FENCED,
            C5B3_DISPOSITION_FENCED,
            C5B3_ACTION_FENCE_STORE | C5B3_ACTION_REQUEST_TEARDOWN
        );
    }

    if (controller->state == C5B3_STATE_COMPLETE) {
        if (event == C5B3_EVENT_RESPONSE_LOST && controller->durable != 0) {
            return result(
                controller,
                C5B3_STATE_COMPLETE,
                C5B3_DISPOSITION_REPLAY,
                C5B3_ACTION_REPLAY_STORED
            );
        }
        return result(
            controller,
            C5B3_STATE_COMPLETE,
            C5B3_DISPOSITION_REFUSED,
            C5B3_ACTION_STOP_MISMATCH
        );
    }

    if (controller->state == C5B3_STATE_FENCED ||
        controller->state == C5B3_STATE_REFUSED_CLEAN ||
        controller->state == C5B3_STATE_REFUSED) {
        return result(
            controller,
            controller->state,
            controller->state == C5B3_STATE_FENCED ?
                C5B3_DISPOSITION_FENCED : C5B3_DISPOSITION_REFUSED,
            controller->state == C5B3_STATE_FENCED ?
                C5B3_ACTION_FENCE_STORE : C5B3_ACTION_STOP_MISMATCH
        );
    }

    if (is_fault(event) ||
        (event == C5B3_EVENT_RESPONSE_LOST && controller->durable == 0)) {
        return result(
            controller,
            C5B3_STATE_TEARDOWN,
            C5B3_DISPOSITION_TEARDOWN_REQUIRED,
            C5B3_ACTION_REQUEST_TEARDOWN
        );
    }

    switch (controller->state) {
        case C5B3_STATE_STOPPED:
            if (event == C5B3_EVENT_BIND_EXACT && has_all(facts, C5B3_BIND_FACTS)) {
                return result(
                    controller,
                    C5B3_STATE_BOUND,
                    C5B3_DISPOSITION_ADVANCED,
                    C5B3_ACTION_CREATE_ENDPOINTS
                );
            }
            break;
        case C5B3_STATE_BOUND:
            if (event == C5B3_EVENT_ENDPOINTS_VERIFIED &&
                has_all(facts, C5B3_FACT_ENDPOINTS_DISTINCT)) {
                return result(
                    controller,
                    C5B3_STATE_ENDPOINTS_READY,
                    C5B3_DISPOSITION_ADVANCED,
                    C5B3_ACTION_START_DRAINS
                );
            }
            break;
        case C5B3_STATE_ENDPOINTS_READY:
            if (event == C5B3_EVENT_DRAINS_STARTED &&
                has_all(facts, C5B3_FACT_DRAINS_ACTIVE)) {
                return result(
                    controller,
                    C5B3_STATE_RUNNER_READY,
                    C5B3_DISPOSITION_ADVANCED,
                    C5B3_ACTION_START_RUNNER
                );
            }
            break;
        case C5B3_STATE_RUNNER_READY:
            if (event == C5B3_EVENT_RUNNER_STARTED) {
                return result(
                    controller,
                    C5B3_STATE_INPUT_TRANSFER,
                    C5B3_DISPOSITION_ADVANCED,
                    C5B3_ACTION_WRITE_SOURCE | C5B3_ACTION_WRITE_INPUT
                );
            }
            break;
        case C5B3_STATE_INPUT_TRANSFER:
            if (event == C5B3_EVENT_INPUTS_WRITTEN &&
                has_all(facts, C5B3_FACT_SOURCE_COMPLETE | C5B3_FACT_INPUT_COMPLETE |
                    C5B3_FACT_LAUNCHER_INPUTS_VALID)) {
                return result(
                    controller,
                    C5B3_STATE_LAUNCHER_VALIDATED,
                    C5B3_DISPOSITION_ADVANCED,
                    C5B3_ACTION_CLOSE_INPUT_WRITERS | C5B3_ACTION_ALLOW_CHILD
                );
            }
            break;
        case C5B3_STATE_LAUNCHER_VALIDATED:
            if (event == C5B3_EVENT_CHILD_STARTED) {
                return result(
                    controller,
                    C5B3_STATE_CHILD_RUNNING,
                    C5B3_DISPOSITION_ADVANCED,
                    C5B3_ACTION_NONE
                );
            }
            break;
        case C5B3_STATE_CHILD_RUNNING:
            if (event == C5B3_EVENT_RESULT_ACCEPTED &&
                has_all(facts, C5B3_FACT_RESULT_VALID)) {
                return result(
                    controller,
                    C5B3_STATE_RESULT_VALIDATED,
                    C5B3_DISPOSITION_ADVANCED,
                    C5B3_ACTION_NONE
                );
            }
            break;
        case C5B3_STATE_RESULT_VALIDATED:
            if (event == C5B3_EVENT_TRAILER_COMMITTED &&
                has_all(facts, C5B3_FACT_TRAILER_LAST)) {
                return result(
                    controller,
                    C5B3_STATE_TRAILER_WRITTEN,
                    C5B3_DISPOSITION_ADVANCED,
                    C5B3_ACTION_NONE
                );
            }
            break;
        case C5B3_STATE_TRAILER_WRITTEN:
            if (event == C5B3_EVENT_FRAME_ACCEPTED &&
                has_all(facts, C5B3_FACT_FRAME_EXACT)) {
                return result(
                    controller,
                    C5B3_STATE_FRAME_OBSERVED,
                    C5B3_DISPOSITION_ADVANCED,
                    C5B3_ACTION_NONE
                );
            }
            break;
        case C5B3_STATE_FRAME_OBSERVED:
            if (event == C5B3_EVENT_TERMINAL_FACTS_JOINED &&
                has_all(facts, C5B3_TERMINAL_FACTS)) {
                return result(
                    controller,
                    C5B3_STATE_TERMINAL_PROOF,
                    C5B3_DISPOSITION_ADVANCED,
                    C5B3_ACTION_REQUEST_DURABLE_COMMIT
                );
            }
            break;
        case C5B3_STATE_TERMINAL_PROOF:
            if (event == C5B3_EVENT_DURABLE_COMMIT_CONFIRMED &&
                has_all(facts, C5B3_FACT_DURABLE_RECORD)) {
                controller->durable = 1;
                return result(
                    controller,
                    C5B3_STATE_DURABLE_COMMIT,
                    C5B3_DISPOSITION_ADVANCED,
                    C5B3_ACTION_DELIVER_STORED
                );
            }
            break;
        case C5B3_STATE_DURABLE_COMMIT:
            if (event == C5B3_EVENT_RESPONSE_DELIVERED) {
                return result(
                    controller,
                    C5B3_STATE_COMPLETE,
                    C5B3_DISPOSITION_ADVANCED,
                    C5B3_ACTION_NONE
                );
            }
            if (event == C5B3_EVENT_RESPONSE_LOST && controller->durable != 0) {
                return result(
                    controller,
                    C5B3_STATE_COMPLETE,
                    C5B3_DISPOSITION_REPLAY,
                    C5B3_ACTION_REPLAY_STORED
                );
            }
            break;
        case C5B3_STATE_TEARDOWN:
            if (event == C5B3_EVENT_TEARDOWN_CONFIRMED &&
                has_all(facts, C5B3_FACT_TEARDOWN_RESOLVED)) {
                return result(
                    controller,
                    C5B3_STATE_ABSENCE_PROVEN,
                    C5B3_DISPOSITION_ADVANCED,
                    C5B3_ACTION_PROVE_ABSENCE
                );
            }
            break;
        case C5B3_STATE_ABSENCE_PROVEN:
            if (event == C5B3_EVENT_ABSENCE_CONFIRMED &&
                has_all(facts, C5B3_FACT_CHILD_TREE_ABSENT | C5B3_FACT_RUNNER_ABSENT)) {
                return result(
                    controller,
                    C5B3_STATE_CLEANUP_REQUIRED,
                    C5B3_DISPOSITION_ADVANCED,
                    C5B3_ACTION_REMOVE_FIXED_ROOT
                );
            }
            break;
        case C5B3_STATE_CLEANUP_REQUIRED:
            if (event == C5B3_EVENT_CLEANUP_CONFIRMED &&
                has_all(facts, C5B3_FACT_FIXED_ROOT_REMOVED)) {
                return result(
                    controller,
                    C5B3_STATE_REFUSED_CLEAN,
                    C5B3_DISPOSITION_REFUSED,
                    C5B3_ACTION_NONE
                );
            }
            break;
        default:
            break;
    }

    return result(
        controller,
        C5B3_STATE_REFUSED,
        C5B3_DISPOSITION_REFUSED,
        C5B3_ACTION_STOP_MISMATCH
    );
}
