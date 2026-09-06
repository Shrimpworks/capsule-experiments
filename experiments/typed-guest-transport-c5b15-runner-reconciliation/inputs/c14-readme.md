# C5b14B native durable-owner integration

Status: native construction and full local verification `PASSED`; independent
review and publication `IN_PROGRESS — TRENDING_GOOD` (see `review/` for closure).
Installed boundary, controlled guest execution and product admission: `BLOCKED`.

This experiment connects C5b13's actual benign transport/lifecycle observations to
C5b14A's bounded Go persistence mechanics. All 24 fixture providers, both durable
gates and the registration-only driver now link. It is a native C entry point with
an in-process Go archive, not a Go-owned process launcher or a product store.

## Exact authorized scope

Only this archive's fixed benign child, six anonymous pipes, deterministic 64-KiB
root, one-attempt state directory, local C/Go processes and owned disposable test
directories on Darwin/arm64 participate. No interpreter, guest, backend, libkrun/HVF,
signing, Keychain, installed service, user content or unrelated asset executes.
The child independently alarms after four seconds; the harness alarms after seven.
A harness wait reaps only its captured benign child after assertions and supplies
no lifecycle evidence. Unknown custody never supplies a signal target.

See PLAN.md for acceptance, dependency-policy checklist and retained input commits.
Previous experiments and product code remain unchanged. Source copies/derivations
are traced by original path/hash/commit in `inputs/source-origins.json`.

## Mechanics and ownership

- Native C owns its existing child/reaper, descriptors, root and retained completion
  observations. Go owns the exclusive durable fixture snapshot. Only fixed scalar
  requests and copied bytes cross synchronous calls; no foreign pointer is retained.
- The Go library mode preserves the native default-SIGCHLD precondition. A Go-main
  probe fails that precondition as expected; no signal handler is reset or bypassed.
- `scripts/generate.mjs` binds the benign executable, root, host source/build-script
  identities and fixed frames into a separate C5b14B profile/plan/attempt. It emits
  matching native and Go constants. Source store defaults remain isolated test
  values; all native builds replace them with these generated bindings.
- Eight real C storage providers replace missing bodies. Before-spawn and
  before-teardown gates call Go persistence; reconciliation steps 17–20 publish
  checkpoints before observations. Storage replies preserve native lifecycle phase.
- Native completion commit reads private retained terminal, absence, root-removal
  and exact transport bytes. There is no observation setter. Go verifies the fixed
  bound frame and publishes completion before delivery/replay. Copying delivered
  bytes rechecks live store state; a stale cache cannot hide corrupt storage.
- Recovery converts uncertainty conservatively to indeterminate. Endpoint failure
  before process intent persists failure 1 / cursor 21 as a permanent refusal.
  Missing completion remains unresolved. Complete retained bytes replay after
  process restart; consumed intent without custody remains unresolved at 17 with
  zero new endpoints, spawns or signals. No PID is restored or probed.

`BridgeOpen`, fault injection and scalar/copy inspection exports are trusted local
fixture harness controls, not daemon or product APIs. Execute remains the fixed
registration-only driver. Initialization creates only the named owned test state;
reopen never bootstraps missing state. All new code is non-production.

## Verification

Requirements: Go 1.25.13, Node 22+, Apple clang/SDK, Darwin/arm64.

```sh
node scripts/verify.mjs
```

`--record` regenerates evidence after reviewed material changes. Ordinary mode
checks frozen material hashes before execution, then rebuilds only in owned temp
directories. It retains exact cases, Go test names, profiles, tool versions,
import/export inventories, reproduction hashes and mutation assertion outcomes in
`evidence/results.json`. Review packets/reports are separate under `review/`.

Normal build reproduction normalizes Darwin archive metadata (`ZERO_AR_DATE=1`)
and Mach-O object-symbol paths (`-oso_prefix` with the physical output path),
alongside Go trimpath/build-ID flags.
Archive members and linked ordinary binaries are compared directly.

The corpus covers uninterposed native success, fixture fault hooks, every mutating
storage route at three publication edges, four abrupt process/reopen pairs, strict
binding/observation checks, corruption/missing/mismatched-store refusal and exact
copied replay. Native ASan/UBSan instrument the parent C code, not the benign child
or ordinary Go archive. Go race checks apply separately to the store and Go archive
variant. The retained verifier reports 126 native case records, 17 Go suites with
58 subtests, eight native/Go-race integration cases and 10 mutations requiring
their exact intended assertion. Twenty ordinary mode-0 artifacts reproduce.

One pre-freeze run refused during nominal setup for case 20 before its deliberate
root-observation mutation. That run lacked per-step diagnostics; cause remains
unclassified. Added step/deadline diagnostics preserve the one-second setup bound.
No retries or deadline extension hide refusal; this fixture establishes no timing
or load-tolerance claim. See PLAN.md and review records for follow-up checks.

## Limits and next gate

Trusted exclusive one-attempt directory; 4-KiB snapshot and 32-generation cap.
Process exits and publication-edge faults are not physical disk failure or APFS
power-loss evidence. No rollback/restore, migration, installed root/launch identity,
multi-user service, hostile same-UID pathname protection, product-engine selection,
ADR-0040 performance/admission or authenticated client delivery is established.
The C/Go composition remains a fixture with explicit source/byte identities and
instrumentation; immutable production runner composition is a later gate.

Completion establishes the durable benign-fixture integration milestone. Installed
identity, restart process custody, timing/provenance, independent guest-candidate
review and exact authorization remain necessary before controlled guest execution.
ADR lifecycles, control-evidence maturity and product admission do not change.
