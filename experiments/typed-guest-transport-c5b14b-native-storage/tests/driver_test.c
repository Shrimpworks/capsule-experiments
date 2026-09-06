/* Trusted test hooks operate only on the exact benign fixture child. */
#include <assert.h>
#include <errno.h>
#include <signal.h>
#include <spawn.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <unistd.h>
#include "../bridge/api.h"
static int scenario,spawn_calls,kill_calls,pipe_calls,dropped;
static pid_t harness_child=-1;
static int checked_spawn(pid_t *pid,const char *p,const posix_spawn_file_actions_t *a,
                         const posix_spawnattr_t *s,char *const v[],char *const e[]) {
    spawn_calls++;assert(BridgeFact(1)==1);
    int result=posix_spawn(pid,p,a,s,v,e);if(result==0)harness_child=*pid;
    return scenario==15 && result==0?EIO:result;
}
static int checked_kill(pid_t pid,int sig) {
    kill_calls++;assert(pid==harness_child && pid>0 && sig==SIGKILL);
    assert(BridgeFact(2)==1 && BridgeFact(6)==17);
    return kill(pid,sig);
}
static int checked_pipe(int fds[2]) {
    pipe_calls++;if(scenario==10){errno=EMFILE;return -1;}return pipe(fds);
}
static pid_t checked_wait(pid_t pid,int *status,int flags) {
    assert(pid==harness_child && pid>0 && flags==WNOHANG);
    if(scenario==14 || scenario==25){errno=ECHILD;return -1;}return waitpid(pid,status,flags);
}
static int bridge_test_drop_response(unsigned effect) {
    if(!dropped && (((scenario==22 || scenario==26) && effect==13)||(scenario==23 && effect==12))) {dropped=1;return 1;}
    return 0;
}
#define C5B14B_TESTING 1
#define posix_spawn checked_spawn
#define kill checked_kill
#define pipe checked_pipe
#define waitpid checked_wait
#include "../source/providers.c"
#undef posix_spawn
#undef kill
#undef pipe
#undef waitpid
static void exact_delivery(void) {
    unsigned char b[sizeof(completion_frame)];
    assert(BridgeCopyDelivery(b,sizeof(b))==(int)sizeof(b));
    assert(memcmp(b,completion_frame,sizeof(b))==0);
    b[0]^=1;
    assert(BridgeCopyDelivery(b,sizeof(b))==(int)sizeof(b));
    assert(memcmp(b,completion_frame,sizeof(b))==0);
}
static void nominal_until_root(void) {
    typedef int32_t (*provider)(const struct c5b14b_effect_request *,struct c5b14b_effect_result *);
    const provider effect[12]={0,c5b14b_supervisor_create_fixed_endpoints,c5b14b_supervisor_spawn_fixed_runner,
      c5b14b_supervisor_verify_ready_byte,c5b14b_supervisor_write_source_frame,c5b14b_supervisor_write_input_frame,
      c5b14b_supervisor_close_input_writers,c5b14b_supervisor_send_start_byte,c5b14b_supervisor_drain_validate_completion,
      c5b14b_supervisor_join_terminal_state,c5b14b_supervisor_prove_authoritative_absence,c5b14b_supervisor_remove_fixed_root};
    for(unsigned e=1;e<=11;e++) {
        uint64_t cap=0;uint32_t size=0;const uint8_t *hash=NULL;
        if(e==3 || e==7){cap=1;size=1;}
        if(e==4){cap=262296;size=sizeof(source_frame);hash=c5b14b_source_frame_sha256;}
        if(e==5){cap=262296;size=sizeof(input_frame);hash=c5b14b_input_frame_sha256;}
        if(e==8){cap=RETAIN_CAP;size=sizeof(completion_frame);hash=c5b14b_completion_frame_sha256;}
        struct c5b14b_effect_request q=request_for(e,e,0,0,cap,size,hash);struct c5b14b_effect_result r;
        assert(effect[e](&q,&r)==0);
    }
}
static void contract_refusals(void) {
    struct c5b14b_effect_result r;
    if(scenario==16) {
        struct c5b14b_effect_request q=request_for(24,24,0,0,0,0,NULL);q.attempt_id[0]^=1;
        assert(c5b14b_supervisor_lookup_recovery_cursor(&q,&r)==-1);
        assert(r.facts==0 && BridgeFact(1)==0 && spawn_calls==0);return;
    }
    nominal_until_root();
    struct c5b14b_effect_request q=request_for(12,12,0,0,0,0,c5b14b_completion_frame_sha256);
    if(scenario==17)q.maximum_bytes=4096;
    if(scenario==18)life.absent=false;
    if(scenario==19)life.reaped=false;
    if(scenario==20)life.root_removed=false;
    if(scenario==21)state.completion[0]^=1;
    assert(c5b14b_supervisor_commit_durable_completion(&q,&r)==-1);
    assert(r.facts==0 && BridgeFact(4)==0);
}
static void publication_matrix(int effect,int edge) {
    if(scenario==27) {
        assert(c5b14b_drive_registered_attempt(registration)==0);
        assert(BridgeOpen(0)==0);
    }
    assert(BridgeSetFault(effect,edge,1)==0);
    int first=c5b14b_drive_registered_attempt(registration);
    assert(first<0 && BridgeFact(8)==0);
    int prior_spawn=spawn_calls,prior_kill=kill_calls;
    int second=c5b14b_drive_registered_attempt(registration);
    assert(spawn_calls==prior_spawn && kill_calls<=1);
    if(prior_kill)assert(kill_calls==prior_kill);
    if(scenario==24)assert(second==-1 && BridgeFact(5)==20);
    if(scenario==25)assert(second==-2 && BridgeFact(3)==1 && kill_calls==0);
    if(scenario==26 || scenario==27){assert(second==0 && BridgeFact(4)==1);exact_delivery();}
    if(harness_child>0){int status;pid_t got=waitpid(harness_child,&status,0);assert(got==harness_child || (got==-1 && errno==ECHILD));}
}
int main(int argc,char **argv) {
    assert(argc==2 || argc==4);scenario=atoi(argv[1]);alarm(7);
    assert(BridgeContractCheck()==1);
    if(scenario>=60) {
        int opened=BridgeOpen(0);
        if(scenario==62){assert(opened==-1);assert(spawn_calls==0 && kill_calls==0);return 0;}
        assert(opened==0);
        int result=c5b14b_drive_registered_attempt(registration);
        if(scenario==61){assert(result==0);exact_delivery();assert(BridgeFact(5)==23);}
        else {assert(result==-2 && BridgeFact(3)==1 && BridgeFact(6)==17);}
        assert(spawn_calls==0 && kill_calls==0 && pipe_calls==0);return 0;
    }
    assert(mkdir("attempt-state",0700)==0);assert(BridgeOpen(1)==0);
    if(scenario>=24 && scenario<=27){assert(argc==4);publication_matrix(atoi(argv[2]),atoi(argv[3]));return 0;}
    if(scenario==29) {
        assert(c5b14b_drive_registered_attempt(registration)==0);exact_delivery();
        int fd=open("attempt-state/attempt.json",O_WRONLY|O_TRUNC);assert(fd>=0);
        assert(write(fd,"{}\n",3)==3 && close(fd)==0);
        unsigned char b[sizeof(completion_frame)];assert(BridgeCopyDelivery(b,sizeof(b))==-1);
        assert(c5b14b_drive_registered_attempt(registration)<0 && spawn_calls==1 && kill_calls==0);
        assert(BridgeCopyDelivery(b,sizeof(b))==-1);return 0;
    }
    if(scenario>=16 && scenario<=21){contract_refusals();return 0;}
    if(scenario>=50 && scenario<=53)assert(BridgeSetFault(scenario==51?12:scenario==52?16:2,scenario==53?1:2,2)==0);
    if(scenario>=1 && scenario<=9)assert(BridgeSetFault(scenario<=3?2:scenario<=6?12:16,(scenario-1)%3+1,1)==0);
    int result=c5b14b_drive_registered_attempt(registration);
    assert(scenario<50);
    fprintf(stderr,"case=%d result=%d spawn=%d kill=%d phase=%u cursor=%d/%d unresolved=%d complete=%d\n",scenario,result,spawn_calls,kill_calls,state.phase,BridgeFact(5),BridgeFact(6),BridgeFact(3),BridgeFact(4));
    if(scenario==0 || scenario==5 || scenario==6 || scenario==22 || scenario==23) {
        assert(result==0 && spawn_calls==1 && kill_calls==0 && BridgeFact(4)==1);
        exact_delivery();assert(BridgeOpen(0)==0);
        assert(c5b14b_drive_registered_attempt(registration)==0);
        assert(spawn_calls==1 && kill_calls==0 && BridgeFact(5)==23);exact_delivery();
    } else {
        assert(result<0 && BridgeFact(2)==1 && BridgeFact(4)==0);
        unsigned char b[sizeof(completion_frame)];assert(BridgeCopyDelivery(b,sizeof(b))==-1);
        if(scenario>=1 && scenario<=3)assert(spawn_calls==0 && kill_calls==0 && result==-1);
        if(scenario==4 || (scenario>=7 && scenario<=10) || scenario==14 || scenario==15)assert(result==-2 && BridgeFact(3)==1);
        if(scenario>=7 && scenario<=9)assert(spawn_calls==1 && kill_calls==0);
        if(scenario==10){assert(spawn_calls==0 && pipe_calls==1);assert(c5b14b_drive_registered_attempt(registration)==-2);assert(pipe_calls==1);}
        if(scenario==11 || scenario==12 || scenario==13)assert(result==-1 && spawn_calls==1 && BridgeFact(5)==20);
        if(scenario==13)assert(kill_calls==1);
        if(scenario==14 || scenario==15)assert(kill_calls==0);
        int prior_spawn=spawn_calls,prior_kill=kill_calls;
        assert(c5b14b_drive_registered_attempt(registration)<0);
        assert(prior_spawn==spawn_calls && prior_kill==kill_calls);
    }
    /* Harness containment only: reap known fixture child after assertions. No
     * signal, PID adoption, or lifecycle success is inferred from this wait. */
    if(harness_child>0){int status;pid_t got=waitpid(harness_child,&status,0);assert(got==harness_child || (got==-1 && errno==ECHILD));}
    return 0;
}
