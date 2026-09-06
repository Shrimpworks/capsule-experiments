/* Experiment-only same-session lifecycle owner. Single serialized caller and
 * exclusive child reaper required; see PLAN.md for unimplemented boundaries. */
#include "transport.c"
#include <CommonCrypto/CommonDigest.h>
#include <signal.h>
#include <spawn.h>
#include <sys/stat.h>
#include <sys/wait.h>

/* Fixed trusted store-owner imports supplied by the C5b14B Go bridge.
 * Return zero only after exact attempt intent / fenced safe cursor is durable.
 * Native state remains sole owner of child custody and lifecycle observations. */
static int store_checkpoint(const struct c5b13_effect_request *);
extern int c5b13_store_before_spawn(const struct c5b13_effect_request *);
extern int c5b13_store_before_teardown(const struct c5b13_effect_request *);
static struct {
    pid_t child;
    int root, terminal_status;
    struct stat root_identity;
    bool spawn_attempted, owned, reaped, ownership_lost;
    bool teardown_attempted, teardown_intent, absent, root_removed, cleanup_uncertain;
    unsigned failed_sequence, observed_outcome;
    int64_t cleanup_deadline;
} life = { .root = -1 };

static bool reaper_owned(void) {
    struct sigaction action;
    return state.owner == getpid() && sigaction(SIGCHLD,NULL,&action)==0 &&
        action.sa_handler == SIG_DFL && !(action.sa_flags & SA_NOCLDWAIT);
}

static bool regular_identity(int fd, off_t bytes, struct stat *s) {
    return fstat(fd,s)==0 && S_ISREG(s->st_mode) && s->st_size==bytes &&
        s->st_uid==getuid() && (s->st_mode & 07022)==0;
}
static bool digest_fd(int fd, off_t bytes, const uint8_t expected[32]) {
    CC_SHA256_CTX ctx; CC_SHA256_Init(&ctx);
    uint8_t b[4096],actual[32]; off_t offset=0;
    while(offset<bytes && remaining_ms()>0) {
        ssize_t n=pread(fd,b,sizeof(b),offset);
        if(n<0 && errno==EINTR)continue;
        if(n<=0 || n>bytes-offset)return false;
        CC_SHA256_Update(&ctx,b,(CC_LONG)n);offset+=n;
    }
    CC_SHA256_Final(actual,&ctx);
    return offset==bytes && memcmp(actual,expected,32)==0;
}

/* Fixed local names only. Exclusive test directory is a stated precondition;
 * preflight does not close an installed executable pathname race. */
static bool snapshot_root(void) {
    int input=open("root.input",O_RDONLY|O_NOFOLLOW|O_CLOEXEC);
    int writer=-1,reader=-1; bool created=false,ok=false;
    struct stat original,copied,reopened;
    if(input<0 || !regular_identity(input,65536,&original) || original.st_nlink!=1 ||
        !digest_fd(input,65536,fixture_root_sha256))goto done;
    writer=open("custody.root",O_RDWR|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC,0600);
    if(writer<0)goto done;
    created=true;
    uint8_t b[4096]; off_t offset=0;
    while(offset<65536 && remaining_ms()>0) {
        ssize_t n=pread(input,b,sizeof(b),offset);
        if(n<0 && errno==EINTR)continue;
        if(n<=0 || n>65536-offset)goto done;
        ssize_t used=0;
        while(used<n && remaining_ms()>0) {
            ssize_t w=write(writer,b+used,(size_t)(n-used));
            if(w<0 && errno==EINTR)continue;
            if(w<=0)goto done;
            used+=w;
        }
        if(used!=n)goto done;
        offset+=n;
    }
    if(offset!=65536 || !digest_fd(writer,65536,fixture_root_sha256) ||
        fchmod(writer,0400)!=0 || !regular_identity(writer,65536,&copied))goto done;
    reader=open("custody.root",O_RDONLY|O_NOFOLLOW|O_CLOEXEC);
    if(reader<0 || !regular_identity(reader,65536,&reopened) ||
        reopened.st_dev!=copied.st_dev || reopened.st_ino!=copied.st_ino || reopened.st_nlink!=1)goto done;
    if(close_slot(&writer)!=0) { life.cleanup_uncertain=true; goto done; }
    if(unlink("custody.root")!=0)goto done;
    created=false;
    if(fstat(reader,&reopened)!=0 || reopened.st_nlink!=0)goto done;
    life.root=reader;reader=-1;life.root_identity=reopened;ok=true;
done:
    if(close_slot(&input)!=0)life.cleanup_uncertain=true;
    if(close_slot(&writer)!=0)life.cleanup_uncertain=true;
    if(close_slot(&reader)!=0)life.cleanup_uncertain=true;
    if(created && unlink("custody.root")!=0)life.cleanup_uncertain=true;
    return ok && !life.cleanup_uncertain;
}

