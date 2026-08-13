# C5b2 handoff

## Status

- Governed-input closure: `PASSED`.
- Complete executable successor: `BLOCKED`.
- Controlled C5b typed-transport execution: `BLOCKED`.
- Parent governed runtime: `IN_PROGRESS — TRENDING_GOOD`.
- Runtime/profile and product admission: `BLOCKED`.

## What is durable

`manifests/input-closure.json` binds the exact currently available C2B v4 libkrun/header/ABI/final-
runner bytes and the C5b1 predecessor. The verifier reconstructs all file identities, parses raw
Mach-O metadata and symbol tables, compares an independent system-tool readback, checks the accepted
header audit, and enforces a closed archive inventory.

The packet deliberately retains `null` composite/runtime-root/controller fields. No missing byte
was recovered, downloaded, rebuilt, or inferred from a digest.
Historical libkrunfw/kernel inspection receipts are retained only as identity/provenance evidence.

## Next construction gates

1. Recover or reproducibly rebuild and retain the exact governed `deno_core` executable bytes from
   the accepted Deno/`rusty_v8` commits and reviewed build closure.
2. Recover or reproducibly rebuild and retain the exact `libkrunfw` boot-kernel-carrier bytes and
   its required source/license/provenance material. Treat the extracted kernel only as derived
   evidence, and do not add a separate firmware path.
3. Review and construct a deterministic controller implementing the complete C5b directional-copy,
   cap-plus-one drain, partial-write, stall/reset/cancel, response-loss, completion-last, process-
   fault, teardown, authoritative-absence, and cleanup matrix.
4. Build a new immutable runtime root/composite manifest from those exact inputs and rerun static,
   restoration, closed-inventory, and mutation checks.
5. Stop again for exact owner authorization before executing or loading any artifact.

The next slice may construct missing bytes and controller artifacts, but it must not run libkrun,
call HVF, create a VM/guest, or claim admission unless separately authorized with the exact final
composite and owned environment.
