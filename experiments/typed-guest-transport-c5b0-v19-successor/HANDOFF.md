# C5b0 handoff

## Status

- Scoped deterministic packet: `PASSED`.
- Executable C5b0 successor: `BLOCKED`.
- Parent governed runtime: `IN_PROGRESS — TRENDING_GOOD`.
- Controlled C5b execution, installed composition, runtime/profile admission, and product
  admission: `BLOCKED`.

## What is now durable

The archive retains fresh exact contract/profile/plan/frame identities rooted in Capsule commit
`88f3a2c1f968b1aa604ce14a2db4389822e5b193`, the v19 composed predecessor digest
`ac2721719a1e4f15c664e0b7c21d99602b6fc7d5a9c55c8b17d08970098f48fa`, the selected 103-byte
source, its 89-byte SourceManifest, and the C5a v1 transport contract. The closed archive manifest
and independent verifier make the retained bytes reproducible and mutation-sensitive.

No v19 raw byte was recreated. The historical digests remain provenance only.

## Next action

Create a separate defensive, no-run executable-construction task that consumes this immutable
packet and the retained governed build sources. It must build fresh host-runner, root, init,
launcher, and controller bytes; independently reproduce every selected byte; retain toolchain,
SBOM/license/provenance and mutation evidence; and fill a versioned successor to the null artifact
boundary. It may compile and statically inspect the candidate, but it must not load libkrun, call
HVF, execute the runner, create a VM, start a guest, sign/install anything, or make an admission
claim.

Only after that later executable closure is reviewed should the owner receive a separate C5b run
authorization naming the exact host, owned disposable guest, complete packet and executable
digests, process/root names, permitted fault rows, evidence destination, and cleanup requirements.

## Canonical Capsule follow-up

After this archive PR merges, Capsule should pin the immutable archive commit and record:

- deterministic C5b0 contract/profile/plan/frame packet `PASSED`;
- executable C5b0 artifact closure `BLOCKED` on fresh construction;
- C5b execution and admission still `BLOCKED`; and
- no runtime, VM, guest, installed, credential, or product effect.