static bool executable_matches(void) {
    int fd=open("fixture-runner",O_RDONLY|O_NOFOLLOW|O_CLOEXEC);struct stat s;
    bool ok=fd>=0 && regular_identity(fd,FIXTURE_EXE_BYTES,&s) && s.st_nlink==1 &&
        (s.st_mode & 0100) && digest_fd(fd,FIXTURE_EXE_BYTES,fixture_exe_sha256);
    if(close_slot(&fd)!=0) { life.cleanup_uncertain=true; ok=false; }
    return ok;
}
static bool close_child_ends(void) {
    bool ok=true;
    for(unsigned i=0;i<PIPE_COUNT;i++) {
        unsigned side=(i==START || i==SOURCE || i==INPUT)?0:1;
        if(close_slot(&state.pipes[i][side])!=0)ok=false;
    }
    if(!ok)life.cleanup_uncertain=true;
    return ok;
}
int32_t c5b13_supervisor_spawn_fixed_runner(const struct c5b13_effect_request *q,
                                           struct c5b13_effect_result *r) {
    if(!begin(q,r,2,1,0,0,NULL))return -1;
    if(!reaper_owned() || life.spawn_attempted || !executable_matches() ||
        !snapshot_root())return refuse(r);
    int transfer[8];for(unsigned i=0;i<8;i++)transfer[i]=-1;
    int nullfd=open("/dev/null",O_RDONLY|O_CLOEXEC);
    int mapping[8]={nullfd,state.pipes[READY][1],state.pipes[STDERR_PIPE][1],
        state.pipes[START][0],life.root,state.pipes[SOURCE][0],state.pipes[INPUT][0],
        state.pipes[COMPLETION][1]};
    posix_spawn_file_actions_t actions;posix_spawnattr_t attr;
    bool actions_live=false,attr_live=false,ok=false;
    if(nullfd<0 || posix_spawn_file_actions_init(&actions)!=0)goto done;
    actions_live=true;
    if(posix_spawnattr_init(&attr)!=0)goto done;
    attr_live=true;
    sigset_t mask,defaults;sigemptyset(&mask);sigfillset(&defaults);
    if(posix_spawnattr_setflags(&attr,POSIX_SPAWN_CLOEXEC_DEFAULT|POSIX_SPAWN_SETSIGMASK|POSIX_SPAWN_SETSIGDEF)!=0 ||
        posix_spawnattr_setsigmask(&attr,&mask)!=0 || posix_spawnattr_setsigdefault(&attr,&defaults)!=0)goto done;
    /* Move sources above destination range before any dup2 file actions. */
    for(int i=0;i<8;i++) {
        transfer[i]=fcntl(mapping[i],F_DUPFD_CLOEXEC,64);
        if(transfer[i]<0 || posix_spawn_file_actions_adddup2(&actions,transfer[i],i)!=0 ||
            posix_spawn_file_actions_addclose(&actions,transfer[i])!=0)goto done;
    }
    if(remaining_ms()==0 || c5b13_store_before_spawn(q)!=0 || remaining_ms()==0)goto done;
    life.spawn_attempted=true;
    pid_t returned_pid=-1;
    char *const argv[]={"fixture-runner",NULL};char *const env[]={NULL};
    int status=posix_spawn(&returned_pid,"./fixture-runner",&actions,&attr,argv,env);
    /* Output PID is undefined on error. Never adopt it, even if positive. */
    if(status!=0 || returned_pid<=0) { life.ownership_lost=true; goto done; }
    life.child=returned_pid;life.owned=true;ok=true;
done:
    if(attr_live && posix_spawnattr_destroy(&attr)!=0)ok=false;
    if(actions_live && posix_spawn_file_actions_destroy(&actions)!=0)ok=false;
    for(unsigned i=0;i<8;i++)if(close_slot(&transfer[i])!=0) {life.cleanup_uncertain=true;ok=false;}
    if(close_slot(&nullfd)!=0) {life.cleanup_uncertain=true;ok=false;}
    if(!close_child_ends())ok=false;
    if(!ok)return refuse(r);
    return applied(q,r,UINT64_C(1)<<1);
}

