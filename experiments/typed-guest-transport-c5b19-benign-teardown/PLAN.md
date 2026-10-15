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
