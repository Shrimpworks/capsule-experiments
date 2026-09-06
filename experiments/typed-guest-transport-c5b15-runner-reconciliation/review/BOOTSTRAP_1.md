# C5b15 fresh review bootstrap

Review instance 1 of 3. Read-only internal review; no inherited author history.
Use independent-review skill from Capsule's linked skills directory.

Archive worktree `/private/tmp/capsule-c5b15-runner-reconciliation`, branch
`codex/c5b15-runner-reconciliation`, base
`bb33895d82853c35b99e53b234c464dd55e6685a`; committed head recorded in
FROZEN_TARGET.json. Scope includes every committed/modified/untracked file under
`experiments/typed-guest-transport-c5b15-runner-reconciliation`. Inspect actual status.
Prior experiments remain unchanged. Source/evidence hashes in FROZEN_TARGET.json.

Canonical worktree `/private/tmp/capsule-c5b15-checkpoint`, branch
`codex/c5b15-checkpoint`, base/head `2c30faa8c0e88dd43f289bbea18f58232d02cf23`.
Four draft docs: PROJECT, CURRENT_WORK_PLAN, C5B_NATIVE_DURABLE_OWNER_CHECKPOINT,
C5B_RUNNER_RECONCILIATION_CHECKPOINT. Final archive pin/status awaits delivery.

Read applicable AGENTS.md, PLAN.md and canonical requirements, especially ADR-0029,
ADR-0041, C2A, C5b11/C5b14B checkpoints and ecosystem reuse map. Copied requirements
are immutable inputs, not substitutes for current repository instructions.

Defensive scope: static audit of exact repository source/JSON only; local Node
decoders and owned buffers/temp directories. No candidate compilation, loading,
execution, child/guest, signal, credential, signing, Keychain or service operation.
No product or architecture change. Audit tests must not be promoted to runtime proof.

First inspect scope, plan, implementation/tests and claim boundaries; send a blind
preliminary ledger before reading review/AUTHOR.md. Then reconcile author claims.
Run `node scripts/verify.mjs` in ordinary mode, never --record. Verify origin entries
against immutable Git objects in archive and canonical repositories (read only).
Check changed canonical links and claims; ARCHIVE_COMMIT is intentionally pending.

Return evidence-backed findings and Ready/Ready with non-blocking follow-ups/Not
ready/Unable to verify verdict. Review both implementation and plan. Do not edit,
stage, commit, push, create further agents/review instances or split workstreams.
No new review instance unless orchestrator requests one within the three-pass limit.
