# Author explanation

## Intent and success criteria

C5b15 and the focused audit identified that synchronous durable teardown publication
precedes the cleanup-clock anchor. C5b16 measures that excluded interval using the
existing benign native owner, and refuses to turn fixture self-alarm into absence.
It does not implement a remedy or promote a runnable/product candidate.

## Plan and approach

All four planned increments are implemented except final independent review and
publication. Source/control logic comes from exact C5b14B source; C5b16 namespaces,
profile/plan and frames are regenerated from the new source/material identities.
No dependency is added. Old immutable input bytes remain exact.

source/native/timing.h owns a 512-entry monotonic observation buffer. It preserves
errno, invalidates overflow/clock errors, and has one serialized caller; drain
threads never touch it. Generated transport observes begin/applied/refused/setup.
Lifecycle observations cover root/executable, durable spawn gate, spawn, teardown
request and return, cleanup anchor, signal, actual reap and absence. They never
participate in a lifecycle decision. bridge_timing_edge is a synchronous test-only
callback during Go publication edges, with no retained pointer or Go reentry.

BridgeSetDelay arms one bounded 0..1600-ms delay before the first drive at effect
2 or 16 and one of the three existing publication fault edges. time.Sleep is inside
the existing serialized durable operation. Fault injection remains ordered after
delay; pending/success/refusal behavior and state machinery remain unchanged.
It cannot be armed twice or after the drive, and is not a product API.

Tests use existing checked_spawn/checked_kill to assert durable intent and exact
native custody. There is no driver retry. On refusal, the harness blocks only to
reap its known benign child, separately from native state, and proves SIGALRM
containment. Raw trace is emitted before outcome assertions to retain diagnostics.

## Verification and evidence

Final timing record: 19 cases x ordinary/parent-C-ASan-UBSan = 38 runs. First case
is zero-delay pre-publication teardown refusal; three publication edges then cover
800/1200/1600-ms successful delays and 1600-ms refusals. Spawn publication at
1200 ms refuses before spawn; 800 ms may complete or conservatively refuse only
with an observed setup-clock expiry. Zero-delay normal still requires success.
Three compiled observer mutations and five false retained-evidence mutations pass.
All retained 1200/1600-ms successful teardown delays exceed the total 1200-ms bound,
while their post-gate cleanup stays below the unchanged 1000-ms clock.

Full inherited regression record passes 126 native cases, 17 Go suites/58 subtests,
8 native/Go-race cases, 10 intended-assertion compiled mutations, all 24 providers,
and two-directory reproduction of 22 mode-zero artifacts including timing-test.
Regression and timing material maps are byte-equal. The reviewer should independently
verify these assertions and run proportionate checks; author runs are testimony.
Canonical full gates are separately in progress, to be handed off with exact results.

## Deviations and costs

Initial 800-ms spawn test incorrectly assumed guaranteed success. Its failure lacked
a raw trace so exact cause remains unclassified; frozen test/scripts and log remain
in INITIAL_PROBE. We tightened reporting and now accept conservative refusal only
with traced setup expiry. This does not diagnose C5b14B's old unclassified refusal.
The next full timing corpus passed but metadata collection failed on sandbox-denied
sysctl; that log is retained. Metadata now precedes execution and final run used
explicit host-metadata permission. No hidden test retry or timeout widening exists.

Self-contained source duplication follows the immutable experiment convention;
ordinary verification never imports product or a moving predecessor. JSON traces
are verbose to keep observations directly inspectable. No generalized tracer,
async storage engine, new helper, policy relaxation or new product primitive is added.

## Limits and challenge points

Finite sleeps are artificial latency, not disk-hang/power-loss evidence. One host,
fixed child, exclusive temporary directory, inherited known custody, and local
clock anchors do not establish installed/guest/product behavior. ASan/UBSan covers
parent C only; Go race is separate. No performance percentile or load guarantee.

Challenge first-refusal versus clock expiry classification, absent versus missing
observations, zero-spawn recovery, observer sensitivity, clock anchor order,
possible observer side effects, source/profile/evidence bindings and unchanged
recovery/deadline semantics. The next step is a passive design decision for pending,
failed or indeterminate durability during live-child teardown. Any architecture
remedy requires an explicit decision gate and is outside this implementation.
