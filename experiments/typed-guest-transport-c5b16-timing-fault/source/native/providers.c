/* C5b14B private native owner: one registered benign fixture and serialized caller. */
#include "../bridge/api.h"
#include "lifecycle.c"

void bridge_timing_edge(unsigned effect,unsigned edge,int entering) {
    timing_event(entering?T_PUBLICATION_ENTER:T_PUBLICATION_EXIT,effect,state.phase,(int)edge);
}

int c5b16_store_before_spawn(const struct c5b16_effect_request *q) {
    struct bridge_reply reply={0};
    return q && q->effect==2 ? BridgeApply((struct c5b16_effect_request *)q,&reply):-1;
}
int c5b16_store_before_teardown(const struct c5b16_effect_request *q) {
    struct bridge_reply reply={0};
    return q && q->effect==16 ? BridgeApply((struct c5b16_effect_request *)q,&reply):-1;
}
static int store_checkpoint(const struct c5b16_effect_request *q) {
    struct bridge_reply reply={0};return BridgeApply((struct c5b16_effect_request *)q,&reply);
}
int bridge_observed_completion(unsigned char *out,int capacity) {
    if(!out || capacity!=(int)sizeof(completion_frame) || !reaper_owned() ||
        state.phase!=11 || state.poisoned || state.draining || state.drain_failed ||
        !life.reaped || !WIFEXITED(life.terminal_status) || WEXITSTATUS(life.terminal_status)!=0 ||
        life.ownership_lost || !life.absent || !life.root_removed ||
        life.cleanup_uncertain || state.close_uncertain || state.retained!=sizeof(completion_frame) ||
        memcmp(state.completion,completion_frame,sizeof(completion_frame))!=0)return 0;
    memcpy(out,state.completion,sizeof(completion_frame));return 1;
}
static int store_provider(const struct c5b16_effect_request *q,struct c5b16_effect_result *r,unsigned effect) {
    timing.current_effect=effect;timing_event(T_BEGIN,effect,state.phase,0);
    if(!q || !r || q->effect!=effect || (state.consumed && state.owner!=getpid()))return refuse(r);
    if(effect==12 && (state.phase!=11 || state.poisoned))return refuse(r);
    if(effect==13 && (state.phase!=12 || state.poisoned))return refuse(r);
    struct bridge_reply reply={0};
    if(BridgeApply((struct c5b16_effect_request *)q,&reply)!=0)return refuse(r);
    unsigned phase=state.phase;
    applied(q,r,reply.facts);
    if(effect>=14)state.phase=phase;
    if(effect==14 || effect==21)state.poisoned=true;
    if(effect==24) {
        r->outcome=reply.fresh?C5B16_EFFECT_NOT_APPLIED:C5B16_EFFECT_APPLIED;
        r->failed_sequence=reply.failure;r->recovery_step=reply.step;r->durable_resume_step=reply.resume;
    }
    #ifdef C5B16_TESTING
    if(bridge_test_drop_response(effect))return refuse(r);
    #endif
    return 0;
}
#define STORE_PROVIDER(name,id) int32_t c5b16_supervisor_##name(const struct c5b16_effect_request *q,struct c5b16_effect_result *r){return store_provider(q,r,id);}
STORE_PROVIDER(commit_durable_completion,12)
STORE_PROVIDER(deliver_stored_completion,13)
STORE_PROVIDER(fence_attempt,14)
STORE_PROVIDER(lookup_fenced_attempt,15)
STORE_PROVIDER(record_unresolved_cleanup,21)
STORE_PROVIDER(reopen_stored_completion,22)
STORE_PROVIDER(replay_stored_completion,23)
STORE_PROVIDER(lookup_recovery_cursor,24)
#include "../inputs/supervisor_effect_driver.c"
