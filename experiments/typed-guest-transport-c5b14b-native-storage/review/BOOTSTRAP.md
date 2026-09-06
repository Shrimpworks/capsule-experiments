# Fresh Review Bootstrap

Review instance: 1 of 3.

## Review Objective

Review C5b14B native durable-owner integration and its plan. Defensively validate
Capsule's durable-before-effect and completion/recovery controls only with the
archive's fixed benign native child, local C/Go harnesses, six anonymous pipes,
deterministic 64-KiB root, one-attempt store and owned temporary directories on
this owned Darwin/arm64 Mac. No other target, credential, content, guest or service
is authorized. Preserve all existing safeguards.

## Repository And Worktree

Archive: `/private/tmp/capsule-c5b14b-native` (`Shrimpworks/capsule-experiments`).
Experiment: `experiments/typed-guest-transport-c5b14b-native-storage`.
Canonical documentation: `/private/tmp/capsule-c5b14b-checkpoint`.
Read each repository's AGENTS.md.

## Base, Head, Branch, And Dirty State

Archive base: `a688aabee4989b5000340bf995188b07219fe7c5`.
Archive branch: `codex/c5b14b-native-storage`.
Committed head: `bdacf1ed0f7185c27dafae94cbc262bd4e2851f1`.
Review boundary includes every committed, modified and untracked file under this
experiment directory, including the frozen `evidence/results.json` material map.
Inspect `git status --short` yourself; dirty state is deliberate. Review artifacts
under `review/` are outside the executable-material hash map.

Canonical base/head: `64e86c2d2347ba19ea4860695adf3b55640e35de`, branch
`codex/c5b14b-checkpoint`. Four draft docs are modified/added: PROJECT,
CURRENT_WORK_PLAN, C5B_DURABLE_PROVIDER_STATE_CORE_CHECKPOINT, and
C5B_NATIVE_DURABLE_OWNER_CHECKPOINT. The latter's pending archive pin/status will be
filled after archive review and commit; review their claim boundaries now.

## In-Scope Commits And Paths

Archive commits after base plus the explicit working-tree boundary above.
Prior experiments remain unchanged. Inspect source-origins.json for exact copied
input identities. Review implementation, test sensitivity, evidence and plan.

## Canonical Requirements And Plan

Read experiment PLAN.md; canonical docs/PROJECT.md, ARCHITECTURE.md,
TECHNICAL_DESIGN.md, security/THREAT_MODEL.md, FEASIBILITY_SPIKES.md,
ECOSYSTEM_REUSE_AND_ADOPTION.md and relevant ADR-0029, ADR-0040, ADR-0041,
ADR-0042. Predecessor checkpoints explain the inherited fixture limits.

## Explicit Exclusions

No installed/guest/product admission, new privileged role, product code changes,
actual interpreter/backend execution, restart PID adoption, signing/Keychain,
physical disk/power-loss, rollback defense or external delivery claim.

## Verification Commands Available To Reviewer

From the experiment directory, `GOCACHE=/private/tmp/capsule-c5b14b-review-go-cache
node scripts/verify.mjs` (one shell command with environment assignment).
Use ordinary mode, never --record. It builds in owned temporary directories and
runs real fixed benign children, bounded process-exit/fault and assertion mutations.
Allow several minutes. Read outputs and retained limitations; do not equate all
variants' instrumentation. Canonical documentation checks may run independently.

## Author Explanation Location Or Delivery Step

First inspect scope, plan, tests and implementation; record your preliminary
findings ledger before reading `review/AUTHOR.md`. Then reconcile author claims.

Use $independent-review in reviewer mode. This is review instance 1 of 3. Work from
the Fresh Review Bootstrap first and record a preliminary review before reading
the Author Explanation. Then verify the explanation against the repository,
review both implementation and plan, run proportionate non-mutating checks, and
return an evidence-backed verdict. Do not implement fixes, create further review
instances, or split work into new workstreams.
