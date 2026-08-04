# Gate C P0-3 backend-independent framing results

Date: 2026-08-02; independent follow-up: 2026-08-03

Decision: **conditional pass for a falsifiable backend-independent candidate; do not freeze the
contract or connect a backend yet**.

The local experiment and independent Node follow-up support taking the proposed caps and layouts into the later protocol/ADR
review. It found no candidate-level ambiguity that requires abandoning fixed role envelopes or a
fixed last-written commit trailer. The conclusion is deliberately narrower than P0-3: no
virtio-console, launcher, runtime, guest, VMM, App Sandbox, approval, Supervisor, or teardown
mechanism participated.

## Question and authorized method

The question was whether exact source/input/result caps, role-separated attempt-bound headers, one
terminal completion frame, and last-written commitment can be made falsifiable independently of a
backend.

The method used only repository-owned deterministic byte fixtures and local Go readers in this
worktree. It created no guest, consumed no approval, granted no authority, ran no arbitrary
untrusted workload, and accessed no third-party system or deployment.

## Exact environment and build inputs

- Repository base revision recorded by the measurement run:
  `22aa6d7f48019fb537c751b5495e6ee9d3a4e955`.
- Host: Apple arm64 Mac, 10 logical CPUs. Serial and hardware identifiers were not retained.
- OS: macOS 26.5.2; Darwin 25.5.0.
- Go: `go1.26.5` (`darwin/arm64`). The repository requires Go 1.23 or newer.
- Dependencies: Go standard library only; no guest, runtime, libkrun, network, entitlement, or
  external service.
- Generator command:
  `go run ./experiments/gate-c-p0-3-protocol-conformance/cmd/p0-3-conformance`.
- Focused verification command:
  `./experiments/gate-c-p0-3-protocol-conformance/run.sh`.

The exact observed command/environment record is retained in `evidence/measurement.json`. Timings
are ordinary wall-clock observations on one developer host, not a performance guarantee.

The 2026-08-03 follow-up ran dependency-free Node 22.22.1 on the same local arm64 host from base
revision `68b75fdf41f3d6c5db72a5163b19da451eb6f766`. Its implementation does not import or call the Go
model. It verified every retained case length and SHA-256 against manifest SHA-256
`f4fd4ee1e1728e085eb8dd142890e1b4fd79749330bf746f6535eef3f3d342f6`, reproduced every expected
disposition, and independently re-encoded six accepted source/input/completion known answers. The
exact-cap fixture digests remained source
`c511109fde643ac10bd7f78d16a1c962b4263d0f87be3bba192d8eff25f6ba1e`, input
`7fea2562e7dcf0b01e89cc07671e93aa63ada96adc3b96376d7fa8b4b8e49aae`, and completion
`239c6abf0c3b0133d946cbe9cfd78b710a8e9abed9c0882435f64bd5b330c6df`.

## Proposed maxima and measurement result

| Maximum | Exact bytes | Boundary observation |
| --- | ---: | --- |
| Source payload | 1,048,576 | Exact 1,048,728-byte envelope accepted; 1,048,729-byte cap-plus-one envelope rejected `OVERSIZE`. |
| Canonical input payload | 262,144 | Exact 262,296-byte envelope accepted; 262,297-byte cap-plus-one envelope rejected `OVERSIZE`. |
| Inline-result JSON payload | 262,144 | Exact maximum JSON string accepted; a 262,145-byte JSON payload rejected `OVERSIZE`. |
| Physical completion frame | 262,368 | Exact header + payload + trailer accepted; byte 262,369 rejected `OVERSIZE`. |

Every exact and cap-plus-one measurement produced the same disposition with 1-, 7-, 4,096-, and
65,536-byte read chunks. The four-times-completion-cap flood supplied and drained 1,049,472 bytes,
retained exactly 262,369 bytes (`cap + 1`), and rejected `OVERSIZE`. This supports the bounded-memory
and continuous-drain construction in the model. It does not measure actual console buffering,
guest scheduling, cancellation latency, or VMM memory.

The caps are not claimed to be performance-optimal. Source and canonical-input values intentionally
match the already-proposed parser authority ceilings, avoiding a hidden transport widening. The
new inline-result value uses the same 256 KiB bounded-content class. The physical completion limit
is exact framing arithmetic rather than an independently rounded budget. A later ADR may narrow any
value; widening it requires new exact/cap-plus-one fixtures and resource evidence.

## Observed adversarial outcomes

The retained corpus contains 43 byte fixtures. Focused tests passed every expected disposition plus
three live stream faults.

