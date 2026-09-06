/* Experiment-only C5b11 ABI providers. See PLAN.md for the closed test boundary.
 * Serialized Supervisor owner, one attempt per process. No runtime setup API.
 * Future spawn/recovery owners must share this private state, without exposing
 * descriptor replacement or resetting consumed authority. They are absent here. */
#include "../inputs/supervisor_effect_abi.h"
#include "../inputs/attempt_bindings.h"
#include "frames.h"
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <pthread.h>
#include <stdbool.h>
#include <stddef.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

enum { READY, STDERR_PIPE, START, SOURCE, INPUT, COMPLETION, PIPE_COUNT };
enum { RETAIN_CAP = 262369, DEADLINE_MS = 1000 };
static const uint8_t registration[16] = {
    0x52,0x73,0x18,0x65,0x61,0x77,0x8e,0xe1,0xbb,0x8d,0x78,0xc7,0x91,0x13,0x21,0xce
};
static const uint8_t attempt[16] = {
    0xc5,0xab,0x61,0xf6,0x0d,0x5d,0xdc,0x4c,0x00,0xa1,0xbf,0x50,0xa8,0x66,0x93,0x44
};
static struct {
    int pipes[PIPE_COUNT][2];
    unsigned phase;
    bool consumed, poisoned, draining;
    pthread_t drain;
    int64_t deadline;
    /* Only drain thread writes these fields, owner reads after join. */
    bool drain_failed;
    size_t retained;
    uint8_t completion[RETAIN_CAP];
} state;

static int64_t now_ms(void) {
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) return -1;
    return (int64_t)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

static int remaining_ms(void) {
    int64_t now = now_ms();
    if (now < 0 || now >= state.deadline) return 0;
    return (int)(state.deadline - now);
}

/* Never retry close: an ambiguous close cannot authorize reuse of that number.
 * The slot is consumed even on error. Future lifecycle owner must fence it. */
static int close_slot(int *slot) {
    int fd = *slot;
    *slot = -1;
    return fd < 0 ? 0 : close(fd);
}

static int wait_io(int fd, short events) {
    while (remaining_ms() > 0) {
        struct pollfd p = { .fd = fd, .events = events };
        int r = poll(&p, 1, remaining_ms());
        if (r > 0) return (p.revents & POLLNVAL) ? -1 : 0;
        if (r < 0 && errno == EINTR) continue;
        return -1;
    }
    return -1;
}

static int write_all(int fd, const uint8_t *bytes, size_t length) {
    size_t offset = 0;
    while (offset < length && remaining_ms() > 0) {
        ssize_t n = write(fd, bytes + offset, length - offset);
        if (n > 0) { offset += (size_t)n; continue; }
        if (n < 0 && errno == EINTR) continue;
        if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK) &&
            wait_io(fd, POLLOUT) == 0) continue;
        return -1;
    }
    return offset == length ? 0 : -1;
}

static int read_one(int fd, uint8_t *byte) {
    while (remaining_ms() > 0) {
        ssize_t n = read(fd, byte, 1);
        if (n >= 0) return (int)n;
        if (errno == EINTR) continue;
        if ((errno == EAGAIN || errno == EWOULDBLOCK) &&
            wait_io(fd, POLLIN) == 0) continue;
        return -1;
    }
    return -1;
}

/* Drain both channels fairly, including after cap+1. No guest text is logged.
 * Deadline is never extended by activity, EINTR, short writes or invalid data. */
