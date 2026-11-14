# C5b19 benign teardown experiment — Gate 3

Status: `IN_PROGRESS — TRENDING_GOOD`. This is a development-only, build-only
successor to the immutable C5b16 experiment. No child run is authorized.

Question: can one exact Supervisor-owned benign direct child be stopped and
authoritatively reaped within the C2A bounds while a separate storage worker
is delayed or uncertain, without giving storage a stop-path dependency?

The exact design and frozen source manifest are in Capsule's
[`C5B19_GATE2_IMPLEMENTATION_PACKET.md`](https://github.com/Shrimpworks/capsule-corp/blob/a6ef83a6b43cd4940547b138529ebbb91cff8da6/docs/C5B19_GATE2_IMPLEMENTATION_PACKET.md).
Gate 2 passed independent review on `e7b68c57d59abe66c68d849473e21fe74f4e31b7`
and was integrated at `a6ef83a6b43cd4940547b138529ebbb91cff8da6`.

## Original G3a slice (historical)

The implemented behavior is a pure Go, offline cancellation-frame parser
with a literal 57-byte vector and mutation/refusal tests, the exact
domain-separated process-identity digest, and the immutable 295-byte
obligation preimage with independently calculated known-answer digests and
invalid-binding refusals. It cannot create, inspect,
signal, or wait for any process and is not the eventual executable oracle.
Red/green evidence: the first `go test ./...` failed on missing parser names;
after its implementation the tests passed. The next test run failed on the
missing identity derivation, then passed after its implementation. The third
test run failed on the missing obligation encoder, then passed after the
minimal implementation. All other Gate-2 manifest
source, native control, store, full trace oracle, build scripts, and negative
fixtures remain unimplemented. `go build ./...` and `go vet ./...` are required
for this slice. No experiment result or security/timing claim follows.

## Review-1 test-sensitivity correction

Fresh-context review 1 of 3 on `cd9e20a145f584f7e4ee66684c2cb39621112621`
returned **Not ready** with two accepted P2 test gaps. Invalid cancellation
bindings now appear in both the frozen expectation and the matching raw frame,
so only binding validation can reject them. All three zero-ID and all three
duplicate-ID cases are covered. Obligation tests now change each of the ten
bindings independently while remaining valid, and compare all 295 expected
preimage bytes at the exact field offset.

Two controlled, local, no-child mutants were run against the corrected tests
and removed immediately afterward:

- Replacing the cancellation binding guard with `if false` made
  `go test ./tests -run '^TestCancellationRejectsInvalidFrozenBindings$' -count=1`
  fail in all six zero/duplicate subtests with `invalid frozen binding accepted`.
- Replacing the encoded `Plan` field with the original fixture's 32 bytes made
  `go test ./tests -run '^TestObligationEveryValidBindingChangesExactBytes$' -count=1`
  fail in its `plan` subtest with `changed plan binding produced wrong exact preimage`.

The original implementation bytes were restored; no mutant is retained. These
checks demonstrate sensitivity only for the named mutations, not exhaustive
mutant proof or C/Go conformance. The original three test-first red compiler
outputs remain author-observed task history, not retained raw logs.

Fresh-context review 2 of 3 on `1ef2dcabeeef6591e5f45ba4a0d0a5a6e6661fcb`
returned **Not ready** on one further accepted P2 test gap: a hardcoded
original cancellation tuple survived the valid tests. Each of the three
frozen IDs is now changed independently to another valid value; its matching
changed frame must pass and its stale original frame must fail. A controlled
local mutant replaced the three frozen-ID comparisons with hardcoded original
fixture values. `go test ./tests -run '^TestCancellationAcceptsEachChangedValidFrozenBinding$' -count=1`
failed in all three `attempt`, `approval`, and `registration` subtests with
`valid changed binding refused: C5B19_CANCEL_FRAME`. The original comparisons
were restored. The historical PLAN said review instance 3 was pending, while PR #38 later
claimed instance 3/3 Ready on `1e3f3bb154d0ef24412002ac47adef22ba3c46a9`.
Its reviewer report has not been recovered. This provenance discrepancy is
not confirmation of that verdict and does not restart the historical budget.

## Authority and stop rules

The eventual controlled target is one fixed inert direct child in an
owner-created disposable directory on a separately authorized owned macOS
host. No guest, interpreter, daemon, Broker, backend, user content, network,
external PID, or descendant is in scope. Gate 4 must review the implemented
source and binaries and receive separate explicit owner authorization before
any child execution. If exact custody, descriptor, clock, or source closure
fails, refuse the run and preserve safeguards.

Owner: Capsule maintainer. This experiment is replaced when its exact
Gate-5 evidence is accepted or the candidate is abandoned; it is never
imported into Capsule product code.


## G3a2 scope and dependency decision (before implementation)

Status: `IN_PROGRESS — TRENDING_GOOD`. Continue existing PR #38 with a distinct
wire/record increment: pure decoding of request397, reply98 and record395 and
exact request/reply/record correspondence. This does not implement operation
history, settlement state, trace causality, clocks, storage, native control or
any live fixture. The previous G3a three-review history above is preserved;
a fresh review of G3a2 must not be represented as its fourth retry.

BUILD-NARROWLY checklist, applicable ecosystem row: C5b19 prospective Supervisor
control/storage lane exchange (ADOPT-PLATFORM / BUILD-NARROWLY).

- Trust class: test/evidence only. The custom fixed-layout validator accepts
  bounded in-memory synthetic bytes, no paths, descriptors or process targets.
- Authority: no process, user filesystem, network, credential, service, guest,
  signal, wait or storage effects. No product package imports this experiment.
- Reuse: standard-library bytes, SHA-256 and big-endian primitives; no transport
  framework, queue, new dependency or go.sum. Native platform adoption deferred.
- Pin/provenance: existing reviewed packet and archive baseline in ORIGINS.json;
  local Go1.25.13 only, Go standard library BSD-style license. No dependency
  graph beyond that toolchain/standard library; no network downloads permitted.
- Reproduction: GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off with the existing
  absolute Go1.25.13 binary, test/race/vet/build and source diff checks.
- Refusal/mutation plan: literal known answers; every field, fixed sizes,
  binding/operation/candidate substitutions, caller ownership, invalid enums,
  failed/indeterminate zero digest, controlled guard mutants then restoration.
- Upgrade/removal owner: Capsule maintainer. Packet ABI/toolchain changes need
  their own review; remove this experiment after accepted replacement evidence.

Consolidate the existing obligation tests into frozen-listed oracle_test.go;
no test behavior is discarded. Full Gate3 remains incomplete. Gate4 implemented
byte review and explicit first-run authorization, Gate5 execution and Gate6
conclusion remain BLOCKED. Parsing and matching bytes cannot prove publication,
process custody, start permission, public completion or capacity release.


## G3a2 verification and retained evidence — 2026-10-15

Status: `PASSED` for local implementation verification; independent review is
`BLOCKED` pending the brain's fresh G3a2 review. Gate3 as a whole remains
`IN_PROGRESS — TRENDING_GOOD`; Gate4–6 and product admission remain BLOCKED.
This result covers only stateless byte structure and correspondence. In
particular, operation-ID freshness beyond the preparation ID, exact predecessor
generation, non-overlap, late settlement/control latches, full raw-trace oracle,
C/Go equality, native builds, actual storage faults and live custody are deferred.
A structurally valid terminal timing-violated record is retained failure evidence.

The 397/98/395-byte literal vectors were independently assembled from the packet
with Python struct big-endian packing and hashlib. The retained Go tests contain
those literal bytes and fixed request-body/record hashes; test helpers express
the documented offsets independently of production decoding. The suite covers
all 890 single-byte substitutions across one request, record and reply; every
shorter length and one extra byte; all ten changed valid bindings; all ten zero
bindings and all twenty same-width duplicate pairs in matching raw/frozen context;
closed kinds/booleans/dispositions; candidate and operation substitutions; fixed
clock policy; generation 0/overflow and maximum; copied caller-owned buffers;
terminal with and without confirmed runner identity; all three reply outcomes;
and the request-body hash even when an uncertain reply has zero record digest.
No test code starts subprocesses or accesses files, network, processes or clocks.

The first intended command encountered an unwritable default Go build cache;
setting an isolated /tmp cache fixed the environment without fetching tools.
Before adding any decoder behavior, the test suite failed on the missing names:

```text
# capsule.experiments/c5b19/tests [capsule.experiments/c5b19/tests.test]
tests/oracle_test.go:253:14: undefined: decodeRequest
tests/oracle_test.go:254:14: undefined: decodeRecord
tests/oracle_test.go:258:12: undefined: validateRecordForRequest
tests/oracle_test.go:259:21: undefined: validateReply
FAIL capsule.experiments/c5b19/tests [build failed]
```

All commands ran in this experiment directory, using the existing absolute
`/Users/dsteele/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.25.13.darwin-arm64/bin/go`
with `GOCACHE=/tmp/c5b19-go-cache GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off`:

- `go test ./... -count=1`: exit 0, `ok capsule.experiments/c5b19/tests 0.292s`.
- `go test -race ./... -count=1`: exit 0, `ok ... 1.317s`.
- `go vet ./...`: exit 0, no diagnostics.
- `go build ./...`: exit 0, no diagnostics.
- `git diff --check`: exit 0, no diagnostics.

Three controlled local mutants were introduced one at a time, then the exact
source was restored in a finally block. Each test command exited 1:

| Mutation | Command selector (go test ./tests -run SELECTOR -count=1) | Observed refusal of mutant |
| --- | --- | --- |
| Replace structural candidate validation with false | `^TestWireRejectsStructuralCandidatesEvenWithMatchingHashes$` | Invalid kind/candidate cases failed with `invalid request accepted` |
| Bypass request-body hash equality | `^TestWireFailedReplyStillRequiresExactRequestBody$` | `uncertain reply matched a different valid request body` |
| Check record digest only for confirmed outcomes | `^TestWireCandidateKindsAndUncertainOutcomes$` | All six candidate cases failed with `uncertain reply accepted record digest` |

Restoration SHA256 for tests/oracle.go:
`0c370da8d89c792d6b0efcfce42b64772c74e42f4c4bae45f1df4c6398e5ff7b`.
Post-restoration `go test ./... -count=1` exited 0 (`ok ... 0.194s`).
These are three bounded mutation-sensitivity checks, not exhaustive proof.
Raw logs `/tmp/c5b19-wire-{red,green,race,vet,build,restored}.log` and
`/tmp/c5b19-wire-mutant-{candidate,request-hash,uncertain-digest}.log` are ephemeral;
the command/results and excerpts above are the retained repository evidence.

The current source list is PLAN.md, go.mod, inputs/ORIGINS.json,
tests/oracle.go, tests/oracle_test.go and tests/model_test.go. The original
obligation_test.go content was consolidated without dropping tests into the
frozen-listed oracle_test.go. No native/store source, run script or build/run
manifest is claimed complete by this subset. The brain owns exact commit/PR
publication and canonical Capsule roadmap reconciliation before delivery.

## G3a2 independent acceptance

Status: `PASSED` for the bounded wire/record increment at reviewed implementation
`c4d3c33ed04c1dff213e2c69064a6113892d9653`. Fresh-context review instance 1 of 3
returned **Ready** with no remaining actionable findings. The sole P3 was a stale
CI merge sentence in canonical Capsule documentation, corrected and verified in
the same pass; no archive implementation changed after review. The reviewer
independently reconstructed literal vectors, verified source/reference/log hashes,
and ran offline Go1.25.13 test/race/vet/build successfully. Mutation log contents
were inspected; mutants were not independently rerun. Remote GitHub readback was
network-limited for the reviewer; Brain owns publication verification.

The full report and preliminary ledger are retained by the canonical recovery
PR under `.planning/c5b19-foundation/`; report SHA-256
`de83bb2d6ad5d9c289c8f33fa48b9036fc2023dde5159a2e311248d0d39a2872`. PR #38 links that canonical delivery.
This verdict covers G3a2 and integration only, not the historical G3a review-3
claim. Full Gate3 remains `IN_PROGRESS — TRENDING_GOOD`; Gate4–6 and product
admission remain `BLOCKED`. This PR deliberately remains draft for the unfinished
experiment; no child fixture was run or authorized.

## G3a3 bounded write-history scope and dependency decision (before behavior)

Status: `IN_PROGRESS — TRENDING_GOOD`. G3a3 adds only one-attempt write-history
and exact simulated settlement conformance in tests/oracle.go and model_test.go.
`applyReply` means simulated accepted control application, not worker arrival or
actual fsync evidence. Full control/trace, custody, timing, lifecycle and storage
remain deferred. No start/stop/permission or capacity API belongs in this slice.

Accepted invariants: constructor-frozen bindings and owned copies; one pending
request until exact applied reply; next generation and fresh operation IDs;
preparation first/confirmed before successors, optional runner then terminal and
each kind once; exact settlement with rejection preserving all state; uncertainty
retaining settlement without promoting confirmed projection; terminal preserving
confirmed runner facts; terminal absence matching the attempted runner even when
publication failed (or nonzero absence with no runner attempt); no hidden control
state. Direct preparation-to-terminal history is supported. A zero/uninitialized
tracker refuses operations. All validation precedes mutation.

Custom-primitive checklist: applicable ecosystem row is C5b19 prospective
Supervisor control/storage lane exchange, ADOPT-PLATFORM / BUILD-NARROWLY. Only
the fixed in-memory BUILD-NARROWLY evidence projection is implemented. Trust class
is test/evidence; authority is synthetic-byte validation only. Bounds: one attempt,
three operations, one copied 397-byte pending request, 98-byte reply and 68-byte
confirmed projection; fixed arrays, no queue/map. No dependencies or source
manifest changes, Go1.25.13 standard library only (BSD-style license), immutable
provenance inherited from ORIGINS. No process/network/filesystem/credential/store
or clock effects in tests; no goroutines, guests, children, signals or waits.

Tests precede behavior and retain positive, negative and restored-mutant results.
Reproduction uses the existing exact Go1.25.13 binary offline with GOTOOLCHAIN=local,
GOPROXY=off, GOSUMDB=off and GOCACHE=/tmp/c5b19-g3a3-go-cache. Capsule maintainer
owns upgrade/removal; ABI/toolchain changes require their own review. Current
G3a2 hashes remain historical at reviewed commit c4d3c33; G3a3 provenance will
pin canonical 080e9203c6c96d1494ea3a52e8855816fec3fa38. New G3a3 independent review
has its own maximum three passes; earlier review budgets/verdicts are unchanged.
Full Gate3 remains IN_PROGRESS — TRENDING_GOOD; Gate4+ and child execution BLOCKED.


## G3a3 local evidence and handoff — 2026-10-15

Status: `PASSED` for local implementation verification; fresh G3a3 independent
review is `BLOCKED` pending dispatch. Full Gate3 remains
`IN_PROGRESS — TRENDING_GOOD`; Gate4+ and product admission remain `BLOCKED`.
This increment does not implement the full passive model or full trace oracle.

Implemented constructor/begin/applyReply/value-snapshot use only fixed arrays and
already-validated wire frames. The sole pending request is privately copied.
Rejected operations preserve all private state, confirmed bytes and pending data.
A settled failed/indeterminate write consumes its generation and operation ID but
cannot promote its candidate. Each kind is attempted at most once; terminal
closes submission regardless of outcome. Terminal preserves the exact confirmed
runner prefix and matches an attempted runner's identity even when that runner
publication failed. Direct preparation-to-terminal is valid with nonzero absence
bytes, whose real custody remains outside this model. `applyReply` is simulated
accepted control application, not mere worker reply arrival or observed fsync.

Positive tests cover 24 runner/terminal/disposition combinations (including no
runner attempt), two uncertain preparation outcomes, independent changed valid
bindings/process/operation IDs, private pending ownership and value snapshots.
Negative tests include nil/zero receivers, invalid frozen bindings, exact next
generation and freshness, kind ordering/retries/fourth writes, overlap, substituted
requests, replayed/cross-attempt/candidate-swapped replies, every reply-byte mutation,
short/trailing replies, and terminal history invention/erasure/substitution.
Every refusal helper compares the entire private history before/after. Standalone
reply validation and repeated snapshots never settle the pending request. There
are no tests with live effects, sleeps, clocks, goroutines or subprocess creation.

TDD red was observed before adding any write-history behavior:

```text
# capsule.experiments/c5b19/tests [capsule.experiments/c5b19/tests.test]
tests/model_test.go:94:39: undefined: writeHistory
tests/model_test.go:96:12: undefined: newWriteHistory
tests/model_test.go:102:37: undefined: writeHistory
FAIL capsule.experiments/c5b19/tests [build failed]
```

All following Go commands ran in this experiment directory with the exact local
`/Users/dsteele/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.25.13.darwin-arm64/bin/go`,
`GOCACHE=/tmp/c5b19-g3a3-go-cache GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off`:

- `go test ./... -count=1`: exit0, `ok capsule.experiments/c5b19/tests 0.276s`.
- `go test -race ./... -count=1`: exit0, `ok ... 1.312s`.
- `go vet ./...`: exit0, no diagnostics.
- `go build ./...`: exit0, no diagnostics.
- `git diff --check`: exit0, no diagnostics.

Each mutant below was applied separately, tested with
`go test ./tests -run '^TESTNAME$' -count=1`, then restored in a finally block.
All six compiled and exited1 through the named behavioral assertion:

| Disabled guard / change | TESTNAME | Retained failure excerpt |
| --- | --- | --- |
| Pending overlap guard | TestWriteHistoryRequestBindingAndRejectionOwnership | `model_test.go:431: invalid begin accepted` |
| Exact next-generation equality | TestWriteHistoryGenerationFreshnessAndOrdering | `model_test.go:240: invalid begin accepted` |
| Used operation-ID guard | TestWriteHistoryGenerationFreshnessAndOrdering | outcomes1/2/3: `model_test.go:264: invalid begin accepted` |
| Apply candidate for every outcome | TestWriteHistoryPositiveSettlementMatrix | `uncertain outcome promoted candidate or confirmed outcome lost exact projection` |
| Attempted-runner terminal absence identity | TestWriteHistoryTerminalContinuity | failed/indeterminate runner cases: `model_test.go:290: invalid begin accepted` |
| Replace exact pending reply validation with assumed confirmed outcome | TestWriteHistoryExactSettlementAndReplays | `model_test.go:305: invalid reply accepted` |

The overlap vector is an otherwise valid terminal with the exact next generation,
fresh operation and matching attempted-runner absence identity. Fresh-ID vectors
use an otherwise valid terminal after each runner outcome. Terminal-identity vectors
remain structurally valid and preserve confirmed projection. Thus these checks
exercise the intended history guards rather than incidental parse refusal.

Exact oracle.go SHA256 restoration was verified, followed by
`go test ./... -count=1`: exit0, `ok ... 0.201s`. No mutant remains. These six
checks are bounded sensitivity evidence, not exhaustive proof. Current source
hashes (G3a2 historical hashes remain attached to its reviewed c4d3c33 commit):

- `go.mod`: `5f40cde18c2d82fe5d57f3a8822377c12e473f1026f174165dfecd126bea3eeb`
- `tests/oracle.go`: `fe36b0504a4a69623b1f64e791487e35ae78869c8e1524ff131d9790d3180dc2`
- `tests/oracle_test.go`: `c505b8fea9df4059a503b683b916343a95261b2172436eaa0308fa4a108f15fe`
- `tests/model_test.go`: `b0f3b9d063c225eb887cecaf16f4058f0ed07ae8f14c3d92c49acacabb0a931e`

Raw logs live at `/tmp/c5b19-g3a3-<name>.log` and are ephemeral. The exact commands,
results and excerpts above are retained here; log hashes at the time of handoff:

- `red`: `6ede3099c141d7f697a673e89035e76ed1ee02641a7396536a59066773a31f5d`
- `green`: `3bedce5d7ccb8c646d14ea9c399e167553a7fdd22ad61a484a3e8db8b1a7a44a`
- `race`: `ecc4354fb360b922b3c4b8e5349cdd985d19eebaaa722605c8ec9d56dffb1ba9`
- `vet`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `build`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `restored`: `f2c3e8848befcc2dac325f73761b1eb4a24bb873ab439030e6b2833c310ca04e`
- `mutant-overlap`: `c80d550a77c6ee00138b51b39a7ed9282c04dd3e00e264f37976d2544f84130a`
- `mutant-generation`: `cff1cf44430f9d875ceb935d4f9c237a65cffe1396e98dedaac4f4ca0c753ce2`
- `mutant-fresh-id`: `31fbf454ffe5810c788c77f7de4a9e62839b4d6558b8006e88fe9456812bd428`
- `mutant-uncertainty`: `ffbc4b02b8bc062883cd4b4a1786d4943da2df976582d5cfbdb36dfc0e2653d1`
- `mutant-terminal-identity`: `92c4d719d0260b4e7ebd131c14089b3d61a899d1c33fc9d0fda5ae5632c46adb`
- `mutant-settlement-binding`: `dad42dc5b970ad1012317f0187a7ce66e7a54e9811994629032b5ab885631d97`

Deferred: actual control application/worker-arrival trace pairing, stop/start races,
clock/timing bounds, real creation/wait custody and absence observations, filesystem
publication/uncertainty, native/C conformance, full source/build closure and child
execution. No authority methods or pretend permission stubs were added. This
history cannot turn record presence into confirmation and has no import/recovery
API. The brain owns fresh review (max3 for G3a3), commits, linked PR publication,
exact immutable canonical evidence links and subsequent gate decisions.

## G3a3 independent acceptance

Status: `PASSED` for bounded write-history implementation, local verification and
fresh review instance 1 of 3, verdict **Ready**, with no actionable findings.
The reviewer examined the explicit working diff from archive base
`2274a6c7c751ded537541438f473e81ccd293457` and the source hashes in ORIGINS.
No implementation changed after that freeze. This acceptance note and the review
metadata are the only post-review edits. The reviewer independently ran offline
Go1.25.13 test/race/vet/build and verified source/reference/log hashes. The six
mutant logs were inspected, not independently rerun; race-test success is not a
claim of concurrent API safety. This projection is sequential and inert.

The canonical continuation retains the full report and independent preliminary
ledger under `.planning/c5b19-settlement/`; report SHA256
`949c324bd0a069f2cb63b06fb429a1c46537b81211a74351ad47d5e9ce72fb2a`. The archive PR links that canonical delivery.
Historical G3a/G3a2 reviews and limitations remain unchanged. Full Gate3 remains
`IN_PROGRESS — TRENDING_GOOD`; Gate4–6 and product admission remain `BLOCKED`.
The draft remains unfinished experiment work, with no child execution authorized.

## G3a4 event-envelope and lane-framing conformance

Status: `PASSED` for bounded implementation and local checks; fresh independent
review is `IN_PROGRESS — TRENDING_GOOD` (not yet accepted). Full Gate3 remains
`IN_PROGRESS — TRENDING_GOOD`; child execution, Gate4–6 and product admission
remain `BLOCKED`. Continue from exact archive head
`6575898a32ff4a3d24ca4c757f42b1807798a372` and canonical reference
`2aefb15ee45018bb1045e711c77a0c7bc9f4c54d`. Earlier review counts and historical
source/log hashes remain unchanged; this is a distinct G3a4 delta.

The accepted pre-implementation scope is a pure 256-byte event-envelope decoder
and bounded lane-framing checker in existing `tests/oracle.go`, with tests in
existing `tests/oracle_test.go`. The exact Gate2 packet's raw-trace fields are
mechanically decoded at their fixed big-endian offsets, including signed32
syscall result and errno. All decoded arrays are value-owned. Errors return a
zero event; no caller memory is retained or changed. Valid bindings are checked
using the existing obligation validator, but the event digest covers only its
exact Bindings[240], not the full obligation preimage. Timebase must match the
caller's exact nonzero expected pair. Magic/version, lane1–3, kind1–29,
outcome0–3, application0–2 and all ten reserved zero bytes are enforced.

The finite lane checker rejects empty, partial, over-capacity and mixed-lane
input before granting envelope acceptance. Caps are32768 control,1024 worker,
64 harness. It checks exact lane-local sequence continuity with overflow refusal
and the private nondecreasing control tick watermark. Equal control ticks are
preserved; it never sorts or merges lanes or carries state between calls.
Gate2 does not fix the writer's first index to0 or1. The API therefore requires
an explicit trusted `firstSequence` parameter, never inferred from the raw
input. This establishes continuity only relative to that parameter, not complete
capture. Future writer/oracle integration must resolve its expected origin.

Envelope acceptance is **not** event semantic validity or a full-case pass.
The literal deliberately carries a harness-kind value on control plus arbitrary
non-common fields to make this boundary observable. Kind28 can also decode;
that does not make a trace fault passing evidence. Per-kind required/forbidden
fields and lane ownership, captured-frame pairing, operation/candidate matching,
received/applied pairs, complete captures, causal transitions, clocks/bounds,
real custody/absence and native/store/build/run closure remain deferred. Existing
writeHistory is untouched and disconnected. No start/stop/permission/completion/
release method or simulated lifecycle effect is added.

BUILD-NARROWLY dependency-policy record: applicable ecosystem row is C5b19
prospective Supervisor control/storage lane exchange (ADOPT-PLATFORM /
BUILD-NARROWLY). Trust class is synthetic test/evidence only; exact locally cached
Go1.25.13 and standard-library BSD-style primitives are the entire dependency
graph. No dependency, source-manifest, module, go.sum or platform API addition.
Only finite caller-owned byte slices are read, with per-lane iteration/input
caps; no process, clock, filesystem, network, credential, user data, service,
signal, wait, store, lock or goroutine effects occur in these functions/tests.
Refusal has no state mutation. Malformed/substitution/size/overflow/restoration
checks below establish the bounded policy; Capsule maintainer owns upgrade or
removal. The separately patched canonical Go toolchain does not change this
frozen archive pin or admit any runnable host profile.

### G3a4 test-first and verification evidence

Every command used this exact offline prefix from this experiment directory:

```sh
GOCACHE=/tmp/c5b19-g3a4-go-cache GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off /Users/dsteele/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.25.13.darwin-arm64/bin/go
```

Before implementation, `test ./... -count=1` failed compilation on the expected
missing symbols. Retained excerpts: `tests/oracle_test.go:596:10: undefined:
eventEnvelope`, `:609:14: undefined: decodeEventEnvelope`, and `:728:15:
undefined: validateLaneEnvelope`; final line `FAIL [build failed]`. No implementation
was present at this point. The command wrapper then encountered zsh's read-only
`status` variable while attempting to report the exit code; the actual Go red
output was already captured, and subsequent commands use `result_code`.

After implementation, `test ./... -count=1`: exit0, `ok ... 0.260s`.
`test -race ./... -count=1`: exit0, `ok ... 1.786s`.
`vet ./...`: exit0, no diagnostics. `build ./...`: exit0, no diagnostics.
`git diff --check`: exit0. No fixture or child was executed. Race-test success
is not a claim of concurrent API safety or live control behavior.

The literal256-byte known answer was assembled independently with Python
struct big-endian encoding and hashlib; it asserts every decoded field,
negative signed values and high unsigned values. The binding known answer is
`7a06ffea981ff10e3292aaf1ac5ea6e6b913648f4e02d965f27da588072009c9`.
Tests cover every shorter length, trailing byte, all reserved bytes, unknown
closed-code boundaries, all1044 known lane/kind/outcome/application combinations,
all ten individually changed valid/zero bindings, representative duplicate ID
and digest bindings with matching raw hashes, stale/full-obligation hashes,
nonzero exact timebase, zero/max-u64 values and copied ownership.
Lane tests cover exact cap/cap+1 for every lane at origins0/1/123456789, unknown
lane, empty/partial/trailing inputs, every position in a3-record stream for
sequence gap/duplicate/mixed lane/malformed frame, adjacent reorder, max-to-zero
wrap, a single MaxUint64 index, equal/regressed control ticks and independence
of worker/harness observations. These are envelope streams, not valid causal
traces, timing evidence or the deferred paired-wait simulation.

### G3a4 targeted mutation sensitivity

Each temporary source mutation below was applied alone, then ran
`test ./tests -run '^TESTNAME$' -count=1`. All compiled and exited1 through the
intended assertion. Exact original bytes were restored in a finally block after
each check. No mutant remains; selected sensitivity is not exhaustive proof.

| Mutation | TESTNAME | Failing assertion |
| --- | --- | --- |
| binding | TestEventEnvelopeRefusesMalformedCommonFields | `invalid envelope returned` |
| reserved | TestEventEnvelopeRefusesMalformedCommonFields | `invalid envelope returned` |
| sequence | TestLaneEnvelopeSequencesAndOverflow | `wrong sequence accepted` |
| capacity | TestLaneEnvelopeCapsAndFraming | `cap+1 accepted` |
| control-tick | TestLaneEnvelopeControlTickOrderAndIndependence | `control tick regression accepted` |
| signed-offset | TestEventEnvelopeKnownAnswerAndOwnership | `decoded fields =` |

Restored oracle.go SHA256: `4d7010b67089bd8d25e3c6f35101e9652c66e7147bcb5210e2103b3314f34f4b`.
Restored `test ./... -count=1`: exit0, `ok ... 0.306s`.

Current source hashes (older slice hashes remain historical):

- `go.mod`: `5f40cde18c2d82fe5d57f3a8822377c12e473f1026f174165dfecd126bea3eeb`
- `tests/oracle.go`: `4d7010b67089bd8d25e3c6f35101e9652c66e7147bcb5210e2103b3314f34f4b`
- `tests/oracle_test.go`: `d134a318eb49335c3113e35fb42928ebc427022612413b7925c5fbe514cdc234`
- `tests/model_test.go`: `b0f3b9d063c225eb887cecaf16f4058f0ed07ae8f14c3d92c49acacabb0a931e`

Raw `/tmp/c5b19-g3a4-<name>.log` files are ephemeral; commands/results/excerpts
above and these hashes are the retained evidence:

- `red`: `27bce6238496353a53786c0a68e97ba0e87c07a3fd5915fc138c8c4e816f6737`
- `green`: `d836e56b1539e13fc90fa86073176f516cbda85c56794e58e9ae5dc394594ff6`
- `race`: `61e2fa7c65cf037fa1b7a2ed92663c87ae223b6a2d8db13d4a457f3cba67c8c5`
- `vet`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `build`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `restored`: `130be73d22e5fbaa7861f8e425060473e1ecbab5df11822a2c832305cded9cd2`
- `mutant-binding`: `0b8d3648d168be5f7126fa8130e435c18c9fd9da3d4168be020270c363cb2ee3`
- `mutant-reserved`: `bdb95daab4d075d064532a02e43637e8a823d7ad89f66d5fd7cfc03b69dd8352`
- `mutant-sequence`: `13973a49f9b314d1322adf59eb68d946391524f6abf7fa46ca3271b23d4db837`
- `mutant-capacity`: `444b5cfa796bab55d7bbd79e23e0cfbecc30e2e2bc0f1a782acdcdc607a76ef7`
- `mutant-control-tick`: `24e60bd01fb053f5d021ae059ceede20ed8b8a922516feac71d043f659d81388`
- `mutant-signed-offset`: `b3f74138f091cd50b6be719499cd6f9242e1c7d39e8d561a87c9cd760b77cfb9`

Fresh independent review of this exact G3a4 delta is pending (max3 instances).
Brain owns source freeze, review reconciliation, commits, both PR destinations,
immutable canonical links and any later gate decision. No child execution is
authorized by this increment or its eventual acceptance.

### G3a4 acceptance

PASSED: fresh independent review instance1/3 returned **Ready**, no actionable
findings. The reviewer independently ran exact offline test/race/vet/build,
verified source/reference/log hashes and inspected all mutation logs; mutants
were not independently replayed. Full report retained in canonical
`.planning/c5b19-events/review-1.md`, SHA256 `9b4a00d4eaedfe9abfe17de33d5fcef38dc6849086f8212f13b826d794647f64`.
Reviewed oracle/test bytes are unchanged; only acceptance metadata was appended
after freeze. Publication is owned by the Brain. Full Gate3 remains
IN_PROGRESS — TRENDING_GOOD; child execution, Gate4–6 and product admission BLOCKED.

## G3a5 event field shape and lane ownership

Status: `PASSED` for bounded implementation and local verification; fresh
independent review is `IN_PROGRESS — TRENDING_GOOD` (pending). Full Gate 3
remains `IN_PROGRESS — TRENDING_GOOD`; child execution, Gates 4–6 and product
admission remain `BLOCKED`. Archive baseline is
`3e26b809a40832a3351fdc6b5e0ffc1ef0094792`; canonical reference is
`fe3d22c84b5d41e0a4edbfacb531563040e16995`. Earlier review counts, limitations
and source/log hashes stay historical and unchanged.

The accepted pre-implementation scope adds only `decodeEventFields`, an opt-in
raw-byte wrapper around the unchanged G3a4 envelope decoder. A visible 29-kind
field/lane table permits only the named non-common fields. A fixed presence
mask rejects every forbidden nonzero field. Required operation tuples contain
nonzero operation/request/candidate identifiers and generation 1 through
2^53-1. Identity-bearing events require nonzero identity and PID 1 through
2^31-1. The spawn-result PID may also be zero, with no guessed syscall success
relation. Outcome-bearing records require outcomes 1–3; application decisions
on kind 8 require 1 or 2. Transport kinds 5–8 require a nonzero record digest
exactly for confirmed outcome; store kind 27 always has zero record digest.
Store-edge sites are exactly 1–4. Nonzero wait status requires a result matching
the recorded PID; zero wait status remains allowed. Signed syscall/errno fields
are preserved without guessing result/errno success rules. Common tick/anchor
scalars can be zero; this local check does not establish observation presence.
Every error returns a zero event. Caller bytes and returned arrays are independent.

The supported matrix is the Gate2 field table interpreted within these explicit
limits: payload-free harness kind 29 only; complete represented replies for both
kind 8 decisions; no mapping for optional harness identity or arbitrary malformed-
reply diagnostics. Refusing those unmapped variants means unsupported by this
subset, not universally forbidden by the whole frozen packet. The existing
syntactic envelope API remains unchanged. No new lane walker, write-history
settlement, authority method, source file, native code or live effect is added.

A locally accepted absence shape without a prior wait remains insufficient
absence evidence. A locally accepted trace-fault shape is still failure evidence
for the future case oracle. Field acceptance does not verify raw sidecars,
request/candidate equality, received/applied or wait pairs, custody, terminal
status bits, causal transitions, clocks/bounds, real storage confirmation,
completion or release. These remain later work; no first-run gate is opened.

Dependency-policy record: the C5b19 prospective Supervisor control/storage lane
exchange row recommends ADOPT-PLATFORM / BUILD-NARROWLY. This increment uses
only BUILD-NARROWLY fixed parsing, the already-pinned Go 1.25.13 standard library
and inherited BSD-style toolchain provenance. No dependency, go.sum, module,
platform API, frozen manifest entry or product import is added. Input is exactly
256 bytes before the fixed 29-row and 14-field checks. No allocation proportional
to unchecked input size occurs. Trust class is test/evidence only, authority is
none beyond interpreting owned synthetic bytes, and refusal changes no state.
There are no child/guest, process-target, signal/wait, filesystem/store, network,
credential, real-clock, service, user-data or goroutine effects in new code/tests.
Capsule maintainer owns upgrade/removal. Offline reproduction, boundary faults,
mutation sensitivity and exact restoration are retained below.

### G3a5 test-first and verification evidence

Every Go command used the exact locally cached toolchain from this experiment:

```sh
GOCACHE=/tmp/c5b19-g3a5-go-cache GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off /Users/dsteele/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.25.13.darwin-arm64/bin/go
```

Before implementation, `test ./... -count=1` exited 1 with missing-symbol
compiler errors, including `tests/oracle_test.go:938:11: undefined:
decodeEventFields`, followed by `FAIL [build failed]`. The new wrapper did not
exist. After implementation, the same command exited 0 (`ok ... 0.261s`).
`test -race ./... -count=1` exited 0 (`ok ... 1.795s`). `vet ./...` and
`build ./...` exited 0 with no diagnostics. `git diff --check` exited 0.
Ordinary compiler/unit-test execution did not execute an experiment child.

Fixtures independently transcribe byte offsets from the packet into test-owned
bytes, not implementation masks or production encoders. The unchanged G3a4
literal binding hash anchors common fields. All 29 kinds are tested across all
three lanes; all 31 supported kind/lane shapes preserve the envelope fields.
Every forbidden non-common field is injected independently. Positive and negative
cases cover required tuple/identity members, generation 0/max/max+1, PID 0/max/
max+1, all represented reply outcomes with both kind 8 decisions, missing/extra
record digests, all four store sites and invalid boundaries, confirmed store
outcome without a record digest, zero and nonzero wait status with matching or
wrong returns, signed spawn/errno observations, zero scalar observations,
envelope refusal composition, zero error results and ownership. Existing G3a4
broad syntax tests stay unchanged. No syscall success or causal pass is inferred.

### G3a5 targeted mutation sensitivity

Each one-at-a-time source mutation ran `test ./tests -run '^TESTNAME$' -count=1`.
All eight compiled and exited 1 through the intended assertion. A finally block
restored exact original source bytes after each test; no mutant is retained.
These are selected guard-sensitivity checks, not exhaustive proof.

| Mutation | TESTNAME | Retained failing assertion |
| --- | --- | --- |
| lane | TestEventFieldsAllKindsAndLanes | `invalid event fields returned` |
| forbidden | TestEventFieldsEveryForbiddenField | `invalid event fields returned` |
| tuple | TestEventFieldsRequiredTupleAndIdentity | `invalid event fields returned` |
| identity | TestEventFieldsRequiredTupleAndIdentity | `invalid event fields returned` |
| store-record | TestEventFieldsStoreSitesAndOutcome | `store outcome with zero record digest refused` |
| reply-coupling | TestEventFieldsReplyOutcomesAndDecisions | `invalid event fields returned` |
| store-site | TestEventFieldsStoreSitesAndOutcome | `invalid event fields returned` |
| wait-return | TestEventFieldsWaitAndSpawnLocalShapeOnly | `invalid event fields returned` |

Restored `oracle.go` SHA256: `d82c587990d8516e89b442d1d89707fed7a2114a6a906c9b76a624dfd39fd114`.
Restored `test ./... -count=1`: exit 0, `ok ... 0.236s`.

Current source hashes (older slice hashes remain historical):

- `go.mod`: `5f40cde18c2d82fe5d57f3a8822377c12e473f1026f174165dfecd126bea3eeb`
- `tests/oracle.go`: `d82c587990d8516e89b442d1d89707fed7a2114a6a906c9b76a624dfd39fd114`
- `tests/oracle_test.go`: `fb643536635b8e73fb2c2d52aeae782b7350162613b09577a01cbc50f34ad410`
- `tests/model_test.go`: `b0f3b9d063c225eb887cecaf16f4058f0ed07ae8f14c3d92c49acacabb0a931e`

Raw `/tmp/c5b19-g3a5-<name>.log` files are ephemeral. Commands, results and
excerpts above remain retained alongside these log hashes:

- `red`: `c813e98a946e71940b4f769e12c9324bfce187715ade36a9212d44b6f9143ae1`
- `green`: `a4b3ab9dfeb04a6f059fb0092c9c81d86645d4d11c1f8ab0b9c2e51364ea0309`
- `race`: `717cd6c8ae93adf9f48fa127a2e9e7a28e4bfe9daf674e945942dcffbd0667f3`
- `vet`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `build`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `restored`: `d4710b8cb96e035d9ccca9bf8620476fefee4534d99030c3f86b19cf9b9690e2`
- `mutant-lane`: `29ae5a6845eae5df27ee1b356a9386ceb217af2ed139f10d6ede00338236614e`
- `mutant-forbidden`: `98178f3cb4655f68fda1e47e6a05f3a1131ebdea0bb5b49ae88ff8112732b9aa`
- `mutant-tuple`: `6edd6c920b7b2f93671b404a3baefd08bc95e439b6875af8f0fa4ebdfc130471`
- `mutant-identity`: `0b5d11e9b80f68774567d0bf51273cc9f951054c68f48b641e2b05aa173b0765`
- `mutant-store-record`: `42456a617960b494d1f27f6ba9c465b2467f71b89fc1cf3c34f1b06f4410a153`
- `mutant-reply-coupling`: `3263d47b28e8d3ff7770616d2edccae276a5fbdeb4e8d50e2bb11bf8a8c93eed`
- `mutant-store-site`: `af6360cfdad899c260bd9fa56ea15446665cd85f72d2fca561df5fc3797cfa75`
- `mutant-wait-return`: `d873c5274437121fc066f0d03b7b905915abd28c6e2327038294ff95f3c153a7`

Fresh independent review of this distinct G3a5 delta is pending (maximum three
instances). Brain owns source freeze, review reconciliation, both PR destinations,
commits and exact immutable canonical links. Prior acceptance is not reused as
review of these bytes. All lifecycle execution and admission gates stay closed.

### G3a5 acceptance

PASSED: fresh independent review instance 1 of 3 returned **Ready**, no actionable
findings. The reviewer independently ran exact offline test/race/vet/build and
verified source/reference/log hashes. Mutation and canonical CI results were
inspected as retained evidence, not rerun. Full report retained canonically at
`.planning/c5b19-event-fields/review-1.md`, SHA256 `2d3d7cba6b135a4dc42d6ae7dfadc1927e257482dd5127d909f1f5a9acc1c940`.
Reviewed Go/test bytes remain unchanged; only acceptance metadata was appended
after freeze. Brain owns immutable publication. Full Gate 3 remains
IN_PROGRESS — TRENDING_GOOD; child execution, Gates 4–6 and admission remain BLOCKED.
