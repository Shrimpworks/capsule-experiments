# C5b3 handoff

## Status

- Bounded exact-byte recovery/reproducibility packet: `PASSED`.
- Exact-byte recovery or reconstruction: `BLOCKED`.
- Complete C5b executable successor and controlled transport: `BLOCKED`.
- Parent governed runtime: `IN_PROGRESS — TRENDING_GOOD`.
- Runtime/profile and product admission: `BLOCKED`.

## Durable conclusion

The three frozen target artifacts remain absent from the bounded authorized locations and both
repository object histories. The exact historical `rusty_v8` archive and binding have now been
recovered before expiry, independently verified, and durably retained. This closes that input
custody only; a recipe plus digest is not custody of the target runtime or libkrunfw bytes.

The exact runtime and libkrunfw reconstruction inputs, toolchains, build boundaries, output
identities, and current blockers are closed in `manifests/recovery-plan.json`. Eight mutations
prove that missing inputs, movable refs, identity mismatches, invented kernel/firmware authority,
or a false executable claim fail closed.

## Next exact work

1. Start the owner-controlled Docker runtime separately and verify that the exact digest-pinned
   Rust 1.95 builder exists or acquire it by digest before the decisive offline phase.
2. Acquire the exact Deno source/Cargo closure and libkrunfw source/archive inputs into two fresh
   stages, verify all recorded digests, and retain the acquisition inventory. Do not substitute the
   recovered `rusty_v8` corresponding-source archive or reuse compiler outputs/target caches.
3. Rebuild runtime A/B with the retained network-none, empty-target, ASLR-disabled, one-CPU recipe.
   Rebuild libkrunfw A/B with the retained path-remapped offline recipe. Independently hash and
   stat each result.
4. If and only if all exact identities match, retain policy-permitted artifacts plus source,
   notices, SBOM, provenance, commands, and mutations in a new immutable archive. If any identity
   differs, label it a new candidate and reconcile it canonically; never overwrite the frozen
   historical identity.
5. Only after runtime and libkrunfw custody closes should a separate task bind them with the real
   C5b controller and construct the composite. Stop again before loading libkrun or executing a
   guest.

No ADR change follows from this packet. Accepted ADR-0041 continues to make the extracted kernel
evidence-only and separate firmware inapplicable.