/* 1=reaped, 0=still owned and running, -1=ownership unknown. No PID probe. */
static int observe_child(void) {
    if(!reaper_owned() || life.ownership_lost)return -1;
    if(life.reaped)return 1;
    if(!life.owned || life.child<=0)return -1;
    int status=0;pid_t got=waitpid(life.child,&status,WNOHANG);
    if(got==0)return 0;
    if(got<0 && errno==EINTR)return 0;
    if(got!=life.child || (!WIFEXITED(status) && !WIFSIGNALED(status))) {
        life.ownership_lost=true;return -1;
    }
    life.terminal_status=status;life.reaped=true;life.owned=false;return 1;
}
static bool join_child(int64_t deadline) {
    for(;;) {
        int observation=observe_child();if(observation!=0)return observation==1;
        int64_t now=now_ms();if(now<0 || now>=deadline)return false;
        struct timespec pause_time={.tv_sec=0,.tv_nsec=1000000};
        (void)nanosleep(&pause_time,NULL);
    }
}
int32_t c5b13_supervisor_join_terminal_state(const struct c5b13_effect_request *q,
                                            struct c5b13_effect_result *r) {
    if(!begin(q,r,9,8,0,0,NULL))return -1;
    if(!join_child(state.deadline) || !WIFEXITED(life.terminal_status) ||
        WEXITSTATUS(life.terminal_status)!=0)return refuse(r);
    return applied(q,r,UINT64_C(1)<<9);
}
int32_t c5b13_supervisor_prove_authoritative_absence(const struct c5b13_effect_request *q,
                                                   struct c5b13_effect_result *r) {
    if(!begin(q,r,10,9,0,0,NULL))return -1;
    if(!reaper_owned() || !life.reaped || life.ownership_lost)return refuse(r);
    life.absent=true;return applied(q,r,UINT64_C(1)<<10);
}
static bool remove_root(void) {
    if(!reaper_owned() || !life.absent || life.cleanup_uncertain || state.close_uncertain)return false;
    if(life.root_removed)return true;
    /* Join before closing any descriptor used by drain thread. */
    if(!close_child_ends())return false;
    for(unsigned i=START;i<=INPUT;i++)
        if(close_slot(&state.pipes[i][1])!=0)life.cleanup_uncertain=true;
    if(state.draining) {
        if(pthread_join(state.drain,NULL)!=0)return false;
        state.draining=false;
    }
    for(unsigned i=0;i<PIPE_COUNT;i++)for(unsigned j=0;j<2;j++)
        if(close_slot(&state.pipes[i][j])!=0)life.cleanup_uncertain=true;
    if(life.cleanup_uncertain)return false;
    if(life.root>=0) {
        struct stat s;
        if(!regular_identity(life.root,65536,&s) || s.st_nlink!=0 ||
            s.st_dev!=life.root_identity.st_dev || s.st_ino!=life.root_identity.st_ino ||
            (fcntl(life.root,F_GETFL)&O_ACCMODE)!=O_RDONLY) {
            life.cleanup_uncertain=true;return false;
        }
        if(close_slot(&life.root)!=0) {life.cleanup_uncertain=true;return false;}
    } else if(life.spawn_attempted)return false;
    life.root_removed=true;return true;
}
int32_t c5b13_supervisor_remove_fixed_root(const struct c5b13_effect_request *q,
                                         struct c5b13_effect_result *r) {
    if(!begin(q,r,11,10,0,0,NULL))return -1;
    if(!remove_root())return refuse(r);
    return applied(q,r,UINT64_C(1)<<11);
}

