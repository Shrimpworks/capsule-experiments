# Gate C P0-3 backend-independent protocol conformance experiment

Status: development-only disposable research. Product packages must not import it. The layouts,
limits, status values, classifications, and fixtures are falsifiable candidates, not a frozen
Capsule product contract or backend admission.

Owner: Capsule maintainers, Gate C P0-3.

Removal/replacement condition: replace the Go model only after the later protocol ADR freezes a
cross-language contract and the exact trusted launcher, governed virtio-console implementation,
host runner, installed bundle, and Supervisor integration pass the complete P0-3 corpus. Retain the
byte vectors and `RESULTS.md` as decision evidence.

## Defensive scope and question

This experiment defensively validates typed source, inline-input, and completion framing using only
repository-owned byte fixtures and local in-memory streams. It creates no guest, consumes no
approval, starts no runtime or backend, grants no authority, and accesses no unrelated system,
identity, credential, or data.

Question: can independent Go and Node implementations make source/input roles, exact byte limits,
attempt and plan bindings, terminal status, and completion commitment mechanically falsifiable
while local process-pipe receivers continuously drain cap-plus-one and refuse to infer completion
from EOF or process exit?

## Proposed exact maxima

All maxima are inclusive. Every cap-plus-one case fails instead of resizing.

| Byte class | Candidate maximum | Rationale |
| --- | ---: | --- |
| Registered source payload | 1,048,576 | Matches the proposed aggregate source-byte parser ceiling in ADR-0023. Transport must not silently authorize more source than the registered public boundary admits. |
| Canonical inline-input payload | 262,144 | Matches the proposed canonical inline-input ceiling in ADR-0023, measured after canonical serialization rather than against the caller's JSON spelling. |
| Inline-result JSON payload | 262,144 | New first-slice candidate. It keeps one result in the same bounded content class as inline input and below a 257 KiB physical frame while leaving console prefixes and future file artifacts separate. |
| Physical completion frame | 262,368 | Exact derivation: 160-byte completion header + 262,144-byte JSON payload + 64-byte commit trailer. It is not rounded up to a larger transport budget. |

The derived physical maxima for the source and input streams are 1,048,728 and 262,296 bytes,
respectively: their payload cap plus one 152-byte data header. The retained measurement runs exact
and cap-plus-one streams with 1-, 7-, 4,096-, and 65,536-byte reads. Performance observations are a
sanity check only; continuity with already-proposed parser authority is the primary limit rationale.

## Candidate byte layouts

All integers are unsigned big-endian. IDs are 16 opaque nonzero bytes. Digests are SHA-256. The
attempt and registration ID fields must be role-distinct; equal values are rejected as a domain
error. No field is inferred from endpoint names alone: the dedicated endpoint, magic, and role must
all agree.

### Source and canonical-input envelope

The source and input roles use the same 152-byte structural shape but different magic and role
values. Source magic is `CAPSRC01`, input magic is `CAPINP01`.

| Offset | Bytes | Field |
| ---: | ---: | --- |
| 0 | 8 | role-specific magic |
| 8 | 2 | version, exactly `1` |
| 10 | 2 | role: source `1`, input `2` |
| 12 | 4 | header length, exactly `152` |
| 16 | 16 | attempt ID |
| 32 | 16 | Supervisor registration ID |
| 48 | 32 | exact registered plan digest |
| 80 | 32 | exact admitted runtime-profile digest |
| 112 | 8 | payload byte length |
| 120 | 32 | SHA-256 of exact payload bytes |
| 152 | declared | payload |

The source payload is opaque exact registered source-transfer bytes in this experiment. The later
contract must decide whether the first executable slice admits one source file or defines a
separate deterministic multi-file transfer object; this experiment does not silently invent that
object. Inline input is the already-defined canonical JSON byte representation.

### Completion/result frame

Completion magic is `CAPCMP01`. Its 160-byte header reuses the first 152 bytes above with role `3`,
then adds a terminal status and zero-only extension space.

| Offset | Bytes | Field |
| ---: | ---: | --- |
| 0 | 152 | common typed header and payload digest |
| 152 | 2 | terminal status |
| 154 | 2 | flags, exactly zero |
| 156 | 4 | reserved, exactly zero |
| 160 | declared | strict inline JSON payload |
| after payload | 64 | fixed commit trailer |

