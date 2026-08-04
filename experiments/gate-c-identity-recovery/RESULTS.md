# Gate C durable identity and restart recovery results

Date: 2026-07-31 (America/Toronto)

Decision: **FAIL the remaining Apple Containerization production-backend gate. Pivot the primary
backend evaluation.** Public Containerization 0.33.3 and the macOS 26.5 Virtualization SDK expose
neither an authoritative host-side VM/helper identity nor runtime enumeration/reconnection after
the owning controller exits. A serializable `VZGenericMachineIdentifier` is guest virtual-hardware
identity; it does not identify the launchd-owned host helper and cannot reopen or reap a live VM.

This result does not negate the earlier clean observation that a direct controller's helper exited
with that controller. It means Capsule cannot durably attribute, independently reconcile, or prove
destruction of the exact hostile guest after a Supervisor restart using supported public surfaces.
That is a mandatory `CLEAN-001` requirement, so more process-name heuristics or a private API are
not an acceptable extension of the Apple path.

This is exact-version development evidence, not a claim about future Apple releases or every
Virtualization-based product.

## Environment and provenance

| Item | Observed value |
| --- | --- |
| Host | macOS 26.5.2, build 25F84; Apple silicon arm64 |
| Xcode / SDK | Xcode 26.6 (17F113), macOS SDK 26.5 |
| Swift | Apple Swift 6.3.3 |
| Apple Container CLI | 1.0.0, commit `ee848e3` (context only; this probe uses the lower-level package) |
| Containerization | tag 0.33.3, exact clean commit `a2a1add6c7e1a1665e5397edc49d925c49090b3a` |
| vminit | `ghcr.io/apple/containerization/vminit:0.33.3` |
| Kernel | `/Users/dsteele/Library/Application Support/com.apple.container/kernels/vmlinux-6.18.15-186` |
| Guest image | `docker.io/oven/bun@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04` |
| Probe signing | local ad-hoc signature with only `com.apple.security.virtualization=true` |
| Final probe SHA-256 | `618200e581661a82ff487d71e655d73696c89e119fb7093e774a7abbf23f1f3b` |

The Swift package locks all transitive revisions in `Package.resolved`. The source audit refuses a
different or dirty Containerization checkout. No local patch was applied to Containerization for
this identity/recovery result.

## Result summary

| Question | Evidence | Result |
| --- | --- | --- |
| Can Capsule persist a Containerization VM/helper identity? | `VirtualMachineInstance` exposes state and object-scoped lifecycle calls, but no VM ID, helper PID, process audit token, or lifecycle token. | **No supported host identity.** |
| Can a replacement Supervisor enumerate or reopen live VMs? | `VirtualMachineManager` exposes only `create`. `ContainerManager` exposes no runtime list/open/reconnect operation. A fresh manager can list stale on-disk artifact names only. | **No.** |
| Does Virtualization itself fill the gap? | `VZVirtualMachine` is initialized as a new object from configuration and has object-scoped start/stop/pause/resume/save/restore operations. The installed public header exposes no helper enumeration or reconnect-by-ID operation. | **No public recovery surface observed.** |
| Is `VZGenericMachineIdentifier` the missing handle? | A 70-byte value round-tripped and compared equal; a second value differed. Apple's SDK says it lets guests identify virtual hardware and must be preserved for saved-state restoration. It provides no helper mapping or live-object lookup. Containerization creates a generic platform internally and does not surface this value on `VirtualMachineInstance`. | **Useful guest identity, not host lifecycle authority.** |
| Does controller death clean up the direct VM? | The earlier direct spike observed one and two-controller cases where newly observed helpers disappeared after exact controller `SIGKILL`, while unrelated helpers remained. | **Positive causal evidence on this host, but not a durable or documented recovery mechanism.** |
| Can process scanning safely upgrade that observation into reconciliation? | During this follow-up, unrelated helpers appeared and disappeared across the baseline/start window. One controller reached ready while two new indistinguishable helper PIDs appeared. The runner refused to choose either. A separate stable helper could not be attributed with available unprivileged metadata. | **No; the negative control invalidated PID-delta attribution.** |
| Is the management-vsock channel unavailable to hostile guest code? | A non-root guest could create and autobind `AF_VSOCK`; `/dev/vsock` was present. Bounded connection attempts sent no payload and confirmed no connection, but one CID remained unresolved. Source always configures a virtio socket device and vminit listens on port 1024. | **Unresolved, not a pass.** |

