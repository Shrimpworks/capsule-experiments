# Direct Apple Containerization backend results

Date: 2026-07-31 (America/Toronto)

Decision: **Gate C remains FAIL for a production backend, but direct Containerization is a viable
candidate for one narrowly patched follow-up.** It can be built and run locally with an ad-hoc
virtualization entitlement and no paid Apple developer account. It materially improves the stock
API-server crash behavior, exposes the needed no-network and no-new-privileges choices, and supports
Supervisor-owned bounded output. A retained four-hunk patch successfully adds the missing public
`pids.max` control. A supported durable identity/enumeration surface for the Virtualization helper
is still absent, so the backend does not satisfy the full gate.

Follow-up disposition: the focused identity/recovery spike completed and failed direct
Containerization as a production backend because the public API exposes no durable host-side
VM/helper identity or restart enumeration. This document remains historical positive-mechanism
evidence; see [`../gate-c-identity-recovery/RESULTS.md`](../gate-c-identity-recovery/RESULTS.md) and
ADR-0020 for the superseding backend decision.

This is exact-host development evidence, not a secure-backend or production-readiness claim.

## Environment and provenance

| Item | Observed value |
| --- | --- |
| Host | macOS 26.5.2 (25F84), Apple silicon arm64 |
| Swift | Apple Swift 6.3.3; Command Line Tools only; full Xcode absent |
| Containerization | 0.33.3, commit `a2a1add6c7e1a1665e5397edc49d925c49090b3a` |
| vminitd | 0.33.3, same commit, observed in guest boot log |
| Kernel | `vmlinux-6.18.15-186`, SHA-256 `2fe4a58d2885d623bcb4d705900ac8c1d4f02371152da8126b3b00c8c47fc3a1` |
| Guest image | `docker.io/oven/bun@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04`; selected arm64 manifest `sha256:6068a9d40e9fc5c4519891edb63dfc5935c393fe2228eb9a5b7f472b444b5ee2` |
| Signing | local ad-hoc signature with only `com.apple.security.virtualization=true`; empty Team ID |
| Probe | 75,445,712-byte patched debug binary after signing; no Developer ID or provisioning profile |

The first full build completed from SwiftPM with Command Line Tools. The pinned package compiled
with deprecation warnings in its gRPC wrapped-channel call but no build failure. The retained
`Package.resolved` records the transitive versions actually resolved.

## Observed capability results

| Requirement | Direct 0.33.3 observation | Result |
| --- | --- | --- |
| Local license-free execution | Ad-hoc signing embedded the virtualization entitlement and started a real VM/container. | Pass for local development only. Distribution signing remains untested. |
| Explicit network denial | `networking: false`, `interfaces=[]`, and `sockets=[]`; guest reported `eth0=absent`. | Pass for the tested mechanism. Management vsock remains present and privileged. |
| Identity/privilege floor | Guest ran uid/gid 1000, `NoNewPrivs: 1`, and empty capability sets. | Pass for tested configuration. Setuid/image corpus remains future work. |
| Root/input mutability | `readOnly: true`; a write to `/` failed, while a 16 MiB `nosuid,noexec,nodev` tmpfs write succeeded. | Pass for the tested root/tmp mechanism; immutable Capsule input staging was not part of this spike. |
| Memory | Configuration and live statistics both reported exactly 268,435,456 bytes. | Pass for declared 256 MiB point. First-wave OOM testing remains applicable. |
| PIDs, unmodified 0.33.3 | The first run set `RLIMIT_NPROC=16`, but live guest and API statistics reported `pids.max=max` / `UInt64.max`. | **Fail in upstream API.** The guest agent and OCI model support pids, but the public configuration omits it. |
| PIDs, retained patch | A four-hunk patch exposes `pidsLimit` and maps it into the existing OCI resource. Both uid/gid 1000 and uid/gid 0 guests reported `pids.max=16`, started 13 child processes, then received a fork denial; `pids.events` recorded two maximum-limit events. The attack `RLIMIT_NPROC` was 256. | **Pass for the patched mechanism.** Root and non-root enforcement is observed; upstream acceptance, invalid-value handling, and broad workload compatibility remain open. |
| Storage | Requests 32, 64, and 127 MiB all produced 128 MiB images; 128 MiB was exact; 129 MiB produced 256 MiB; 256 MiB was exact. | Conditional: enforce/approve discrete actual sizes only. Never silently accept arbitrary requested sizes. |
| Output | A 1 MiB flood was retained at exactly 65,536 bytes; the overflow event caused a Supervisor-style watchdog to send `SIGKILL`; exit was 137 and OOM count stayed zero. | Pass for prototype bounded stream/kill composition. Production needs durable typed limit evidence and race tests. |
| Normal teardown | Normal run exited 0, `stop()` completed, the container directory was deleted by scoped cleanup, and no new Virtualization helper remained. | Pass for tested path. |
| Controller crash | Live controller PID 83331 had a newly observed launchd-owned Virtualization XPC helper PID 83485. After exact controller `SIGKILL`, PID 83485 disappeared within the ten-second observation window; unrelated pre-existing helper PID 35268 remained. | Better than stock API orphan behavior, but helper association was inferred by timing/process delta, not a supported durable handle. Conditional only. |
| Simultaneous controller control | With baseline helper 35268, controllers 98440 and 98407 produced exactly two new helpers, 98548 and 98588. Killing 98440 removed exactly one new helper while 98407 and one helper remained; killing 98407 removed the other. Baseline 35268 remained throughout. | Strong causal one-controller/one-helper cleanup evidence on this host, but the API still did not reveal which helper belonged to which controller or provide a durable identity. |
| Recovery evidence | The killed controller left its scoped rootfs/boot log, while the VM helper disappeared. A fresh manager has no supported API to reopen/enumerate that exact VM. | Fail the full durable enumeration/receipt requirement. Treat stale state as indeterminate cleanup evidence, not terminal success. |

