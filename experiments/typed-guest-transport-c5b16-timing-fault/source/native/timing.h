/* Test-only observation; never used to authorize an effect or change a deadline.
 * One serialized native caller, including synchronous Go publication callbacks.
 * Drain threads do not write/read this buffer. Failure invalidates evidence only. */
#pragma once
#include <errno.h>
#include <stdint.h>
#include <time.h>
enum timing_kind {
    T_BEGIN=1, T_APPLIED, T_REFUSED, T_SETUP_CLOCK, T_EXE_BEGIN, T_EXE_END,
    T_ROOT_BEGIN, T_ROOT_END, T_SPAWN_GATE_BEGIN, T_SPAWN_GATE_END,
    T_SPAWN_CALL, T_SPAWN_RETURN, T_TEARDOWN_REQUEST, T_TEARDOWN_GATE_END,
    T_CLEANUP_CLOCK, T_SIGNAL_CALL, T_SIGNAL_RETURN, T_REAPED, T_ABSENT,
    T_PUBLICATION_ENTER, T_PUBLICATION_EXIT, T_DRIVE_BEGIN, T_DRIVE_END,
    T_HARNESS_REAP
};
#define TIMING_CAP 512
static struct {
    struct { int64_t ns; unsigned kind,effect,phase; int detail; } events[TIMING_CAP];
    unsigned count,current_effect;
    int invalid;
    int64_t base;
} timing;
static void timing_event(unsigned kind,unsigned effect,unsigned phase,int detail) {
    int saved_errno=errno;
    struct timespec t;
    if(clock_gettime(CLOCK_MONOTONIC,&t)!=0 || timing.count==TIMING_CAP) {
        timing.invalid=1;errno=saved_errno;return;
    }
    int64_t now=(int64_t)t.tv_sec*INT64_C(1000000000)+t.tv_nsec;
    if(timing.count==0)timing.base=now;
    unsigned i=timing.count++;
    timing.events[i].ns=now-timing.base;
    timing.events[i].kind=kind;timing.events[i].effect=effect;
    timing.events[i].phase=phase;timing.events[i].detail=detail;
    errno=saved_errno;
}
