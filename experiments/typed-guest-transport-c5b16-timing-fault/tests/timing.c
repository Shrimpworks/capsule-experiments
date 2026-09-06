/* Only trusted local harness arguments configure the fixed publication fault.
 * Existing checked spawn/signal hooks assert intent and exact child custody. */
#define main predecessor_test_main
#include "driver_test.c"
#undef main

int main(int argc,char **argv) {
    assert(argc==6);
    scenario=atoi(argv[1]);
    int effect=atoi(argv[2]),edge=atoi(argv[3]),delay=atoi(argv[4]),fault=atoi(argv[5]);
    assert((scenario==0 || scenario==13) && (fault==0 || fault==1));
    alarm(7);
    assert(BridgeContractCheck()==1);
    assert(mkdir("attempt-state",0700)==0 && BridgeOpen(1)==0);
    assert(BridgeSetDelay(1,1,0)==-1);
    assert(BridgeSetDelay(16,0,0)==-1);
    assert(BridgeSetDelay(16,4,0)==-1);
    assert(BridgeSetDelay(16,1,-1)==-1);
    assert(BridgeSetDelay(16,1,1601)==-1);
    assert(BridgeSetDelay(effect,edge,delay)==0);
    assert(BridgeSetDelay(effect,edge,delay)==-1);
    if(fault)assert(BridgeSetFault(effect,edge,1)==0);
    timing_event(T_DRIVE_BEGIN,0,state.phase,0);
    int result=c5b16_drive_registered_attempt(registration);
    timing_event(T_DRIVE_END,0,state.phase,result);
    assert(BridgeSetDelay(effect,edge,0)==-1);
    int unresolved=BridgeFact(3),complete=BridgeFact(4);
    int step=BridgeFact(5),resume=BridgeFact(6);
    /* No driver retry. Harness reaping after refusal cannot update native facts. */
    int harness_status=0,harness_reaped=0;
    if(harness_child>0) {
        pid_t got=waitpid(harness_child,&harness_status,0);
        assert(got==harness_child || (got==-1 && errno==ECHILD));
        if(got==harness_child) {
            harness_reaped=1;
            timing_event(T_HARNESS_REAP,0,state.phase,harness_status);
        }
    }
    if(fault)assert(harness_reaped && WIFSIGNALED(harness_status) && WTERMSIG(harness_status)==SIGALRM);
    assert(!timing.invalid && timing.count>0 && timing.count<=TIMING_CAP);
    printf("{\"result\":%d,\"spawn\":%d,\"kill\":%d,\"phase\":%u,\"step\":%d,\"resume\":%d,\"unresolved\":%d,\"complete\":%d,\"nativeAbsent\":%d,\"harnessReaped\":%d,\"harnessStatus\":%d,\"setupDeadlineNs\":%lld,\"cleanupDeadlineNs\":%lld,\"events\":[",
        result,spawn_calls,kill_calls,state.phase,step,resume,unresolved,complete,
        life.absent,harness_reaped,harness_status,
        (long long)(state.deadline*1000000-timing.base),
        (long long)(life.cleanup_deadline?life.cleanup_deadline*1000000-timing.base:-1));
    for(unsigned i=0;i<timing.count;i++) {
        printf("%s[%lld,%u,%u,%u,%d]",i?",":"",(long long)timing.events[i].ns,
            timing.events[i].kind,timing.events[i].effect,timing.events[i].phase,timing.events[i].detail);
    }
    puts("]}");
    fflush(stdout);
    if(fault) {
        assert(effect==16 && result==-2 && spawn_calls==1 && kill_calls==0);
        assert(state.phase==2 && step==17 && resume==17 && unresolved==1 && complete==0);
    } else if(effect==2 && delay>=1000) {
        assert(result==-1 && spawn_calls==0 && kill_calls==0 && complete==0);
    } else if(effect==2 && delay>0 && result<0) {
        assert(result==-1 && spawn_calls==1 && complete==0);
        assert(step==20 && unresolved==0 && life.absent);
    } else if(scenario==13) {
        assert(result==-1 && spawn_calls==1 && kill_calls==1);
        assert(step==20 && unresolved==0 && complete==0 && life.absent);
    } else {
        assert(result==0 && spawn_calls==1 && kill_calls==0 && complete==1);
        exact_delivery();
    }
    return 0;
}
