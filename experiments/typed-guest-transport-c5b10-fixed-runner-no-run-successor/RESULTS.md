# C5b10 results

Scoped C5b-S1 status: `PASSED`.

Parent C5b controlled execution: `BLOCKED`.

Runtime/profile admission and product admission: `BLOCKED`.

## Observations

- Two independent constructions produced byte-identical Mach-O arm64 objects for the fixed runner
  and Supervisor driver.
- The new runner source binds the exact C5b7 100,663,296-byte root and SHA-256
  `5ad18f20cbc97c7a70ead3e795fd3649672513323041e913b0eb55b7acc88775`.
- `fixed-runner.o` imports the closed thirteen-symbol libkrun surface; the retained libkrun dylib
  exports all thirteen.
- `supervisor-effect-driver.o` imports zero libkrun symbols and exactly fourteen typed Supervisor
  provider symbols. It exports only `_c5b10_drive_registered_attempt`.
- The public drive surface accepts only `registrationId`; attempt, plan, profile, and fixture
  bindings remain fixed and every provider result must echo them exactly.
- Nominal order is: fixed endpoints, fixed runner spawn, ready verification, source write, input
  write, writer closure, start byte, completion drain/validation, terminal join, authoritative
  absence, fixed-root removal, durable completion commit, stored delivery. Teardown is fault-only.
- The exact source, input, and completion frames remain within physical/retention caps, and the
  completion trailer is last.
- Closed inventory verification and all seventeen restored-invalid mutations pass.

## Four preflight contradictions

| Contradiction | Successor resolution |
| --- | --- |
| Runner/root identity | New runner constants and object bind the exact C5b7 root; the historical runner identity is not accepted. |
| Effect order | Both frame writes and writer closure precede the start byte; completion, join, absence, cleanup, commit, and delivery are ordered afterward. |
| Per-effect ABI | Fourteen distinct typed Supervisor provider symbols replace the historical single operation port. |
| Duplicate libkrun ownership | Only the fixed runner imports libkrun; the Supervisor driver and historical root-bound effect object do not own libkrun execution. |

## No-run proof

The immutable profile records `host: null`, `guest: null`, `executionAuthorization: null`, and
`executionAuthorized: false`. Every performed-effect boolean is false. The build creates unlinked
objects only. Verification performs byte hashing, structured parsing, source inspection, `nm`, and
disposable metadata mutations; it does not load or invoke a candidate object or dylib.

Therefore this exact successor is `PASSED` only as construction/static evidence. No controlled
execution, security-control validation, runtime/profile admission, or product admission follows.

## Limitations and unresolved questions

- Supervisor provider implementations, platform error semantics, crash/restart convergence, and
  installed protected-state integration are absent.
- Static ordering does not prove bounded writes, drain behavior, terminal join, authoritative
  process-tree absence, fixed-root cleanup, or commit-before-delivery on a real host.
- Preferred-form libkrunfw/kernel source compliance remains separate.
- Independent review and a final exact execution authorization remain mandatory before any run.
- The original Capsule hash expansion and initial sibling-path blocker were corrected by the
  orchestrator before construction; both are retained in the profile limitations.
