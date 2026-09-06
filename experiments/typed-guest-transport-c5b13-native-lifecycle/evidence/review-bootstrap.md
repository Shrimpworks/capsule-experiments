# Fresh Review Bootstrap

Review instance: 1 of 3. Use independent-review in reviewer mode.

## Review Objective

Review native C5b13 lifecycle fixture implementation and its plan for correctness,
claim accuracy and failure sensitivity. Defensive scope: only this repository's
compiled benign child, deterministic 64-KiB root and anonymous local pipes on the
owned Mac; no other process/data, guest, backend, signing, credentials or service.

## Repository And Worktree

`/private/tmp/capsule-c5b13-lifecycle`, Shrimpworks/capsule-experiments.
Canonical requirements available read-only in `/private/tmp/capsule-c5b13-checkpoint`:
AGENTS.md, docs/adr/0041*, docs/C5B_NATIVE_TRANSPORT_PROVIDER_CHECKPOINT.md,
docs/security/THREAT_MODEL.md and docs/STATUS_LANGUAGE.md.

## Base, Head, Branch, And Dirty State

Base and HEAD `ad5217fc17b97b3c3cac44d383e6b296c111d310`.
Branch `codex/c5b13-lifecycle-custody`. Review the explicit untracked working-tree
boundary below; no other retained changes. Sparse checkout is intentional.

## In-Scope Commits And Paths

All files under `experiments/typed-guest-transport-c5b13-native-lifecycle/`.
The material inventory in evidence/verification.json freezes source, tests,
scripts and original inputs. Verify actual bytes and generated identities.

## Canonical Requirements And Plan

Read archive AGENTS.md and scoped PLAN.md. Inspect implementation/tests first.
Record preliminary concerns before reading README.md and author-explanation.md.
Do not treat author prose or verification claims as a readiness verdict.

## Explicit Exclusions

No product integration, guest execution, storage implementation, signing,
installed identity, same-UID pathname race protection or cross-host evidence.
Do not modify any file, create commits/branches or dispatch another reviewer.

## Verification Commands Available To Reviewer

From the experiment directory, `node scripts/verify.mjs` runs exact local benign
fixtures, native/sanitizer cases, two builds and compiled assertion mutations.
It writes only disposable /tmp outputs, not retained evidence. Allow ~70 seconds.
No refresh/--record command is authorized for this review.

## Author Explanation Location Or Delivery Step

`evidence/author-explanation.md`. Read only after a preliminary implementation pass.
Return findings with precise paths/symbols, plan review, claim reconciliation,
checks performed, residual risks and Ready / Ready with non-blocking follow-ups /
Not ready / Unable to verify. Do not implement fixes, create further review
instances or split into new workstreams. Return heavy-pivot decisions to parent.