| Required area | Observed model result |
| --- | --- |
| Truncation and oversize | Header/payload truncation failed; every payload and physical cap-plus-one failed; no budget resized. |
| Wrong, duplicate, and stale IDs | Wrong attempt/registration/plan/profile failed binding; known stale attempts failed `STALE`; equal attempt/registration roles failed `DOMAIN`; duplicate frames failed. |
| Swapped roles | Input on the source endpoint and source on the completion endpoint failed `DOMAIN`. |
| Malformed lengths and JSON | Wrong header/declared length placement, malformed syntax, duplicate decoded keys, second JSON document, invalid status, and non-null failure payloads failed. |
| Commit ordering | Early, missing, duplicate, mutated, wrong-attempt, and trailing-data commit cases failed. Only the fixed trailer at the calculated final offset committed. |
| Output floods | A four-times-cap stream was drained in full while retaining only cap-plus-one, then failed `OVERSIZE`. |
| Reader stall/death | Deadline closed a stalled endpoint and returned `READER_STALL`; partial bytes followed by an injected reader error returned `READER_DIED`. Neither became success. |
| EOF and runner exit | EOF and clean runner exit without a trailer remained `MISSING_COMMIT`. Runner exit never supplied commitment. |
| Crash before/after commit | Crash before trailer failed `MISSING_COMMIT`. Crash after a valid trailer preserved `ACCEPT` framing evidence but `ordinarySuccess` remained false because lifecycle failed separately. |

The independent local process-pipe harness additionally passed ten bounded fault classes: exact
cap/cap-plus-one draining for all roles, one-byte writes, zero-progress stall with forced kill,
partial reader death, peer-close `EPIPE`, real pipe backpressure with a four-times-cap flood,
cancellation, runner exit 17 before/after commit, three-way endpoint confusion, and EOF plus clean
exit without commitment. Retention never exceeded the role cap plus one. These are local process
semantics, not virtio-console observations.

The frame digest covers the complete completion header and payload, so terminal status and every
attempt/registration/plan/profile binding are committed. The payload digest remains separately
available for content identity. Source and input envelopes use endpoint role, distinct magic, fixed
length, payload digest, and registered binding; they do not use the completion trailer.

## Recommendation for later ADR/contract freeze

Carry this candidate forward, but freeze it only after all of the following review gates close:

1. Decide the exact source-transfer payload object (one file or a deterministic bounded multi-file
   object) without changing the 1 MiB aggregate authority implicitly.
2. Carry the now-independent Go/Node layouts, SHA-256 vectors, strict JSON behavior, and
   classifications into the selected launcher/Supervisor languages, including invalid UTF-8 escape
   and allocation-bound cases.
3. Specify whether the terminal status vocabulary belongs to the launcher protocol or a separately
   versioned result contract, and keep failure payloads fixed rather than guest-text-bearing.
4. Prove the launcher writes the trailer last, withholds the completion endpoint from the workload,
   verifies both inbound envelopes before child start, bounds child result streams, and waits for
   the exact child tree.
5. Run the same cases through the governed directional virtio-console implementation, including
   partial-then-error/zero writes, `SIGPIPE`, stop-aware shutdown, descriptor flag mutation,
   reader death/stall, invalid control IDs/events, queue fuzzing, and external exact forced teardown.
6. Keep ordinary success conjunctive: valid committed frame plus independent input integrity,
   bounded result, runtime integrity, clean runner lifecycle, and teardown dispositions.

If cross-language decoding cannot preserve this fixed layout and strict bounds, pivot the encoding
before ADR freeze. If the actual port implementation cannot continuously drain and terminate safely
under the required faults, use a governed bounds-checked, stop-aware transport change or reject
virtio-console for v0; do not weaken cap or completion semantics.

## Counterevidence and residual unknowns

- The source payload is opaque in this experiment; multi-file serialization remains unresolved.
- The Node implementation adds an independent strict decoder, including lone-surrogate refusal,
  but this work still did not prove identical decoded-text budgets, allocation behavior, or
  canonicalization in Swift and the selected launcher language.
- The drain model can close its local reader on deadline. It does not prove that the pinned
  libkrun/virtio-console stack wakes blocked reads/writes, propagates stop, accounts partial writes,
  or avoids thread joins and shared-status races.
- An in-memory reader does not model pipe/socket buffer pressure, guest resets, queue descriptor
  corruption, VMM compromise, cancellation races, `SIGPIPE`, or process death at machine-code
  instruction boundaries.
- The completion trailer rejects ordinary torn/stale/user-process-forged records only within the
  trusted-launcher model. It is not guest-kernel attestation and does not prove the workload ran
  correctly.
- No workload descriptor ownership, `/proc` visibility, child inheritance, fixed argv/environment/
  cwd, runtime identity, App Sandbox FD manifest, or installed recovery behavior was tested.
- Measurement covered one host and short local runs, not soak, concurrency, quantitative latency,
  memory-pressure, or production availability budgets.

## Retained evidence

- Candidate implementation and focused tests: this experiment directory's Go files.
- Byte layouts and reproduction instructions: `README.md`.
- 43 byte-exact vectors with size/SHA-256/expected disposition: `fixtures/manifest.json` and
  `fixtures/cases/*.bin`.
- Local environment and boundary/flood observations: `evidence/measurement.json`.
- Independent Node verifier, process-pipe fault harness, and observed summary:
  `cross-language/` and `evidence/2026-08-03/cross-language.json`.

Prototype disposal: product packages must never import this code. After contract freeze, replace it
with reviewed object-specific implementations and retain only the fixtures/results needed for
conformance and historical decision evidence.
