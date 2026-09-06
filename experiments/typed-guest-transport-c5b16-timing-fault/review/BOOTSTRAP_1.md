# Fresh Review Bootstrap

Review instance: 1 of 3.

## Review objective

Review C5b16 timing/fault implementation and its plan, including preservation of
existing fixture authority, durable ordering, deadlines, observations and test
sensitivity. Defensive validation only: exact owned archive sources and controlled
fixed benign children in local disposable Darwin/arm64 directories. No real guest,
interpreter, backend, installed service, key, third party or unrelated data.

## Repositories and immutable scope

Archive worktree: /private/tmp/capsule-c5b16-timing
Branch: codex/c5b16-timing-fault
Base: cbfef30751f0a2dd8d8a71356c6b975b52d3e752
Head: c7b4eba2d7de11209c06765df0a4a27127b0fcd9
In scope: experiments/typed-guest-transport-c5b16-timing-fault
Predecessor source pin: 294559e78b410f4b25e0e25fcf373ec0c7d1cfb5 at
experiments/typed-guest-transport-c5b14b-native-storage.
New experiment is intentionally self-contained; inspect the derivative delta as
well as unchanged surrounding code. inputs/ORIGINS.json maps predecessor files.
FROZEN_1.json hashes exact source, input, tests, scripts and final evidence. Review
packet files under review/ are newly retained but do not change compiled materials.
Earlier failed exploratory checks under review/INITIAL_PROBE are historical.

Canonical worktree: /private/tmp/capsule-c5b16-checkpoint
Branch: codex/c5b16-checkpoint
Base: cf835768c3cb04bf6ad9ad3cb2ed8e90ab313db5
Canonical review scope is content of docs/C5B_TIMING_FAULT_CHECKPOINT.md and changed
index prose in docs/CURRENT_WORK_PLAN.md, docs/WORKSTREAM_EVIDENCE_LEDGER.md and
docs/PROJECT.md. Their final review/check status and immutable archive link will
be populated after this review; judge technical claims/plan now, not the marked
pending publication fields. No product code is changed.

## Canonical requirements

Read archive AGENTS.md and canonical AGENTS.md, the pre-C5b16 security audit,
C5b15 runner reconciliation checkpoint, C2A execution profile, ADR-0041/0046 and
applicable Supervisor authority and threat model. Review PLAN.md before implementation.
Record preliminary concerns before reading AUTHOR_1.md.

## Verification available

From experiment root: node scripts/verify.mjs and node scripts/timing-verify.mjs.
Use ordinary mode only; never --record. These create bounded local temp fixtures,
compile, execute fixed benign children, assert mutations and dispose owned files.
Timing verifier reads hw.model with sysctl; sandbox may require targeted escalation.
Go 1.25.13 and Node >=22 are required. Do not replace pins or increase time limits.
Parent runs canonical required checks separately; avoid duplicating the full product
suite. Proportionate fresh experiment checks are appropriate. Keep all retained
sources/evidence read-only; return review text to parent instead of writing fixes.

## Author explanation

After blind preliminary pass: review/AUTHOR_1.md.

Use $independent-review in reviewer mode. This is review instance 1 of 3.
Verify plan and implementation; do not implement fixes, create further review
instances, or split work into new workstreams. A heavy pivot is a decision gate.
