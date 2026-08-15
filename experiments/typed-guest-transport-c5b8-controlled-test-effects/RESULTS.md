# C5b8 results

Status: `IN_PROGRESS — TRENDING_GOOD` pending retained independent review.

## Construction result

- Two arm64 Mach-O `MH_OBJECT` builds are byte-equal.
- Object size: 8,728 bytes.
- Object SHA-256: `b15c4eb6abfbf0bf6ff6d1bf860081be0378273af7c14a9f9a24fd65ffe941ce`.
- Exports: `_c5b8_initialize`, `_c5b8_apply_observation`.
- Undefined symbols: the two C5b3 controller functions, the two C5b5 adapter functions, and the
  single fixed `_c5b8_controlled_test_operation` test-double port.
- No runtime, filesystem, process, network, signing, Keychain, libkrun, or HVF symbol is imported
  by the C5b8 object.

## Adversarial result

The executable mutation double passed descriptor enrollment, the complete
controller/observation/operation success path, and replay-after-durable completion. It also passed
focused refusals for caller fact substitution, out-of-order delivery, changed post-initialization
frame buffers, wrong operation-result binding, unknown resource bits, indeterminate commit,
partial writer cleanup, unreleased live context, empty/over-cap frames, mismatched root size, zero
binding identifiers, and corrupted opaque session state.

The public session is now an incomplete type backed by layer-owned storage; the mutation double
directly corrupts controller/durable/resource authority state through a test-only hook and verifies
that the all-state integrity tag refuses it before any observation or replay. A separate combined
mutation makes an ordinary effect `NOT_APPLIED` and its recovery teardown indeterminate; the more
severe fencing status wins, the fixed fence operation runs, and delivery remains absent.

The operation layer requires controller-issued order for teardown, absence proof, fixed-root
removal, durable commit, delivery, and replay. A partial close or unreleased context leaves
`cleanup_unresolved` set and blocks further progress.

## Security-claim boundary

This is controlled-test operation sequencing, not a real runtime composition. Test-double
`APPLIED` results prove the layer's validation and ordering behavior only. They do not prove that
filesystem deletion, durable storage, process-tree teardown, descriptor custody, libkrun, HVF,
the rebuilt root, or a guest works. They grant no product admission or execution authority.

The test slice intentionally owns one static, one-shot session: production code permits exactly one
successful initialization per process and refuses replacement even after terminal state. It does
not establish concurrent-attempt, process-isolation, crash-recovery, reuse, or durable session
custody semantics. A later composition must not treat this singleton as an admitted product session
manager.

The accepted C5b5 128 MiB profile remains noncomposable with the retained C5b7 96 MiB root. No
attempt was made to resolve that mismatch here.