static void *drain_outputs(void *unused) {
    (void)unused;
    struct pollfd p[2] = {
        { .fd = state.pipes[COMPLETION][0], .events = POLLIN },
        { .fd = state.pipes[STDERR_PIPE][0], .events = POLLIN }
    };
    unsigned open_count = 2;
    while (open_count && remaining_ms() > 0) {
        int r = poll(p, 2, remaining_ms());
        if (r < 0 && errno == EINTR) continue;
        if (r <= 0) break;
        for (unsigned i = 0; i < 2; i++) {
            if (p[i].fd < 0 || p[i].revents == 0) continue;
            uint8_t scratch[4096];
            ssize_t n = read(p[i].fd, scratch, sizeof(scratch));
            if (n > 0 && i == 0) {
                size_t keep = (size_t)n;
                if (keep > RETAIN_CAP - state.retained) keep = RETAIN_CAP - state.retained;
                memcpy(state.completion + state.retained, scratch, keep);
                state.retained += keep;
            } else if (n == 0) {
                p[i].fd = -1;
                open_count--;
            } else if (n < 0 && errno != EINTR && errno != EAGAIN && errno != EWOULDBLOCK) {
                state.drain_failed = true;
                p[i].fd = -1;
                open_count--;
            }
        }
    }
    if (open_count) state.drain_failed = true;
    return NULL;
}

static bool request_matches(const struct c5b11_effect_request *q, unsigned effect,
                            uint64_t maximum, uint32_t bytes, const uint8_t *hash) {
    static const uint8_t zero[32];
    return q && q->effect == effect && q->sequence == effect &&
        q->maximum_bytes == maximum && q->frame_bytes == bytes &&
        q->failed_sequence == 0 && q->observed_outcome == 0 &&
        q->recovery_step == 0 && q->durable_resume_step == 0 &&
        memcmp(q->registration_id, registration, 16) == 0 &&
        memcmp(q->attempt_id, attempt, 16) == 0 &&
        memcmp(q->plan_sha256, c5b11_plan_sha256, 32) == 0 &&
        memcmp(q->profile_sha256, c5b11_profile_sha256, 32) == 0 &&
        memcmp(q->frame_sha256, hash ? hash : zero, 32) == 0;
}

static int refuse(struct c5b11_effect_result *r) {
    state.poisoned = true;
    if (r) { memset(r, 0, sizeof(*r)); r->outcome = C5B11_EFFECT_INDETERMINATE; }
    return -1;
}

static bool begin(const struct c5b11_effect_request *q, struct c5b11_effect_result *r,
                  unsigned effect, unsigned phase, uint64_t cap, uint32_t bytes,
                  const uint8_t *hash) {
    if (r) memset(r, 0, sizeof(*r));
    if (!r || state.poisoned || state.phase != phase ||
        !request_matches(q, effect, cap, bytes, hash)) {
        refuse(r);
        return false;
    }
    return true;
}

static int applied(const struct c5b11_effect_request *q, struct c5b11_effect_result *r,
                   uint64_t facts) {
    memcpy(r->registration_id, q->registration_id, 16);
    memcpy(r->attempt_id, q->attempt_id, 16);
    memcpy(r->plan_sha256, q->plan_sha256, 32);
    memcpy(r->profile_sha256, q->profile_sha256, 32);
    memcpy(r->frame_sha256, q->frame_sha256, 32);
    r->sequence = q->sequence;
    r->effect = q->effect;
    r->outcome = C5B11_EFFECT_APPLIED;
    r->facts = facts;
    state.phase = q->effect;
    return 0;
}

