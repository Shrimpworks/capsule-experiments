# C5b3 handoff

## Status

- Bounded exact-byte recovery/reproducibility packet: `PASSED`.
- Exact-byte recovery or reconstruction: `BLOCKED`.
- Complete C5b executable successor and controlled transport: `BLOCKED`.
- Parent governed runtime: `IN_PROGRESS — TRENDING_GOOD`.
- Runtime/profile and product admission: `BLOCKED`.

## Durable conclusion

The three frozen artifacts are absent from the bounded authorized locations and both repository
object histories. The retained construction records are unusually complete, but a recipe plus
digest is not artifact custody. No exact byte may be claimed until a fresh result independently
matches its required byte length and SHA-256.

The exact runtime and libkrunfw reconstruction inputs, toolchains, build boundaries, output
identities, and current blockers are closed in `manifests/recovery-plan.json`. Eight mutations
prove that missing inputs, movable refs, identity mismatches, invented kernel/firmware authority,
or a false executable claim fail closed.

## Next exact work

1. Repair or reauthenticate GitHub CLI using the macOS Keychain-backed account without exposing a
   token. Read back the authorized Shrimpworks repositories and the retained `rusty_v8` Actions
   artifact if it still exists.
2. Start the owner-controlled Docker runtime separately and verify that the exact digest-pinned
   Rust 1.95 builder exists or acquire it by digest before the decisive offline phase.
3. Acquire every exact source/archive/package input into two fresh stages, verify all recorded
   digests, and retain the acquisition inventory. Do not reuse compiler outputs or target caches.
4. Rebuild runtime A/B with the retained network-none, empty-target, ASLR-disabled, one-CPU recipe.
   Rebuild libkrunfw A/B with the retained path-remapped offline recipe. Independently hash and
   stat each result.
5. If and only if all exact identities match, retain policy-permitted artifacts plus source,
   notices, SBOM, provenance, commands, and mutations in a new immutable archive. If any identity
   differs, label it a new candidate and reconcile it canonically; never overwrite the frozen
   historical identity.
6. Only after runtime and libkrunfw custody closes should a separate task bind them with the real
   C5b controller and construct the composite. Stop again before loading libkrun or executing a
   guest.

No ADR change follows from this packet. Accepted ADR-0041 continues to make the extracted kernel
evidence-only and separate firmware inapplicable.
