# C5b0 v19-lineage typed-transport successor

Date: 2026-08-11

Scoped packet status: `PASSED`

Executable successor status: `BLOCKED`

Parent governed runtime: `IN_PROGRESS — TRENDING_GOOD`

Runtime/profile and product admission: `BLOCKED`

## Question

Can Capsule freeze a collision-free, independently verified C5b typed-transport successor packet
from the canonical v19 lineage and the governed 103-byte workload without loading libkrun, calling
HVF, starting the runner, VM, or guest, or pretending that the lost v19 archive still exists?

Yes for the contract/profile/plan/frame packet. No for executable artifact closure. This archive
therefore keeps the two statuses separate.

## Defensive scope

This experiment is defensive, local-only, and construction-only. It materializes deterministic
bytes and runs Node verifiers against those bytes. It does not load libkrun, call a Hypervisor
framework entry point, execute a runner, create a VM, start a guest, use a credential, access a
network service, sign or install anything, mutate product state, or admit a runtime/profile.

The exact canonical input is Capsule commit
`88f3a2c1f968b1aa604ce14a2db4389822e5b193`. The v19 predecessor is represented only by its
canonical composed digest
`ac2721719a1e4f15c664e0b7c21d99602b6fc7d5a9c55c8b17d08970098f48fa` and the four artifact
digests retained in Capsule documentation. Its missing raw bytes are not reconstructed or copied.

## Retained packet

- `inputs/c5a/` contains exact small C5a passive manifest, accepted ordinary frame, and payload
  inputs copied from the pinned Capsule commit. The original 102-byte passive source frame remains
  unchanged evidence and is not substituted for the selected 103-byte source.
- `fixtures/` contains the exact 103-byte `main.mjs`, 89-byte deterministic-CBOR SourceManifest,
  36-byte canonical input, 35-byte expected completion, and fresh v1 source/input/completion
  frames bound to this packet's plan and profile.
- `contracts/` gives exact non-executable identities for the runner, root layout, trusted init,
  trusted launcher, and controller responsibilities.
- `manifests/successor-profile.json` and `manifests/no-run-plan.json` bind every construction byte.
- `manifests/artifact-boundary.json` preserves the remaining executable identities as null and the
  known v19 bytes as unavailable.
- `manifests/archive-manifest.json` closes the archive inventory by path, byte count, and SHA-256;
  it excludes only itself.
- `scripts/generate.mjs`, `scripts/verify.mjs`, and `scripts/test-mutations.mjs` provide deterministic
  generation, an independently implemented verifier, and six bounded refusal mutations.

## Verification

```sh
node experiments/typed-guest-transport-c5b0-v19-successor/scripts/generate.mjs --check
node experiments/typed-guest-transport-c5b0-v19-successor/scripts/verify.mjs
node experiments/typed-guest-transport-c5b0-v19-successor/scripts/test-mutations.mjs
git diff --check
```

See [RESULTS.md](RESULTS.md) and [HANDOFF.md](HANDOFF.md) for the exact result and next gate.
