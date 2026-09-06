# Fresh Review Bootstrap

Review instance: 1 of 3.

## Review Objective

Assess the C5b14A storage-only core and its plan against bounded persistence,
recovery, immutable replay and accurate evidence claims. Defensive local-only
validation of these controls using this exact module, owned temporary directories
and Go test subprocesses on the owned Mac. No native runner, guest, backend,
signing, Keychain, installed service or unrelated asset is authorized.

## Repository And Worktree

Archive: /private/tmp/capsule-c5b14-storage
Canonical: /private/tmp/capsule-c5b14-checkpoint
Experiment: experiments/typed-guest-transport-c5b14a-storage-core

## Base, Head, Branch, And Dirty State

Archive base/HEAD: 44dca5cf73159f6e32764984fc23b7babcc05bfe.
Branch: codex/c5b14-storage-core. New untracked experiment directory is the review
boundary; no staged changes or implementation commits. Frozen source/plan/readme/
verifier identities are evidence/results.json materialSHA256; review packets and
reports are outside that map. Canonical base is a367b8c5691ead869005b0e70a42fa36a4e441ac,
branch codex/c5b14-storage-checkpoint; its later documentation reconciliation is
outside this review's implementation boundary.

## In-Scope Commits And Paths

All new experiment source, tests, go.mod, PLAN.md, README.md, verifier and results.
No preexisting archive material changes. Review both implementation and plan.

## Canonical Requirements And Plan

Read both repositories' AGENTS.md and the experiment PLAN.md. Relevant Capsule
requirements: docs/PROJECT.md, docs/ARCHITECTURE.md, docs/TECHNICAL_DESIGN.md,
docs/security/THREAT_MODEL.md, docs/FEASIBILITY_SPIKES.md,
docs/ECOSYSTEM_REUSE_AND_ADOPTION.md, docs/C5B_NATIVE_LIFECYCLE_PROVIDER_CHECKPOINT.md,
ADRs 0029, 0040, 0041 and 0042. Narrow to persistence, owner custody, authority,
non-production evidence and native integration limits. Existing registrationstate
and completioncomposer stores provide surrounding patterns; they are unchanged.

## Explicit Exclusions

No product implementation/admission, selected product persistence engine, C ABI
providers, linked native driver, installed custody, actual guest, power loss,
rollback defense, authenticated external delivery or performance admission.

## Verification Commands Available To Reviewer

From the experiment: node scripts/verify.mjs (read-only retained evidence; creates
and removes owned temporary build/test/mutation fixtures). Go toolchain 1.25.13.
Focused go test -count=1 -run=... ./store is available. Do not use --record, edit
files, stage, commit, dispatch further agents or start additional review instances.

## Author Explanation Location Or Delivery Step

Record preliminary concerns before reading review/author-r1.md.

Use $independent-review in reviewer mode. This is review instance 1 of 3. Work from
the Fresh Review Bootstrap first and record a preliminary review before reading
the Author Explanation. Then verify the explanation against the repository, review
both the implementation and its plan, run proportionate non-mutating checks, and
return an evidence-backed verdict. Do not implement fixes, create further review
instances, or split the work into new workstreams.
