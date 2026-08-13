# C5b6 governed Deno static reproduction

Date: 2026-08-12

Scoped deterministic no-run Deno build: `PASSED`

Complete C5b executable composition and controlled guest execution: `BLOCKED`

## Question

Can the governed fixed-fixture Deno runtime be reproduced twice from independent exact Cargo
acquisitions using the digest-pinned Rust 1.95 builder, with both decisive builds network-disabled
and without loading or executing the resulting runtime?

Yes. Two fresh stages independently acquired the exact 189 crates.io packages named by the frozen
lock, produced the same deterministic vendor bundle, and reproduced the frozen runtime binary,
snapshot, and runtime bundle byte-for-byte. The build-only script was independently reviewed after
removing every historical candidate-execution step.

## Defensive boundary

This experiment is authorized, local-only, and no-run. Connected containers contacted only Cargo's
locked crates.io sources. Decisive builds used `--network none`, a read-only container root, no
Linux capabilities, `no-new-privileges`, one logical CPU pinned to CPU 0, a 10 GiB memory ceiling,
empty target/output directories, and the exact digest-pinned Linux/arm64 builder.

No produced runtime or mutation was executed or loaded. No libkrun API, HVF, VM, guest, signing
identity, credential, service, product state, or admission state participated.

## Inputs

- Capsule Experiments base: `5a2f835e8c9df8279237f940f5af757e119593bd`.
- Deno fork commit/tree: `29b71f06c2df5ab06721ccbb7bc744fb8104356e` /
  `172e57551fe5a6683f11c886a81f9634023a5514`.
- Rust builder: `rust:1.95.0-bookworm@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1`.
- Recovered `rusty_v8` archive/binding: `1ae209c9e4ba5803d010d2c79ee4cc0af0126c5a7ebcca211c7e41deaede4cd2` /
  `8603f09ab95e79620ea29f73933c09ae3618c6f924472c0ce36d5c614d1ceba4`.
- Cargo lock: 45,815 bytes, SHA-256
  `4dd8f08c8b223adbf3468fce5fe9e0468dfe9f4a255129cc304cb604fa0d389d`.

The full recovered `rusty_v8` archive remains in the predecessor recovery PR; this packet binds its
exact identity and retains the smaller public manifest/binding inputs. Merge that predecessor
before treating this packet as an immutable standalone archive chain.

## Retained packet

- `inputs/`: deterministic Deno source archive, Cargo lock and vendor bundle, plus `rusty_v8`
  identity/binding metadata.
- `artifacts/`: deterministic two-file runtime bundle; it is retained for hashing/static inspection
  only and must not be executed from this experiment.
- `scripts/build-runtime-static-only.sh`: exact independently reviewed build-only procedure.
- `evidence/2026-08-12/`: acquisition/build logs, static ELF and link-symbol proofs, SBOM/notices,
  command and container-boundary receipts, comparison, and scoped result.
- `manifests/archive-manifest.json`: closed file inventory with SHA-256 and byte size.

Run `node scripts/verify.mjs` to verify the retained packet without executing the artifact.
