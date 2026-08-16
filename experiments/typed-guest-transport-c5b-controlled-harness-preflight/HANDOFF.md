# C5b controlled-harness preflight handoff

Static compatibility preflight: `PASSED`.

Exact direct operation-provider candidate: `NO_GO`.

Parent C5b controlled execution: `BLOCKED`.

Product admission: `BLOCKED`.

## Question and method

The slice tested whether exact C5b9 merge `3965e6b5cc87d476da7f431d7ed8a5758011a1b8`
could become runnable by implementing only its unresolved fixed operation symbol. It compared the
exact retained root/runner constants, statically inspected adapter ordering and Mach-O imports, and
ran closed-profile mutation tests. It did not execute a native artifact.

## Authorization and environment

The owner confirmed `Dylans-MacBook-Pro.local`, Apple silicon, macOS 26.5.2 (25F84), and one fresh
per-attempt Linux/arm64 guest built solely from the exact C5b9 merge as owned and disposable. This
handoff retains preparation scope only. Execution was not performed and remains separately gated
on final authorization naming a future immutable run manifest.

## Result and successor decision

The exact candidate is abandoned because of root identity mismatch, execution-order mismatch,
operation-protocol mismatch, and duplicate libkrun ownership. The successor must replace the
per-libkrun-call adapter surface with closed Supervisor-owned fixed-runner process and transport
effects while preserving deny-by-default authority, bounded frames, completion-last ordering,
teardown/absence proof, fixed-root cleanup, and commit-before-delivery.

## Retained evidence

- `contracts/preflight.json`: exact components, authorization boundary, observations, candidate
  disposition, and required successor surface.
- `evidence/2026-08-16/`: construction outcome and mutation inventory.
- `scripts/`: deterministic generator, static verifier, and mutation tests.
- `manifests/archive-manifest.json`: closed byte inventory.

## Limitations and unresolved work

This proves only that the exact direct binding is incompatible. It does not validate a successor,
real provider, runtime composition, VM/guest execution, teardown, durable completion, or product
admission. The next experiment must construct and independently review the successor no-run
adapter/composition before any controlled execution is authorized.