int32_t c5b11_supervisor_create_fixed_endpoints(
    const struct c5b11_effect_request *q, struct c5b11_effect_result *r) {
    if (!begin(q, r, 1, 0, 0, 0, NULL) || state.consumed) return refuse(r);
    state.consumed = true;
    for (unsigned i = 0; i < PIPE_COUNT; i++) state.pipes[i][0] = state.pipes[i][1] = -1;
    int64_t now = now_ms();
    if (now < 0) return refuse(r);
    state.deadline = now + DEADLINE_MS;
    for (unsigned i = 0; i < PIPE_COUNT; i++) {
        if (pipe(state.pipes[i]) != 0) goto fail;
        for (unsigned j = 0; j < 2; j++) {
            int fd = state.pipes[i][j];
            if (fcntl(fd, F_SETFD, FD_CLOEXEC) != 0) goto fail;
            /* Only Supervisor ends are nonblocking: runner OFDs stay separate. */
            bool owner_end = (i == START || i == SOURCE || i == INPUT) ? j == 1 : j == 0;
            if (owner_end && (fcntl(fd, F_SETFL, O_NONBLOCK) != 0 ||
                (j == 1 && fcntl(fd, F_SETNOSIGPIPE, 1) != 0))) goto fail;
        }
    }
    if (pthread_create(&state.drain, NULL, drain_outputs, NULL) != 0) goto fail;
    state.draining = true;
    return applied(q, r, UINT64_C(1) << 0);
fail:
    for (unsigned i = 0; i < PIPE_COUNT; i++)
        for (unsigned j = 0; j < 2; j++) (void)close_slot(&state.pipes[i][j]);
    return refuse(r);
}

int32_t c5b11_supervisor_verify_ready_byte(
    const struct c5b11_effect_request *q, struct c5b11_effect_result *r) {
    if (!begin(q, r, 3, 1, 1, 1, NULL)) return -1;
    uint8_t byte = 0;
    if (read_one(state.pipes[READY][0], &byte) != 1 || byte != 'R') return refuse(r);
    return applied(q, r, UINT64_C(1) << 2);
}

int32_t c5b11_supervisor_write_source_frame(
    const struct c5b11_effect_request *q, struct c5b11_effect_result *r) {
    if (!begin(q, r, 4, 3, 262296, sizeof(source_frame), c5b11_source_frame_sha256)) return -1;
    if (write_all(state.pipes[SOURCE][1], source_frame, sizeof(source_frame)) != 0) return refuse(r);
    return applied(q, r, UINT64_C(1) << 3);
}

int32_t c5b11_supervisor_write_input_frame(
    const struct c5b11_effect_request *q, struct c5b11_effect_result *r) {
    if (!begin(q, r, 5, 4, 262296, sizeof(input_frame), c5b11_input_frame_sha256)) return -1;
    if (write_all(state.pipes[INPUT][1], input_frame, sizeof(input_frame)) != 0) return refuse(r);
    return applied(q, r, UINT64_C(1) << 4);
}

int32_t c5b11_supervisor_close_input_writers(
    const struct c5b11_effect_request *q, struct c5b11_effect_result *r) {
    if (!begin(q, r, 6, 5, 0, 0, NULL)) return -1;
    int a = close_slot(&state.pipes[SOURCE][1]);
    int b = close_slot(&state.pipes[INPUT][1]);
    if (a != 0 || b != 0) return refuse(r);
    return applied(q, r, UINT64_C(1) << 5);
}

int32_t c5b11_supervisor_send_start_byte(
    const struct c5b11_effect_request *q, struct c5b11_effect_result *r) {
    if (!begin(q, r, 7, 6, 1, 1, NULL)) return -1;
    static const uint8_t start = 'G';
    if (!state.draining || write_all(state.pipes[START][1], &start, 1) != 0) return refuse(r);
    if (close_slot(&state.pipes[START][1]) != 0) return refuse(r);
    return applied(q, r, UINT64_C(1) << 6);
}

int32_t c5b11_supervisor_drain_validate_completion(
    const struct c5b11_effect_request *q, struct c5b11_effect_result *r) {
    if (!begin(q, r, 8, 7, RETAIN_CAP, sizeof(completion_frame),
               c5b11_completion_frame_sha256)) return -1;
    if (!state.draining || pthread_join(state.drain, NULL) != 0) return refuse(r);
    state.draining = false;
    uint8_t extra;
    if (state.drain_failed || state.retained != sizeof(completion_frame) ||
        memcmp(state.completion, completion_frame, sizeof(completion_frame)) != 0 ||
        read_one(state.pipes[READY][0], &extra) != 0) return refuse(r);
    return applied(q, r, (UINT64_C(1) << 7) | (UINT64_C(1) << 8));
}