Normal-run guest and live-stat output:

```text
uid=1000 gid=1000
NoNewPrivs: 1
pids.max=max
eth0=absent
rootWrite=denied
tmpWrite=allowed
memoryLimitBytes=268435456
pidsCurrent=2
pidsLimit=18446744073709551615
exitStatus=0
```

Storage output:

```text
requested MiB: 32  64  127 128 129 256
actual MiB:    128 128 128 128 256 256
exact:         no  no  no  yes no  yes
```

Output-limit result:

```text
outputBytes=65536
outputOverflowed=true
exitStatus=137
oomKills=0
```

Patched PID-limit results:

```text
configuredPidsLimit=16

non-root: uid=1000 gid=1000 pids.max=16 forkDeniedAt=13 forkStarted=13
root:     uid=0    gid=0    pids.max=16 forkDeniedAt=13 forkStarted=13
both:     pids.events=max 2; exitStatus=0; pidsLimit=16; oomKills=0
```

Both attack profiles retained empty capabilities, `NoNewPrivs: 1`, no `eth0`, a read-only root,
and a writable bounded tmpfs. Raising `RLIMIT_NPROC` to 256 for these cases separates the observed
cgroup denial from the earlier per-process rlimit. The successful workload exit is expected: the
test catches the denied spawn and treats denial before 64 children as success.

The first normal lifecycle reached guest exit and VM stop, then an experiment-only optional-value
JSON helper recursively overflowed while printing the result. The macOS diagnostic report located
the fault entirely in `DirectProbe.normalizeJSON`; the guest boot log showed clean exit and unmount.
That spike serializer was removed, and the repeated normal lifecycle completed successfully. This
was not classified as a Containerization failure.

## Source observations versus inference

Observed at the exact commit:

- `ContainerManager.create` exposes `networking: Bool` and skips interface allocation when false.
- `LinuxProcessConfiguration` exposes `noNewPrivileges` and exact capability/rlimit configuration.
- `ContainerizationOCI.LinuxResources` and vminitd's cgroup manager implement `LinuxPids` /
  `pids.max`.
- Unmodified `LinuxContainer.generateRuntimeSpec` constructs only memory and CPU resources; its
  public configuration has no pids field.
- The retained patch adds an optional `pidsLimit` field and maps it to the already-present
  `LinuxPids` OCI structure. The patched dynamic results show vminitd applies that value to cgroup
  v2 for both root and non-root workloads.
- Virtualization runs the VM in a launchd-owned
  `com.apple.Virtualization.VirtualMachine.xpc` process, not as a child PID of the controller.

Inference bounded by the dynamic results:

- Direct VZ ownership avoids the stock API server's demonstrated long-lived crash orphan on this
  host because the newly created XPC VM helper died when its client controller died. The
  simultaneous-control result reduces timing-coincidence uncertainty but is still an observation,
  not a documented lifecycle guarantee.
- Process-name scanning is not adequate terminal evidence when several VM helpers exist. Capsule
  still needs a supported, durable association or an independently verifiable lifecycle token.
- The PID portion is locally feasible with a very small patch, but that patch needs tests,
  validation semantics, dependency governance, and preferably upstream acceptance. It does not
  solve the separate helper-identity and teardown-evidence requirement or pass CLEAN-001.

## Next decision gate

Continue the Apple path only for one focused identity/recovery spike:

1. upstream or maintain the reviewed PID patch with positive, invalid-value, concurrency, and
   compatibility tests; Capsule must always set a non-null limit;
2. define supported helper/VM identity evidence that survives Supervisor restart, or prove a
   platform-backed rule that controller death synchronously destroys the exact helper and can be
   independently attributed;
3. persist a bounded transcript containing config digest, helper identity, output-limit event,
   guest exit/OOM statistics, stop result, and independent disappearance check; and
4. repeat the now-positive simultaneous multi-VM case under start/stop races, host pressure,
   controller crash at every lifecycle phase, and OS/backend upgrades.

Pivot to the alternate backend if those identity/recovery requirements need private APIs or broad
upstream changes. Developer ID signing, notarization, production XPC code requirements, and
provisioned Secure Enclave behavior remain deferred until the Apple account exists.
