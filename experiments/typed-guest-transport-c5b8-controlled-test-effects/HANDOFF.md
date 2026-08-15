# C5b8 handoff

Child status: `IN_PROGRESS — TRENDING_GOOD` pending retained independent review and publication.

Parent C5b controlled harness status: `BLOCKED`.

Product admission: `BLOCKED`.

## Control tested

The controlled-test effect layer owns C5b3 ordering, accepts no caller fact mask, translates only
controller-produced actions through C5b5, enrolls and copies a one-time Supervisor descriptor,
binds every typed observation/operation result to the attempt/registration/plan/profile/sequence,
keeps evolving authority state in layer-owned storage, fails closed, and preserves completion-last
plus explicit teardown/absence/root cleanup ordering. Indeterminate recovery teardown overrides an
earlier determinate refusal and fences.

## Authorized environment

Owned local `Shrimpworks/capsule-experiments` clone and repository test doubles only. No runtime,
VM, guest, backend, signing, Keychain, or live harness operation was authorized or performed.

## Retained evidence

- `source/controlled_effects.h`: public sealed-descriptor and opaque-session API.
- `source/controlled_effects_internal.h`: fixed typed test-double operation contract.
- `source/controlled_effects.c`: controller-owned sequencing and fail-closed reconciliation.
- `source/test_double.c`: complete and adversarial operation traces.
- `dist/controlled-effects-a.o` and `dist/controlled-effects-b.o`: deterministic unlinked objects.
- `evidence/2026-08-14/`: generated construction and mutation receipts.
- `reviews/INDEPENDENT_REVIEW.md`: retained independent review, once complete.

## Limitations and next integration

The object is deliberately not runnable. It does not implement the operation port, own real
descriptors, perform cleanup, compose a runtime, or authorize execution. The C5b5 128 MiB profile
and C5b7 96 MiB root mismatch remains unresolved. Its one static layer-owned session is a
controlled-test constraint, not a concurrent or durable product session manager. After this experiment PR is merged, capsule-corp
must link the exact immutable archive merge in `docs/CURRENT_WORK_PLAN.md` and
`docs/WORKSTREAM_EVIDENCE_LEDGER.md`; that canonical update is a separate integration destination,
not something this unmerged branch can truthfully pre-record.
