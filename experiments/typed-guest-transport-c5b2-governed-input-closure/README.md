# C5b2 governed-input closure

Date: 2026-08-12

Scoped governed-input closure: `PASSED`

Complete executable successor: `BLOCKED`

Controlled C5b execution and runtime/profile admission: `BLOCKED`

## Question

Which exact governed C5b dependency bytes are actually available after C5b1, and can Capsule bind
and independently verify them without inventing missing artifacts or loading any runtime/VMM code?

The current-source C2B v4 `libkrun.1.dylib`, its accepted header and ABI audit, and its final
host-runner bytes are available in the canonical Capsule repository and are bound here. The
governed `deno_core` executable, `libkrunfw` boot-kernel carrier, and extracted kernel have retained
identities but their large bytes are absent from both bounded repository inputs. Separate firmware
is intentionally inapplicable under Accepted ADR-0041. No complete reviewed C5b controller exists.

## Defensive boundary

This experiment is local, credential-free, deterministic, and no-run. It consumes
`Shrimpworks/capsule-experiments` main at
`ee00ae2abbce64ae6458b82d0b53d904ee39aeb6` and exact files from
`Shrimpworks/capsule-corp` commit `e5401a81b727915ec01afe9012a77e7586a57c13`. It performs only
file hashing, Mach-O parsing, static symbol/load-command inspection, C17 syntax checking, closed
inventory verification, and bounded temporary-copy mutations.

No artifact is executed or loaded. No libkrun API, HVF, VM, guest, network target, signing
identity, credential, service, product state, or admission state participates.

## Retained packet

- `inputs/c2b-v4/`: exact current canonical header, ABI audit, unsigned libkrun dylib, final
  runner source/binary, and materialized profile.
- `inputs/c2b-artifact-closure/`: exact historical libkrunfw/kernel identity and static-inspection
  receipts; these are evidence, not substitutes for the absent large bytes.
- `inputs/c5b1/artifact-profile.json`: exact predecessor boundary.
- `manifests/input-closure.json`: closed available/missing/inapplicable role map.
- `evidence/2026-08-12/`: static tool readback and scoped result.
- `scripts/`: generator, independent raw Mach-O verifier, and seven refusal mutations.

## Verification

```sh
node scripts/generate.mjs --check
node scripts/verify.mjs
node scripts/test-mutations.mjs
clang -std=c17 -fsyntax-only -Iinputs/c2b-v4 inputs/c2b-v4/libkrun-abi-audit.c
git diff --check
```

See [RESULTS.md](RESULTS.md) and [HANDOFF.md](HANDOFF.md) before using any retained identity.
