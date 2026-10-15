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
