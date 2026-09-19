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

## Current slice

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
were restored. Review instance 3 remains pending; passing local checks alone
do not close this independent-review gate.

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
