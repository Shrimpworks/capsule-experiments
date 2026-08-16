# C5b9 immutable no-run composite

Status: `PASSED` only for this deterministic, repository-only, no-run composition scope.

## Question

Can Capsule bind the exact retained runner, libkrun, libkrunfw, runtime root, pure controller,
root-size-compatible controlled effects, and typed fixtures into one closed candidate without
loading an artifact or granting execution authority?

## Defensive authorized scope

This experiment operates only on retained files in the owned `Shrimpworks/capsule-experiments`
repository. It performs hashing, static symbol inspection, predecessor verification, and mutation
tests. It does not load libkrun or HVF, start the runner, create a VM or guest, access a credential
or network, mutate product state, or make an admission decision.

## Method

- Bind the exact immutable components retained by C5b2, C5b4, C5b7, and the reviewed C5b8/C5b7
  root-binding successor.
- Require the controller definitions, effect-layer controller imports, runner/effect libkrun
  imports, and libkrun exports to close exactly.
- Retain the single fixed `_c5b8_controlled_test_operation` port as explicitly `BLOCKED` with no
  provider; a repository test double is not promoted into the composite.
- Retain the exact root-bound source/input frames and generate a deterministic completion-last
  fixture bound to their predecessor plan and profile.
- Freeze transport caps, teardown/absence/commit/delivery ordering, null host/guest/authorization
  placeholders, and zero effects.
- Run every predecessor verifier plus independent C5b9 profile, byte, ABI, inventory, and mutation
  checks.

## Run

```sh
node --test scripts/verify-profile.test.mjs
node scripts/generate.mjs --check
node scripts/verify.mjs
node scripts/test-mutations.mjs
git diff --check
```

## Boundary

This packet is not a runnable harness. A later controlled run remains `BLOCKED` on separate
authorization naming this exact immutable successor, an owner-confirmed host, an owned disposable
guest, disposable paths/processes, evidence destination, stop conditions, and cleanup.
