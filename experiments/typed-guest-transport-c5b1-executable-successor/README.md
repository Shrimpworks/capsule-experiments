# C5b1 deterministic executable-successor construction

Date: 2026-08-11

Scoped construction status: `PASSED`

Complete executable successor: `BLOCKED`

Controlled C5b execution and runtime/profile admission: `BLOCKED`

## Question

Can Capsule replace C5b0's five null executable identities with fresh, reproducible successor
artifacts from retained sources without recovering or impersonating v19, loading libkrun, calling
HVF, or starting any runner, VM, or guest?

Yes for exact host-runner, raw-root, trusted-init, trusted-launcher, and controller construction
identities. No for an executable composition: the governed `deno_core` runtime and governed
libkrun/libkrunfw/kernel/firmware packet are deliberately absent, and the retained controller is an
executable hard-stop.

## Defensive boundary

This experiment is construction-only and local-only. It consumes the immutable C5b0 successor at
merge commit `b357d0c0fb29100c180494e67cebd7809aabe3c5` from repository baseline
`067fe2beb40361bb714507cab1331004e0a656fa`. It builds twice and compares exact bytes. No output is
executed, signed, installed, loaded into libkrun, passed to HVF, or used to start a process, VM, or
guest. It accesses no credential or network and changes no product state.

The raw image is a fixed 8 MiB ext4 extent-format, no-journal construction containing only the two
fresh static arm64 Linux executables and the C5b0 source/input fixtures. The governed runtime path
is asserted absent. The host runner has no caller configuration, binds the root digest at compile
time, requires FDs 0-7 and exact `G`+EOF authorization, and defers fixed-path libkrun loading until
after that future authorization. These properties are construction facts, not runtime evidence.

## Retained packet

- `dist/`: the five fresh successor artifacts.
- `inputs/c5b0/`: byte-exact copies of the merged predecessor inputs.
- `crates/` and `source/`: complete init, launcher, runner, and hard-stop controller sources.
- `scripts/`: deterministic A/B build, raw-root builder, generator, independent verifier, and
  seven bounded mutation cases.
- `manifests/artifact-profile.json`: exact artifact/source/input identities and blockers.
- `evidence/2026-08-11/`: construction, provenance, SBOM, and mutation records.

## Verification

```sh
RUSTUP_TOOLCHAIN=stable sh scripts/build.sh
node scripts/sync-inputs.mjs --check
node scripts/generate-evidence.mjs --check
node scripts/verify.mjs
node scripts/test-mutations.mjs
git diff --check
```

See [RESULTS.md](RESULTS.md) and [HANDOFF.md](HANDOFF.md) before using any identity.
