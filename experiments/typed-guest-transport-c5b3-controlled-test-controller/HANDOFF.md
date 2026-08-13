# C5b3 handoff

## Status

- Deterministic no-run controller construction: `PASSED`.
- Complete executable successor: `BLOCKED`.
- Controlled C5b typed-transport execution: `BLOCKED`.
- Parent governed runtime: `IN_PROGRESS — TRENDING_GOOD`.
- Runtime/profile and product admission: `BLOCKED`.

## What is durable

This archive retains the smallest effect-free controller core for the already accepted C5a/C5b
responsibilities. It has a closed state/fault/replay/cleanup contract, complete source, two
byte-equal non-executable arm64 objects, 20 static vectors, two independent JS interpretations,
raw Mach-O/import inspection, nine mutation refusals, and a closed file manifest.

The fixed root and artifact paths are frozen only so a later authorization cannot silently widen
them. The future run profile, effect adapter, governed runtime bytes, libkrunfw bytes, rebuilt root,
and composite manifest remain explicitly absent. No missing byte is inferred from a digest.

## Next gate

1. Recover or reproducibly rebuild the exact governed `deno_core` and `libkrunfw` bytes with their
   source/license/provenance closure.
2. Build the runtime root and immutable composite manifest from those exact bytes plus the bound
   C5b2 libkrun/runner and C5b1 trusted init/launcher.
3. Implement and independently review a narrow effect adapter that maps this core's requested
   actions to only the exact owned disposable composition. The adapter must add no caller-selected
   paths, runtime flags, images, mounts, endpoints, or backend configuration.
4. Produce one exact authorization profile binding owner-confirmed host/guest, every artifact and
   fixture digest, process/root names, fault rows, evidence destination, cleanup, and stop rules.
5. Stop for explicit owner authorization before linking/loading/running any composition.

Only a later separately authorized run may claim directional copy, process-fault, teardown, or
guest observations. This packet supplies none of those claims and must never be imported by
Capsule product code.