## Public API and source evidence

The checked source and installed SDK have three separate identity concepts, none of which closes
the recovery requirement:

1. `ContainerManager` container IDs name Capsule-owned on-disk/container objects while the owning
   process is alive. A replacement manager has no public method to enumerate or reopen the prior
   live `LinuxContainer` / `VirtualMachineInstance`.
2. `VZGenericMachineIdentifier` is serializable guest virtual-hardware identity. The dynamic probe
   observed 70 bytes, equality after recreation, and inequality with a newly generated value. The
   [Apple documentation](https://developer.apple.com/documentation/virtualization/vzgenericplatformconfiguration/machineidentifier)
   and installed SDK header describe saved-state and guest identity semantics, not a mapping to a
   host helper or a lookup service.
3. The launchd-owned `com.apple.Virtualization.VirtualMachine.xpc` PID is host process state, but
   the public Containerization instance and
   [VZVirtualMachine](https://developer.apple.com/documentation/virtualization/vzvirtualmachine)
   object do not expose that PID or an authoritative token binding it to a VM.

The exact source audit printed:

```text
containerizationCommit=a2a1add6c7e1a1665e5397edc49d925c49090b3a
containerizationRuntimeEnumeration=false
containerizationDurableVMIdentity=false
virtualizationHelperEnumeration=false
genericMachineIdentifierSemantic=guest-virtual-hardware-identity
managementVsockDeviceConfigured=true
managementVsockPort=1024
```

The fresh-manager probe deliberately reports only artifact directory names and
`runtimeEnumerationPerformed=false`. A stale directory is not evidence of a live or destroyed VM.
The broader public package surface is listed in Apple's
[Containerization documentation](https://apple.github.io/containerization/documentation/containerization/).

## Fail-closed concurrency and crash observations

The retained suite establishes a helper baseline before every controller start and requires
exactly one new helper before recording an association. It never signals helper PIDs. It sends
`SIGKILL` only to PIDs it launched after re-reading and matching the full controller command, so
PID reuse cannot redirect cleanup to an unrelated process.

The full new concurrency/lifecycle matrix did not produce a pass in this shared host session:

- One run reached a ready `started` guest, but another Virtualization helper appeared during the
  association window. The suite stopped rather than guessing.
- On the final run, the outer baseline was `35268,61751,83720`; immediately before the controller
  it was `35268,61751,83726`; after controller PID `83728` reached ready, helpers `83920` and
  `83931` were both new. The exact owner of either helper was unknowable from the public surface.
- The failure trap verified and killed only controller PID `83728`. Both new helpers subsequently
  disappeared; stable pre-existing helpers remained. Because two possible owners changed, that
  disappearance cannot be promoted to exact per-VM evidence.
- Unprivileged `ps` and `lsof` inspection could not safely attribute stable helper PID `61751` to a
  specific controller or VM. Privileged/private inspection was neither necessary nor acceptable
  as the product mechanism.

This interference is direct negative-control evidence, not merely noisy test infrastructure. A
production Supervisor must reconcile safely while other Virtualization consumers exist. The
harness correctly cannot complete its `multi-a`, `multi-b`, `object`, `created`, `exited`, and
`stopped` matrix without first obtaining the supported identity mechanism the platform lacks.

For separation of evidence: the earlier direct spike did complete a clean simultaneous-control
case. Controllers `98440` and `98407` produced exactly two new helpers, `98548` and `98588`.
Killing one controller removed one helper while the other controller/helper and baseline helper
remained; killing the second removed the other. That is strong causal lifecycle evidence for this
host. It still could not say which helper belonged to which controller, survive a controller
restart, or authorize a precise forced reap. See
[`../apple-containerization-direct/RESULTS.md`](../apple-containerization-direct/RESULTS.md).

## Management-vsock observation

Containerization 0.33.3 installs `VZVirtioSocketDeviceConfiguration()` even when the public
container configuration uses `interfaces=[]` and `sockets=[]`; vminit's management service uses
port 1024. In the ready non-root guest:

- uid/gid were 1000/1000;
- `/dev/vsock` existed and `/proc/net/vsock` was absent;
- creating and autobinding an `AF_VSOCK` stream socket succeeded, although `getsockname` retained
  the wildcard CID and returned an ephemeral port;
- CIDs 0, 1, 2, and 4 through 16 returned connection reset for port 1024;
- CID 3 remained incomplete at the bounded 150 ms poll; and
- no attempt was reported connected and the probe sent no management bytes.

Therefore this result is deliberately **unresolved**. It neither demonstrates management-service
compromise nor proves that hostile guest code cannot reach the channel. A backend whose required
control plane is guest-addressable must provide a purpose-scoped authenticated protocol and an
adversarial parser/authorization corpus; simply setting the user relay list empty is insufficient.

## Architecture consequence

Gate C remains failed even though the direct Apple path has valuable positive controls (per-VM
isolation, empty data-network interfaces, read-only roots, exact discrete resources, bounded
output composition, and observed controller-coupled cleanup). Capsule's architecture requires
independent durable teardown evidence before releasing capabilities or issuing a terminal receipt.

The next implementation decision should be:

1. move the primary production-backend evaluation to the alternate OCI/microVM candidate with a
   durable runtime ID and supported list/inspect/kill/delete reconciliation;
2. keep direct Apple Containerization as a development-only backend, fail closed after ambiguous
   controller loss, and never claim `CLEAN-001` from process disappearance alone;
3. retain the small PID-limit patch evaluation separately—it solves resource enforcement, not
   lifecycle identity; and
4. reconsider Apple as the production backend only if a future public API supplies authoritative
   identity plus enumerate/reconnect/force-reap semantics, or Apple documents a verifiable
   controller-death destruction guarantee that Capsule can independently attest.

Do not add private framework calls, process-name scanning, helper-PID guessing, root-only host
introspection, or a broad privileged helper to rescue this backend. Those would replace the
missing supported lifecycle authority with a larger and more brittle trust boundary.

## Retained artifacts and cleanup

- `Sources/IdentityRecoveryProbe/main.swift`: serializable guest-ID check, phase holds,
  fresh-manager artifact inspection, bounded no-payload vsock probe, and marker-validated cleanup.
- `audit-public-surfaces.sh`: exact-commit source and installed-SDK assertions.
- `build-probe.sh`: exact-source build plus narrow ad-hoc entitlement signing.
- `run-live-tests.sh`: fail-closed multi-controller and lifecycle-boundary harness.
- `Package.swift` / `Package.resolved`: reproducible dependency graph.

All experiment-owned controllers from the aborted runs were terminated after exact command
verification. Their newly observed helpers disappeared without being signaled. All failed run
roots were removed through exact marker validation. Pre-existing helpers and services were not
stopped or modified.

## Verification

Completed:

```text
exact Containerization source/API audit       PASS
Swift debug build against clean 0.33.3         PASS
ad-hoc signature and entitlement verification PASS
VZGenericMachineIdentifier round-trip          PASS
marker/path refusal and protected cleanup      PASS
bounded live guest/vsock observation           PASS (observation only)
strict helper association negative control     PASS (refused ambiguous attribution)
full new lifecycle/concurrency matrix           NOT COMPLETED (ambiguous helper ownership)
```

The incomplete matrix does not soften or create the gate decision: the supported public API
absence is the decisive result, and the concurrency collision demonstrates why the proposed
process-delta workaround cannot safely substitute for it.
