# Gate C P0-4A: installed development topology

Status: **development-only feasibility harness**. It creates no guest, accepts no user workload,
admits no backend/runtime/profile, and is not product or receipt code.

Owner: Capsule native-backend research. Remove or replace this harness after P0-0 through P0-3
select final mechanisms and P0-4B tests the complete signed/notarized distribution bytes, or after
an ADR rejects this topology.

## Bounded question and safety scope

Can the smallest proposed no-host-root macOS packaging shape hold explicit Supervisor, runner,
libkrun/libkrunfw, firmware/kernel/root, runtime, guest-launcher, entitlement, manifest, descriptor,
and embedded per-user service-registration roles; refuse mixed or missing bytes; and preserve the
Gate B identity/reconnect mechanics?

The defensive test is confined to this repository, generated local fixtures, one exact temporary
app under the current user's `~/Applications`, and one exact per-user `SMAppService` label. It runs
no VM and no arbitrary or untrusted workload. It never uses `sudo`, a LaunchDaemon, a privileged
helper, another user, or another system.

## Topology

```text
CapsuleP04AInstalledTopology.app (unprivileged, per-user)
├── registrar                    SMAppService register/status/unregister only
├── Supervisor placeholder       embedded LaunchAgent + narrow Mach service
├── exact-identity client        test-only Gate B protocol probe
├── nested runner app            App Sandbox + Hypervisor entitlements
├── descriptor manifest          closed FD 0...7 host-runner candidate
├── libkrun 1.19.4               pinned candidate bytes
├── libkrunfw 5.5.0              pinned candidate bytes; embeds Linux 6.12.91
├── Bun 1.3.14                   pinned but P0-0-rejected stock candidate
├── guest launcher               refusing placeholder executable
├── firmware/kernel metadata     explicit placeholders
└── runtime root                 non-bootable byte placeholder
```

The app declares macOS 13 because `SMAppService` is available there, but the manifest derives the
effective floor from every Mach-O. The locally available libkrunfw candidate was built with
`minos 26.0`, so this exact bundle's observed effective floor is macOS 26. That mismatch is a
finding, not compatibility evidence.

## Build and verify

Prerequisites are macOS/Xcode tools plus the exact retained Gate C candidate inputs:

- libkrun 1.19.4 commit `728df8125077d0db44265f6e997c72b81b65c015` at
  `/private/tmp/capsule-libkrun-v1.19.4` by default;
- libkrunfw 5.5.0 at
  `/private/tmp/capsule-libkrunfw-v5.5.0/libkrunfw/libkrunfw.5.dylib`; and
- Bun 1.3.14 from `PATH`.

Paths can be overridden with `CAPSULE_LIBKRUN_SOURCE`, `CAPSULE_LIBKRUNFW_LIBRARY`, and
`CAPSULE_RUNTIME_BINARY`. The build rejects pin/hash/version mismatch. Select a real identity with
`CAPSULE_SIGNING_IDENTITY`; without exactly one locally available Apple identity, the build uses
ad-hoc signing and records that limitation.

```sh
./experiments/gate-c-installed-development-topology/build.sh
./experiments/gate-c-installed-development-topology/verify.sh
```

`verify.sh` checks the closed component allowlist, installed bytes/modes/code identities, effective
minimum OS, no-root service shape, nested signatures, exact descriptor access modes, and these
refusals:

- missing required component;
- same-identifier mixed client bytes;
- undeclared component; and
- unexpected inherited runner descriptor.

The app's outer main executable is the only byte without a manifest-contained full-file hash. Its
code signature carries the app resource seal, which includes the manifest, so embedding its own
post-signing hash would be circular. The verifier instead validates the complete outer signature
at readback. This exception is explicit and remains provisional for the final installation-
manifest design.

## Installed service test

The installed test writes only the exact app path below and registers only the exact embedded
per-user label. It refuses pre-existing state and verifies the app before removing its own copy.

```sh
./experiments/gate-c-installed-development-topology/run.sh
```

Temporary owned state:

- `~/Applications/CapsuleP04AInstalledTopology.app`; and
- `gui/$UID/com.capsulecorp.spike.p0-4a-installed-topology.supervisor`.

The test registers through `SMAppService`, explicitly kickstarts the per-user job, validates both
ends of XPC by an exact code requirement plus message-derived `SecCode`, EUID, and audit session,
denies a stale mixed client, kills the Supervisor, explicitly restarts it, and verifies a new PID
and random instance. Initial Mach lookup did not establish on-demand activation in the retained
run, so explicit kickstart is stated rather than hidden.

If interrupted, inspect the exact service/path first and then run `run.sh --cleanup`. No cleanup
routine removes a broad directory or signals an identity-mismatched process.

See [RESULTS.md](RESULTS.md) and the tracked `evidence/2026-08-02/` snapshot.
