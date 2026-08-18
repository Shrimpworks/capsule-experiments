# C5b11 results

C5b-S1A: `PASSED`. Parent C5b and all admission states: `BLOCKED`.

## Observed

- Attempt runtime profile SHA-256: generated and independently checked from
  `contracts/attempt-runtime-profile.json`; it differs from and rejects the C5b8 digest.
- Attempt plan SHA-256: generated from the fixed identifiers, new runtime profile, and payloads.
- All three frames carry both new digests. Completion parsing covers protocol, method, role, header
  length, AttemptID, RegistrationID, plan/profile, status, flags, reserved, payload, and every fixed
  trailer field.
- Two builds produced byte-identical unlinked objects. `fixed-runner.o` alone imports the exact 13
  libkrun symbols. `supervisor-effect-driver.o` imports zero libkrun symbols, exactly 23 closed
  provider symbols, and exports only the registration-ID entry.
- The independently derived reconciliation matrix covers 65 primary failures, seven created-path
  recovery interruptions, four stored-completion recovery interruptions, and five teardown-result
  dispositions. No path redrives a non-idempotent effect.
- All 38 restored-invalid mutations refuse and the original verifies after each case.

## Four retained contradictions

| Contradiction | C5b11 resolution |
| --- | --- |
| Runner/root identity | The attempt profile binds exact runner/root/runtime bytes; every frame/effect selects that profile. |
| Effect sequencing | Nominal completion-last order is fixed; every post-creation fault converges through fence, lookup, one teardown request, reconciliation, terminal join, absence, and root removal, or durable unresolved state. |
| Per-effect ABI | 23 typed providers separate nominal operations, reconciliation lookups, durable unresolved cleanup, and exact stored replay. |
| Duplicate libkrun ownership | Only the fixed runner imports libkrun; the Supervisor driver imports none. |

## C5b10 review findings

C5b10/PR #30 remains immutable but not accepted evidence. C5b11 closes its stale-profile finding
with a non-self-referential attempt profile plus outer composition binding, and closes its
fault-path finding with executable-form C state flow, a derived state matrix, and direct mutations
for absence, root removal, teardown reconciliation, durable unresolved cleanup, and stored replay.

## No-run proof and limits

The immutable contracts record `host: null`, `guest: null`, `executionAuthorization: null`, and
`executionAuthorized: false`; every performed-effect field is false. Static compilation, hashing,
parsing, `nm`, and disposable metadata/source/frame mutation were the only operations.

Provider implementations and platform behavior are absent. The matrix does not prove real
teardown, absence, crash recovery, persistence, or replay. Fresh review, canonical reconciliation,
controlled execution authorization, runtime/profile admission, and product admission remain
`BLOCKED`.
