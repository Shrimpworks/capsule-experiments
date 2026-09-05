/* Test-only peers and syscall fault injection. No runner or driver linked.
 * Inclusion permits private-state inspection without a production setup API. */
#include <assert.h>
#include <errno.h>
#include <fcntl.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

static int scenario;
static atomic_uint write_calls, read_calls, pipe_calls;
static ssize_t tested_write(int fd, const void *bytes, size_t length) {
    unsigned call = atomic_fetch_add(&write_calls, 1);
    if (scenario == 14 && call < 3) { errno = EINTR; return -1; }
    if (scenario == 15) return 0;
    if (scenario == 14 && length > 3) length = 3;
    return write(fd, bytes, length);
}
static ssize_t tested_read(int fd, void *bytes, size_t length) {
    unsigned call = atomic_fetch_add(&read_calls, 1);
    if (scenario == 14 && call < 3) { errno = EINTR; return -1; }
    if (scenario == 14 && length > 2) length = 2;
    return read(fd, bytes, length);
}
static int tested_pipe(int fds[2]) {
    unsigned call = atomic_fetch_add(&pipe_calls, 1);
    if (scenario == 16 && call == 3) { errno = EMFILE; return -1; }
    return pipe(fds);
}
#define write tested_write
#define read tested_read
#define pipe tested_pipe
#include "../source/transport.c"
#undef write
#undef read
#undef pipe

static void nap(unsigned milliseconds) {
    struct timespec t = { milliseconds / 1000, (long)(milliseconds % 1000) * 1000000 };
    while (nanosleep(&t, &t) && errno == EINTR) {}
}
static bool peer_write(int fd, const uint8_t *bytes, size_t length) {
    size_t done = 0;
    while (done < length) {
        /* Fragment the real stream independently of the provider wrappers. */
        size_t count = length - done > 31 ? 31 : length - done;
        ssize_t n = write(fd, bytes + done, count);
        if (n > 0) done += (size_t)n;
        else if (n < 0 && errno == EINTR) continue;
        else return false;
    }
    return true;
}
static bool peer_read_exact_eof(int fd, const uint8_t *expected, size_t length) {
    uint8_t buf[512];
    size_t used = 0;
    for (;;) {
        ssize_t n = read(fd, buf + used, sizeof(buf) - used);
        if (n > 0) { used += (size_t)n; if (used == sizeof(buf)) return false; }
        else if (n == 0) break;
        else if (errno != EINTR) return false;
    }
    return used == length && memcmp(buf, expected, length) == 0;
}
static void *peer(void *unused) {
    (void)unused;
    int out = state.pipes[COMPLETION][1];
    if (scenario == 3) { nap(1100); goto done; }
    if (scenario == 12) {
        /* Exceed pipe capacity before READY: only a pre-start drain can help. */
        uint8_t scratch[4096] = {0};
        for (unsigned i = 0; i < 80; i++)
            assert(peer_write(state.pipes[STDERR_PIPE][1], scratch, sizeof(scratch)));
    }
    uint8_t ready = scenario == 2 ? 'X' : 'R';
    if (!peer_write(state.pipes[READY][1], &ready, 1) || scenario == 2) goto done;
    if (scenario == 4) goto done;
    if (!peer_read_exact_eof(state.pipes[SOURCE][0], source_frame, sizeof(source_frame))) goto done;
    if (!peer_read_exact_eof(state.pipes[INPUT][0], input_frame, sizeof(input_frame))) goto done;
    uint8_t start = 'G';
    if (!peer_read_exact_eof(state.pipes[START][0], &start, 1)) goto done;
    uint8_t completion[sizeof(completion_frame) + 1];
    memcpy(completion, completion_frame, sizeof(completion_frame));
    size_t bytes = sizeof(completion_frame);
    if (scenario == 5) completion[160] ^= 1; /* payload */
    if (scenario == 6) bytes--; /* truncated trailer */
    if (scenario == 7) completion[bytes++] = 0; /* trailer no longer last */
    if (scenario == 8) completion[24] ^= 1; /* attempt binding */
    if (scenario == 9) completion[bytes - 1] ^= 1; /* digest/trailer */
    if (scenario == 10) bytes = 0; /* EOF is not success */
    if (scenario == 11) { nap(1100); goto done; }
    if (scenario == 12 || scenario == 13) {
        /* Both streams exceed pipe capacity; cap+1 must still drain to EOF. */
        uint8_t scratch[4096] = {0};
        for (unsigned i = 0; i < 80; i++)
            if (!peer_write(state.pipes[STDERR_PIPE][1], scratch, sizeof(scratch))) goto done;
        if (scenario == 13) {
            assert(peer_write(out, completion_frame, sizeof(completion_frame)));
            for (unsigned i = 0; i < 80; i++)
                if (!peer_write(out, scratch, sizeof(scratch))) goto done;
            goto done;
        }
    }
    if (scenario == 18) { uint8_t extra = 'R'; assert(peer_write(state.pipes[READY][1], &extra, 1)); }
    assert(peer_write(out, completion, bytes));
done:
    for (unsigned i = 0; i < PIPE_COUNT; i++) {
        unsigned end = (i == START || i == SOURCE || i == INPUT) ? 0 : 1;
        (void)close_slot(&state.pipes[i][end]);
    }
    return NULL;
}

