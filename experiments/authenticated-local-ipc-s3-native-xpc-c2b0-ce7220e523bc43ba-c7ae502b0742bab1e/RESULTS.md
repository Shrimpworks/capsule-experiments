# Construction result

Status: **PASSED** for inert source, fixture, verifier, mutation-test, and
reproducible unsigned-build construction.

Parent C2b native XPC execution: **BLOCKED**. Installed/authenticated IPC and
product admission: **BLOCKED**.

## What passed

- The imported `manifest.json`, `native-xpc-v0.contract.json`, `oracles.json`,
  method fixtures, replies, requests, and body fixtures match the exact Capsule
  pins in `experiment-profile.json`.
- The complete ordered 70-case digest is
  `9ac6845baf35651aab057989264ab7fb17305751d3101df38d26b2334b8ef68e`.
- The generated plan keeps three S3 methods executable and two C4 methods
  passive/reference-only. It includes the ordered S3 cases, S3 deadline and
  response-loss rows, and all S3-to-C4 foreign-tag collisions.
- The native source checks exact-message code identity, EUID/audit session,
  protocol/method/tag/binding, closed dictionary shape, fixed fields, identifiers,
  current state, body caps, and copy ownership in the retained ordering.
- Each client and the server refuse to proceed without the future execution
  gate. The server installs the peer signing requirement before listener resume.
- Two clean unsigned builds on the recorded host were byte-identical. No output
  contained `LC_UUID` or `LC_CODE_SIGNATURE`, and no output imported process
  launch primitives.
- The independent verifier rejects the retained mutation corpus, including
  contract-byte drift, C4 promotion, alias reuse, activation, ordering reversal,
  removed execution gates, body drift, effect-claim drift, and manifest omission.

Exact environment and artifact hashes are in
`evidence/2026-08-11/construction-result.json`.

## What was not done

No compiled artifact was launched. No Mach service was registered, no XPC
message was delivered, no binary was signed, no identity or credential was
enumerated, no Keychain item was accessed, and no Capsule product state,
runtime, backend, VM, or guest was used.

Therefore this result supplies no evidence for actual OS pre-delivery refusal,
message-derived peer identity, EUID/audit-session enforcement, native copy
behavior, cap/flow enforcement, deadline equality, interruption, response loss,
process faults, cleanup, or installed composition. Those are C2b execution rows
and remain blocked on an exact owner authorization.

## Claim boundary

This packet proves only that the future experiment's reviewed inputs can be
constructed, independently checked, mutation-tested, and compiled without
activating them. It does not validate the product service strings: experimental
aliases prove role-distinct disposable endpoint mechanics only. It does not
accept an ADR, admit XPC into the product, or authorize a future run.
