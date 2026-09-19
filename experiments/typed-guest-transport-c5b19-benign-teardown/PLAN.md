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

The only implemented behavior is a pure Go, offline cancellation-frame parser
with a literal 57-byte vector and mutation/refusal tests. It cannot create,
inspect, signal, or wait for any process and is not the eventual executable
oracle. Red/green evidence: first `go test ./...` failed because
`cancelBindings` and `validateCancellationFrame` were undefined; after the
minimal implementation, the tests passed. All remaining Gate-2 manifest
source, native control, store, full trace oracle, build scripts, and negative
fixtures remain unimplemented. `go build ./...` and `go vet ./...` are required
for this slice. No experiment result or security/timing claim follows.

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