static struct c5b11_effect_request request(unsigned effect) {
    struct c5b11_effect_request q = {0};
    memcpy(q.registration_id, registration, 16);
    memcpy(q.attempt_id, attempt, 16);
    memcpy(q.plan_sha256, c5b11_plan_sha256, 32);
    memcpy(q.profile_sha256, c5b11_profile_sha256, 32);
    q.sequence = q.effect = effect;
    if (effect == 3 || effect == 7) { q.maximum_bytes = 1; q.frame_bytes = 1; }
    if (effect == 4 || effect == 5 || effect == 8) {
        q.maximum_bytes = effect == 8 ? RETAIN_CAP : 262296;
        q.frame_bytes = effect == 4 ? sizeof(source_frame) : effect == 5 ? sizeof(input_frame) : sizeof(completion_frame);
        memcpy(q.frame_sha256, effect == 4 ? c5b11_source_frame_sha256 : effect == 5 ? c5b11_input_frame_sha256 : c5b11_completion_frame_sha256, 32);
    }
    return q;
}
static int call(unsigned effect) {
    typedef int32_t (*provider)(const struct c5b11_effect_request *, struct c5b11_effect_result *);
    /* Fixed harness dispatch only; provider source accepts no callbacks. */
    provider providers[9] = {NULL, c5b11_supervisor_create_fixed_endpoints, NULL,
        c5b11_supervisor_verify_ready_byte, c5b11_supervisor_write_source_frame,
        c5b11_supervisor_write_input_frame, c5b11_supervisor_close_input_writers,
        c5b11_supervisor_send_start_byte, c5b11_supervisor_drain_validate_completion};
    struct c5b11_effect_request q = request(effect);
    struct c5b11_effect_result r;
    memset(&r, 0xA5, sizeof(r));
    int result = providers[effect](&q, &r);
    if (result == 0) {
        assert(r.outcome == C5B11_EFFECT_APPLIED);
        assert(r.sequence == effect && r.effect == effect);
        assert(memcmp(r.registration_id, q.registration_id, 16) == 0);
        assert(memcmp(r.attempt_id, q.attempt_id, 16) == 0);
        assert(memcmp(r.plan_sha256, q.plan_sha256, 32) == 0);
        assert(memcmp(r.profile_sha256, q.profile_sha256, 32) == 0);
        assert(memcmp(r.frame_sha256, q.frame_sha256, 32) == 0);
        uint64_t expected = effect == 1 ? 1 : effect == 8 ? 384 : UINT64_C(1) << (effect - 1);
        assert(r.facts == expected);
    } else assert(r.facts == 0 && r.outcome != C5B11_EFFECT_APPLIED);
    return result;
}
static unsigned count_fds(void) {
    unsigned count = 0;
    for (int fd = 0; fd < 512; fd++) if (fcntl(fd, F_GETFD) >= 0) count++;
    return count;
}
static void cleanup(void) {
    for (unsigned i = 0; i < PIPE_COUNT; i++)
        if (i == START || i == SOURCE || i == INPUT) (void)close_slot(&state.pipes[i][1]);
    if (state.draining) { assert(pthread_join(state.drain, NULL) == 0); state.draining = false; }
    for (unsigned i = 0; i < PIPE_COUNT; i++)
        for (unsigned j = 0; j < 2; j++) (void)close_slot(&state.pipes[i][j]);
}
int main(int argc, char **argv) {
    assert(argc == 2);
    scenario = atoi(argv[1]);
    unsigned before = count_fds();
    if (scenario >= 30 && scenario <= 44) {
        struct c5b11_effect_request q = request(1);
        struct c5b11_effect_result r;
        switch (scenario) {
            case 30: q.registration_id[0] ^= 1; break;
            case 31: q.attempt_id[0] ^= 1; break;
            case 32: q.plan_sha256[0] ^= 1; break;
            case 33: q.profile_sha256[0] ^= 1; break;
            case 34: q.frame_sha256[0] = 1; break;
            case 35: q.maximum_bytes = 1; break;
            case 36: q.frame_bytes = 1; break;
            case 37: q.sequence = 3; break;
            case 38: q.effect = 3; break;
            case 39: q.failed_sequence = 1; break;
            case 40: q.observed_outcome = 1; break;
            case 41: q.recovery_step = 1; break;
            case 42: q.durable_resume_step = 1; break;
            case 43: assert(c5b11_supervisor_create_fixed_endpoints(NULL, &r) != 0); goto rejected;
            case 44: assert(c5b11_supervisor_create_fixed_endpoints(&q, NULL) != 0); goto rejected;
        }
        assert(c5b11_supervisor_create_fixed_endpoints(&q, &r) != 0);
        assert(r.facts == 0);
rejected:
        assert(count_fds() == before);
        puts("request refusal PASSED");
        return 0;
    }
    if (scenario == 16) {
        assert(call(1) != 0);
        assert(count_fds() == before);
        puts("partial pipe creation cleanup PASSED");
        return 0;
    }
    assert(call(1) == 0);
    for (unsigned i = 0; i < PIPE_COUNT; i++) {
        for (unsigned j = 0; j < 2; j++) assert(fcntl(state.pipes[i][j], F_GETFD) & FD_CLOEXEC);
        assert((fcntl(state.pipes[i][0], F_GETFL) & O_ACCMODE) == O_RDONLY);
        assert((fcntl(state.pipes[i][1], F_GETFL) & O_ACCMODE) == O_WRONLY);
        bool writer_owner = i == START || i == SOURCE || i == INPUT;
        unsigned own = writer_owner ? 1 : 0;
        assert(fcntl(state.pipes[i][own], F_GETFL) & O_NONBLOCK);
        assert(!(fcntl(state.pipes[i][1 - own], F_GETFL) & O_NONBLOCK));
        if (!writer_owner) assert(fcntl(state.pipes[i][1], F_SETNOSIGPIPE, 1) == 0);
    }
    assert(state.draining);
    if (scenario >= 20 && scenario <= 24) {
        uint8_t ready = 'R';
        assert(write(state.pipes[READY][1], &ready, 1) == 1);
        assert(call(3) == 0);
        if (scenario == 20 || scenario == 21) {
            struct c5b11_effect_request q = request(4);
            struct c5b11_effect_result r;
            if (scenario == 20) q.frame_sha256[0] ^= 1;
            else q.maximum_bytes++;
            assert(c5b11_supervisor_write_source_frame(&q, &r) != 0);
            assert(r.facts == 0);
        } else if (scenario == 22) {
            assert(call(5) != 0);
        } else if (scenario == 23) {
            uint8_t fill[4096] = {0};
            while (write(state.pipes[SOURCE][1], fill, sizeof(fill)) > 0) {}
            assert(errno == EAGAIN);
            int64_t started = now_ms();
            assert(call(4) != 0);
            assert(now_ms() - started >= 900 && state.phase == 3);
        } else {
            assert(close_slot(&state.pipes[SOURCE][0]) == 0);
            assert(call(4) != 0); /* real EPIPE, no process-wide SIGPIPE change */
        }
        cleanup();
        assert(count_fds() == before);
        puts("write binding/order/stall/closed-peer refusal PASSED");
        return 0;
    }
    if (scenario == 17 || scenario == 19) {
        assert(call(scenario == 17 ? 7 : 1) != 0);
        cleanup();
        assert(count_fds() == before);
        puts("order/reuse refusal PASSED");
        return 0;
    }
    pthread_t thread;
    assert(pthread_create(&thread, NULL, peer, NULL) == 0);
    int result = 0;
    for (unsigned effect = 3; effect <= 8; effect++) {
        result = call(effect);
        if (result != 0) break;
    }
    bool positive = scenario == 0 || scenario == 12 || scenario == 14;
    assert((result == 0) == positive);
    if (scenario == 13) assert(state.retained == RETAIN_CAP);
    /* Release local writers to unblock the test peer on refusal. */
    for (unsigned i = START; i <= INPUT; i++) (void)close_slot(&state.pipes[i][1]);
    assert(pthread_join(thread, NULL) == 0);
    cleanup();
    assert(count_fds() == before);
    puts("native transport case PASSED");
    return 0;
}
