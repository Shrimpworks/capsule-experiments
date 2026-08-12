# C5b1 handoff

## Status

- Deterministic five-artifact construction: `PASSED`.
- Complete executable successor: `BLOCKED`.
- Controlled C5b typed-transport execution: `BLOCKED`.
- Parent governed runtime: `IN_PROGRESS — TRENDING_GOOD`.
- Runtime/profile and product admission: `BLOCKED`.

## What is durable

`manifests/artifact-profile.json` and `manifests/archive-manifest.json` bind five fresh successor
artifacts, all source inputs, the merged C5b0 packet, A/B reproduction, static inspection, and
negative mutations. The packet expressly retains `v19RawBytesRecovered=false` and
`v19IdentityReused=false`.

## Next construction gate

Before a run can be authorized, a separate no-run task must:

1. bind one accepted governed `deno_core` executable into the exact root path currently asserted
   absent and rebuild/reverify the root and runner binding;
2. bind exact governed libkrun, libkrunfw, kernel, and firmware bytes plus ABI/export/load
   inspection without loading them;
3. replace the hard-stop controller with a reviewed run controller that implements all C5b
   directional copy, cap+1 draining, stall/reset/cancel, response-loss, completion-last,
   teardown, authoritative absence, and cleanup rows;
4. create a new immutable composite profile/manifest rather than editing this archive in place;
5. return for exact owner authorization before any artifact is executed.

## Future owner request template — not ready until every bracket is immutable

> Defensively run one controlled Capsule C5b typed-transport experiment in
> `Shrimpworks/capsule-experiments` on owned Mac `[HOST LABEL]` using owned disposable guest/root
> `[GUEST/ROOT LABEL]`. Pin the accepted composite manifest `[COMMIT, PATH, BYTES, SHA-256]`, fresh
> C5b successor profile `[SHA-256]`, host runner `[SHA-256]`, raw root `[SHA-256]`, trusted init
> `[SHA-256]`, trusted launcher `[SHA-256]`, governed runtime `[SHA-256]`, controller `[SHA-256]`,
> libkrun/libkrunfw/kernel/firmware `[EACH SHA-256]`, plan/source/input/completion frames
> `[EACH SHA-256]`, process/root names `[EXACT NAMES]`, evidence destination `[EXACT PATH]`, and
> cleanup owner `[OWNER]`. Authorize only one fixed 103-byte governed workload, no credential or
> network access, no product service/store, and only the enumerated directional-copy, cap+1,
> partial-write, stall/reset/cancel, descriptor substitution, response-loss, completion-last,
> controller/runner/launcher fault, teardown, authoritative-absence, and restoration rows
> `[EXACT ROW IDS]`. Stop before execution on any identity, host, process, root, permission, or
> preflight mismatch and stop after retained cleanup readback. This is defensive experiment
> evidence only and does not admit a runtime/profile or product path.

Do not fill this template from the current packet alone. The current controller and missing
governed bytes make execution `BLOCKED` by construction.