static bool recovery_begin(const struct c5b13_effect_request *q,
                           struct c5b13_effect_result *r,unsigned effect) {
    if(r)memset(r,0,sizeof(*r));
    if(!q || !r || !state.consumed || !state.poisoned || !reaper_owned() ||
        q->failed_sequence<2 || q->failed_sequence>11 || q->observed_outcome<1 ||
        q->observed_outcome>3 || q->recovery_step!=effect ||
        q->durable_resume_step!=(effect==16?17:effect)) {refuse(r);return false;}
    struct c5b13_effect_request nominal=*q;
    nominal.failed_sequence=nominal.observed_outcome=nominal.recovery_step=nominal.durable_resume_step=0;
    if(!request_matches(&nominal,effect,0,0,NULL) ||
        (life.failed_sequence && (life.failed_sequence!=q->failed_sequence ||
         life.observed_outcome!=q->observed_outcome))) {refuse(r);return false;}
    life.failed_sequence=q->failed_sequence;life.observed_outcome=q->observed_outcome;
    return true;
}
int32_t c5b13_supervisor_request_teardown(const struct c5b13_effect_request *q,
                                         struct c5b13_effect_result *r) {
    if(!recovery_begin(q,r,16))return -1;
    if(life.teardown_attempted)return refuse(r);
    life.teardown_attempted=true;
    if(c5b13_store_before_teardown(q)!=0)return refuse(r);
    int64_t now=now_ms();if(now<0)return refuse(r);
    life.cleanup_deadline=now+1000;life.teardown_intent=true;
    if(!life.spawn_attempted)return applied(q,r,0);
    int observation=observe_child();
    if(observation<0)return refuse(r);
    if(observation==0 && kill(life.child,SIGKILL)!=0)return refuse(r);
    return applied(q,r,0);
}
int32_t c5b13_supervisor_reconcile_teardown_outcome(const struct c5b13_effect_request *q,
                                                  struct c5b13_effect_result *r) {
    if(!recovery_begin(q,r,17) || store_checkpoint(q)!=0)return refuse(r);
    if(!life.teardown_intent || (life.spawn_attempted && !join_child(life.cleanup_deadline)))return refuse(r);
    return applied(q,r,UINT64_C(1)<<16);
}
int32_t c5b13_supervisor_reconcile_terminal_state(const struct c5b13_effect_request *q,
                                                struct c5b13_effect_result *r) {
    if(!recovery_begin(q,r,18) || store_checkpoint(q)!=0)return refuse(r);
    if(state.phase!=17 || !life.teardown_intent || (life.spawn_attempted && !life.reaped))return refuse(r);
    return applied(q,r,UINT64_C(1)<<9);
}
int32_t c5b13_supervisor_reconcile_authoritative_absence(const struct c5b13_effect_request *q,
                                                       struct c5b13_effect_result *r) {
    if(!recovery_begin(q,r,19) || store_checkpoint(q)!=0)return refuse(r);
    if(state.phase!=18 || life.ownership_lost || (life.spawn_attempted && !life.reaped))return refuse(r);
    life.absent=true;return applied(q,r,UINT64_C(1)<<10);
}
int32_t c5b13_supervisor_reconcile_fixed_root_removal(const struct c5b13_effect_request *q,
                                                   struct c5b13_effect_result *r) {
    if(!recovery_begin(q,r,20) || store_checkpoint(q)!=0)return refuse(r);
    if((state.phase!=19 && state.phase!=20) || !remove_root())return refuse(r);
    return applied(q,r,UINT64_C(1)<<11);
}
