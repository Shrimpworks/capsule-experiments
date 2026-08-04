# Production CBOR/COSE profile comparison

This is a defensive, local-only dependency-selection experiment. It compares exact pinned public
modules with Capsule's retained byte-exact fixtures and current handwritten bounded implementation.
It does not wire either module into a product authority path, use a live key, contact a signing
service, resolve network identifiers, start IPC, or create a runtime, backend, or guest.

The experiment asks two narrow questions:

1. Can `github.com/fxamacker/cbor/v2 v2.9.2` replace object-specific deterministic encoding and
   typed field decoding while Capsule retains predecode limits, canonical-on-wire comparison,
   closed shape validation, trusted role bindings, and exact-byte identity?
2. Can `github.com/veraison/go-cose v1.3.0` replace enough of Capsule's narrow COSE_Sign1 work to
   justify its production parsing and cryptographic-envelope surface?

The handwritten implementation remains the independent oracle. The candidate profile is a
development-only package in this standalone module; product packages must not import it.

## Reproduce offline

After one explicit connected prefetch has populated the exact modules, all decisive commands are
run with module lookup disabled:

```sh
cd experiments/production-cbor-cose-profile
GOTOOLCHAIN=local GOCACHE=/tmp/capsule-profile-go-cache GOPROXY=off go mod verify
GOTOOLCHAIN=local GOCACHE=/tmp/capsule-profile-go-cache GOPROXY=off go test ./...
GOTOOLCHAIN=local GOCACHE=/tmp/capsule-profile-cbor-fuzz GOPROXY=off \
  go test -run=^$ -fuzz=FuzzExecutionPlanProfile -fuzztime=30s
GOTOOLCHAIN=local GOCACHE=/tmp/capsule-profile-cose-fuzz GOPROXY=off \
  go test -run=^$ -fuzz=FuzzApprovalProfile -fuzztime=30s
GOTOOLCHAIN=local GOCACHE=/tmp/capsule-profile-bench GOPROXY=off \
  go test -run=^$ -bench=. -benchmem -benchtime=2s -count=3
```

The footprint commands under `cmd/` make the stdlib baseline, fxamacker-only surface,
go-cose-plus-fxamacker surface, and complete comparison wrapper reachable to the Go linker. They
are measurement tools, not product commands.

See [RESULTS.md](RESULTS.md), [dependency identities](evidence/dependencies.json), and
[measurements](evidence/measurements.md).