The closed candidate status set is: `1` succeeded, `2` workload failed, `3` result invalid, and `4`
child terminated. Non-success statuses carry exactly the JSON literal `null`; this prevents an
error status from becoming an unbudgeted guest-string channel. These values remain candidates.

The inline JSON checker requires strict UTF-8, one document, no BOM or duplicate decoded keys,
safe-integer-only numbers, depth at most 32, at most 8,193 values, at most 4,096 total object
members/array elements, and at most 256 members/elements in one container. It does not establish
cross-language agreement or replace a later bounded Broker validator.

### Fixed commit trailer

Trailer magic is `CAPCMT01`.

| Trailer offset | Bytes | Field |
| ---: | ---: | --- |
| 0 | 8 | commit magic |
| 8 | 2 | version, exactly `1` |
| 10 | 2 | trailer length, exactly `64` |
| 12 | 2 | completion role, exactly `3` |
| 14 | 2 | reserved, exactly zero |
| 16 | 16 | attempt ID, equal to the frame header |
| 32 | 32 | SHA-256 of the complete 160-byte header and exact payload |

The only valid trailer offset is `160 + declaredPayloadLength`. An occurrence of the magic inside
the payload is only payload data. A trailer at another structural offset, a duplicate trailer, a
second frame, or any trailing byte fails. The trailer commits the header—including status and every
binding—and payload, and the trusted launcher must write this complete 64-byte value last.

## Streaming and terminal semantics

`DrainCapPlusOne` reads until the endpoint closes or an independent context deadline/failure fires.
It retains at most `physicalCap + 1` bytes but continues draining every later byte. The validator
uses the separately counted total drained bytes, so a flood cannot hide behind the retained prefix.

EOF means only that the stream ended. A completion record exists only if the fixed trailer is valid
at its calculated offset and there is no trailing data. Runner lifecycle is evaluated separately:

- EOF plus a clean runner exit without a trailer is `MISSING_COMMIT`;
- a valid committed frame plus a runner crash preserves the frame observation but is not ordinary
  success; and
- a reader stall/death or oversized flood is a framing failure even if the runner exited zero.

Ordinary product success would additionally require the independent input-integrity,
runtime-integrity, bounded-result, runner-lifecycle, and teardown dispositions named in the P0
reconciliation. This local model deliberately cannot manufacture them.

## Retained corpus

`fixtures/manifest.json` records SHA-256 and length for 43 byte fixtures covering exact and
cap-plus-one source/input/result limits, truncation, wrong and stale bindings, duplicate IDs and
frames, role swaps, malformed headers/lengths/JSON, invalid status and non-success payloads,
early/missing/duplicate trailers, trailing data, bad payload/commit digests, runner-zero without a
commit, and crash before/after commit. Tests additionally inject a four-times-cap output flood,
reader stall, and partial-read-then-reader-death.

`evidence/measurement.json` retains the original Go environment, commands, read chunk sizes,
drained/retained byte counts, dispositions, and elapsed observations. The independent dependency-
free Node 22 verifier rechecks all 43 retained lengths, SHA-256 values, layouts, big-endian fields,
roles, bindings, completion status, and commit-last trailer semantics without importing the Go
model. It independently encodes six accepted known answers byte-for-byte. Its local child-process
pipe harness covers one-byte writes, zero progress/stall, partial reader death, peer close/EPIPE,
backpressure flood, cancellation/teardown, runner death before/after commit, endpoint confusion,
and EOF/clean-exit refusal. The observed summary is retained under `evidence/2026-08-03/`.

## Reproduce

From the repository root:

```sh
./experiments/gate-c-p0-3-protocol-conformance/run.sh
```

The script requires the repository baseline of Node 22 or newer in addition to Go 1.23 or newer.

Regenerate deterministic byte fixtures and refresh local measurement observations with:

```sh
GOCACHE=${TMPDIR:-/tmp}/capsule-p0-3-go-cache \
  go run ./experiments/gate-c-p0-3-protocol-conformance/cmd/p0-3-conformance
```

The generator intentionally rewrites only this experiment's `fixtures/` and `evidence/` trees.

## Claim boundary

Passing this experiment says only that the candidate is independently falsifiable in local Go and
Node models and local process pipes. It does not show that libkrun directionality, virtio queue/
control parsing, shutdown, descriptor ownership, App Sandbox behavior, launcher/runtime authority,
a guest kernel, Broker parsing, or an installed bundle is safe. It does not freeze an ADR, admit a
runtime/backend/profile, prove workload correctness, or attest an uncompromised guest.
