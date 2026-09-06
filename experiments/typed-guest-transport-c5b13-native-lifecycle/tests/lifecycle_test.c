/* Test-only fault injection and store acknowledgments; never durable storage. */
#include <assert.h>
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <spawn.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/wait.h>
#include <unistd.h>
static int scenario,spawn_calls,kill_calls,spawn_gate_calls,teardown_gate_calls;
static pid_t harness_child=-1;
static bool lose_wait,lose_root_close;
static int root_to_fault=-1,close_fault_count;
static int injected_spawn(pid_t *p,const char *path,const posix_spawn_file_actions_t *a,
                          const posix_spawnattr_t *s,char *const v[],char *const e[]) {
    spawn_calls++;assert(spawn_gate_calls==1);
    int r=posix_spawn(p,path,a,s,v,e);if(r==0)harness_child=*p;
    return scenario==6 && r==0?EIO:r;
}
static int injected_kill(pid_t p,int signal_number) {
    kill_calls++;assert(p==harness_child && p>0 && signal_number==SIGKILL);
    assert(teardown_gate_calls==1 && scenario!=2 && scenario!=4 && scenario!=6 && scenario!=7 && scenario!=15);
    int r=kill(p,signal_number);return scenario==21 && r==0?(errno=EINTR,-1):r;
}
static pid_t injected_wait(pid_t p,int *s,int options) {
    assert(p==harness_child && p>0 && options==WNOHANG);
    if(lose_wait){errno=ECHILD;return -1;}
    return waitpid(p,s,options);
}
static int injected_close(int fd) {
    if(fd==root_to_fault)close_fault_count++;
    if(lose_root_close && fd==root_to_fault && scenario==26) {lose_root_close=false;errno=EINTR;return -1;}
    int r=close(fd);
    if(lose_root_close && fd==root_to_fault) {lose_root_close=false;errno=EINTR;return -1;}
    return r;
}
#define posix_spawn injected_spawn
#define kill injected_kill
#define waitpid injected_wait
#define close injected_close
#include "../source/lifecycle.c"
#undef posix_spawn
#undef kill
#undef waitpid
#undef close
int c5b13_store_before_spawn(const struct c5b13_effect_request *q) {
    spawn_gate_calls++;assert(q->effect==2 && !life.spawn_attempted);
    assert(request_matches(q,2,0,0,NULL));if(scenario==22) { struct timespec delay={.tv_sec=1,.tv_nsec=10000000};nanosleep(&delay,NULL); }
    return scenario==1?-1:0;
}
int c5b13_store_before_teardown(const struct c5b13_effect_request *q) {
    teardown_gate_calls++;assert(q->effect==16 && q->durable_resume_step==17);
    assert(memcmp(q->attempt_id,attempt,16)==0 && kill_calls==0);
    return scenario==2?-1:0;
}
typedef int32_t (*provider)(const struct c5b13_effect_request *,struct c5b13_effect_result *);
static const provider effects[25]={
    [1]=c5b13_supervisor_create_fixed_endpoints,[2]=c5b13_supervisor_spawn_fixed_runner,
    [3]=c5b13_supervisor_verify_ready_byte,[4]=c5b13_supervisor_write_source_frame,
    [5]=c5b13_supervisor_write_input_frame,[6]=c5b13_supervisor_close_input_writers,
    [7]=c5b13_supervisor_send_start_byte,[8]=c5b13_supervisor_drain_validate_completion,
    [9]=c5b13_supervisor_join_terminal_state,[10]=c5b13_supervisor_prove_authoritative_absence,
    [11]=c5b13_supervisor_remove_fixed_root,[16]=c5b13_supervisor_request_teardown,
    [17]=c5b13_supervisor_reconcile_teardown_outcome,[18]=c5b13_supervisor_reconcile_terminal_state,
    [19]=c5b13_supervisor_reconcile_authoritative_absence,[20]=c5b13_supervisor_reconcile_fixed_root_removal
};
static int fd_count(void) {int count=0;for(int fd=0;fd<1024;fd++)if(fcntl(fd,F_GETFD)>=0)count++;return count;}
static unsigned failed_sequence;
static struct c5b13_effect_request request(unsigned effect) {
    struct c5b13_effect_request q={0};
    memcpy(q.registration_id,registration,16);memcpy(q.attempt_id,attempt,16);
    memcpy(q.plan_sha256,c5b13_plan_sha256,32);memcpy(q.profile_sha256,c5b13_profile_sha256,32);
    q.effect=q.sequence=effect;
    if(effect==3 || effect==7)q.maximum_bytes=q.frame_bytes=1;
    if(effect==4){q.maximum_bytes=262296;q.frame_bytes=sizeof(source_frame);memcpy(q.frame_sha256,c5b13_source_frame_sha256,32);}
    if(effect==5){q.maximum_bytes=262296;q.frame_bytes=sizeof(input_frame);memcpy(q.frame_sha256,c5b13_input_frame_sha256,32);}
    if(effect==8){q.maximum_bytes=RETAIN_CAP;q.frame_bytes=sizeof(completion_frame);memcpy(q.frame_sha256,c5b13_completion_frame_sha256,32);}
    if(effect>=16){q.failed_sequence=failed_sequence;q.observed_outcome=3;q.recovery_step=effect;q.durable_resume_step=effect==16?17:effect;}
    return q;
}
static int call(unsigned effect) {
    struct c5b13_effect_request q=request(effect);struct c5b13_effect_result r;
    int status=effects[effect](&q,&r);
    if(status==0) {
        assert(r.outcome==C5B13_EFFECT_APPLIED && r.effect==effect && r.sequence==effect);
        assert(memcmp(r.registration_id,q.registration_id,16)==0 && memcmp(r.attempt_id,q.attempt_id,16)==0);
        assert(memcmp(r.plan_sha256,q.plan_sha256,32)==0 && memcmp(r.profile_sha256,q.profile_sha256,32)==0);
        assert(r.failed_sequence==q.failed_sequence && r.recovery_step==q.recovery_step && r.durable_resume_step==q.durable_resume_step);
        unsigned bit=effect-1;if(effect==9)bit=9;if(effect==10)bit=10;if(effect==11)bit=11;
        if(effect==17)bit=16;if(effect==18)bit=9;if(effect==19)bit=10;if(effect==20)bit=11;
        uint64_t expected=effect==16?0:(UINT64_C(1)<<bit);if(effect==8)expected|=UINT64_C(1)<<8;
        assert(r.facts==expected);
    } else {assert(r.facts==0);if(effect<16)failed_sequence=effect;}
    return status;
}
static void recovery(void) {
    assert(call(16)==0);assert(call(17)==0);assert(call(18)==0);assert(call(19)==0);assert(call(20)==0);
    assert(life.root==-1 && life.root_removed && life.absent);
    assert(call(20)==0); /* Idempotent receipt; never a second close. */
}
static void harness_cleanup(void) {
    /* Separate test custody contains injected lost-response/reaper faults.
     * Never used as provider evidence. Only this run's successful spawn PID. */
    if(harness_child>0 && !life.reaped) {
        int status;pid_t r=waitpid(harness_child,&status,WNOHANG);
        if(r==0) {assert(kill(harness_child,SIGKILL)==0);assert(waitpid(harness_child,&status,0)==harness_child);}
    }
    close_child_ends();
    if(state.draining) {assert(pthread_join(state.drain,NULL)==0);state.draining=false;}
    for(unsigned i=0;i<PIPE_COUNT;i++)for(unsigned j=0;j<2;j++)close_slot(&state.pipes[i][j]);
    if(life.root>=0)close_slot(&life.root);
}
int main(int argc,char **argv) {
    assert(argc==2);scenario=atoi(argv[1]);alarm(5);
    if(scenario==23) { failed_sequence=3;assert(call(17)!=0 && kill_calls==0 && spawn_calls==0);return 0; }
    int extra=-1;
    if(scenario==20){int fd=open("/dev/null",O_RDONLY);assert(fd>=0);extra=fcntl(fd,F_DUPFD,100);assert(extra>=100);close(fd);}
    int baseline_fds=fd_count();
    assert(call(1)==0);
    if(scenario==17) {
        pid_t child=fork();assert(child>=0);
        if(child==0){assert(call(2)!=0 && spawn_calls==0);_exit(0);}
        int status;assert(waitpid(child,&status,0)==child && WIFEXITED(status) && WEXITSTATUS(status)==0);
    }
    if(scenario==16){struct sigaction a={0};a.sa_handler=SIG_IGN;assert(sigaction(SIGCHLD,&a,NULL)==0);}
    if(scenario==18 || scenario==19) {
        int fd=open(scenario==18?"fixture-runner":"root.input",O_WRONLY);assert(fd>=0);
        uint8_t b=0;assert(pwrite(fd,&b,1,0)==1);close(fd);
    }
    if(scenario==12) {
        struct c5b13_effect_request q=request(2);q.registration_id[0]^=1;struct c5b13_effect_result r;
        assert(effects[2](&q,&r)!=0 && spawn_gate_calls==0 && spawn_calls==0);failed_sequence=2;
        recovery();goto done;
    }
    if(scenario==1 || scenario==6 || scenario==16 || scenario==18 || scenario==19 || scenario==22) {
        assert(call(2)!=0);
        if(scenario==16){struct sigaction a={0};a.sa_handler=SIG_DFL;assert(sigaction(SIGCHLD,&a,NULL)==0);}
        if(scenario==6) {
            assert(life.ownership_lost && !life.owned && life.child==0 && life.root>=0);
            assert(call(16)!=0 && call(17)!=0 && kill_calls==0 && !life.root_removed);
        } else {assert(spawn_calls==0);recovery();}
        goto done;
    }
    assert(call(2)==0 && life.child==harness_child && life.owned && life.root>=0);
    if(scenario==9) {assert(call(11)!=0 && !remove_root() && life.root>=0);recovery();goto done;}
    if(scenario==2 || scenario==3 || scenario==7 || scenario==8 || scenario==13 || scenario==14 || scenario==21) {
        assert(call(3)!=0 && life.root>=0);
        if(scenario==7)lose_wait=true;
        if(scenario==13 || scenario==14) {
            struct c5b13_effect_request q=request(16);struct c5b13_effect_result r;
            if(scenario==13)q.attempt_id[0]^=1;else q.durable_resume_step=16;
            assert(effects[16](&q,&r)!=0 && teardown_gate_calls==0 && kill_calls==0);
        }
        if(scenario==2 || scenario==7) {
            assert(call(16)!=0 && call(17)!=0 && kill_calls==0 && !life.root_removed);goto done;
        }
        if(scenario==8 || scenario==21) {
            int r=call(16);assert(scenario==21?r!=0:r==0);
            assert(call(16)!=0 && kill_calls==1 && teardown_gate_calls==1);
            assert(call(17)==0 && call(18)==0 && call(19)==0 && call(20)==0);
        } else recovery();
        assert(kill_calls==1);goto done;
    }
    for(unsigned i=3;i<=7;i++) {
        if(((scenario==24 || scenario==26) && i==6) || (scenario==25 && i==7)) {
            root_to_fault=state.pipes[i==6?SOURCE:START][1];lose_root_close=true;
            assert(call(i)!=0 && state.close_uncertain && close_fault_count==1);
            assert(call(16)==0 && call(17)==0 && call(18)==0 && call(19)==0);
            assert(call(20)!=0 && !life.root_removed && life.root>=0 && close_fault_count==1);
            if(scenario==26)assert(fcntl(root_to_fault,F_GETFD)>=0);
            goto done;
        }
        assert(call(i)==0);
    }
    if(scenario==5){assert(call(8)!=0);recovery();goto done;}
    assert(call(8)==0);
    if(scenario==4 || scenario==15) {
        assert(call(9)!=0 && life.reaped && !life.owned);recovery();assert(kill_calls==0);goto done;
    }
    assert(call(9)==0 && call(10)==0);
    if(scenario==10) {
        int fd=open("/dev/null",O_RDONLY);assert(fd>=0 && dup2(fd,life.root)==life.root);close(fd);
        assert(call(11)!=0 && !life.root_removed && life.cleanup_uncertain);goto done;
    }
    if(scenario==11){root_to_fault=life.root;lose_root_close=true;assert(call(11)!=0 && !life.root_removed && life.cleanup_uncertain);goto done;}
    assert(call(11)==0 && life.root_removed && life.root==-1 && kill_calls==0);
done:
    if(life.root_removed)assert(fd_count()==baseline_fds);
    harness_cleanup();
    if(scenario>=24 && scenario<=26)assert(close_fault_count==1);
    if(scenario==26)assert(close(root_to_fault)==0); /* Test retains exact injected open FD. */
    if(extra>=0)close(extra);alarm(0);return 0;
}
