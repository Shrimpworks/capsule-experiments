# Gate C libkrun/HVF spike results

Date: 2026-07-31

Decision: **conditional pass; reopen a native Apple-silicon production candidate without changing
the current validated posture.**

## Environment

| Item | Observed value |
| --- | --- |
| Host | MacBookPro18,4, arm64 |
| macOS | 26.5.2 (25F84) |
| Hypervisor support | `kern.hv_support=1` |
| Xcode | 26.6 (17F113) |
| Apple clang | 21.0.0 |
| Rust | 1.93.1 |
| Go | 1.26.5 |
| LLD | 22.1.8 |
| libkrun | 1.19.4 at `728df8125077d0db44265f6e997c72b81b65c015`, two retained patches |
| libkrunfw/kernel | 5.5.0 / Linux 6.12.91 |
| Signing | Developer ID Application, Team ID `3DDR84M4JS`, hardened runtime |

## Observed evidence

| Area | Observation | Result |
| --- | --- | --- |
| VM boundary | Hypervisor.framework booted arm64 Linux with one vCPU and 256 MiB configured RAM. libkrun ran in the caller; no backend helper was created. | Pass |
| Root/storage | A raw ext4 virtio block device mounted `ro,nosuid,nodev`; root writes failed with `EROFS`. No host directory or virtiofs share was configured. | Pass after narrow retained mount-flag patch |
| Network | libkrun was built without `NET`; the guest had only loopback and a down `dummy0`. A TCP attempt failed `network is unreachable`. | Pass for no-host-network profile |
| Vsock/TSI | Implicit vsock was disabled. `/dev/vsock` existed as a node, but `VM_SOCKETS_GET_LOCAL_CID` failed and no `/proc/net/vsock` transport was present. | Pass; active capability test replaces pathname inference |
| Guest authority | The trusted launcher cleared supplementary groups, set `PR_SET_NO_NEW_PRIVS`, changed to UID/GID 65534, and execed the workload. `CapEff` was zero. | Pass for spike launcher |
| Limits | Guest rlimits were FSIZE 1 MiB, CORE 0, NPROC 32, and NOFILE 64. Active probes reached `EMFILE` after 59 additional descriptors, `EAGAIN` after 29 child processes, and the file-size child stopped on its bounded write with the spike's exit 73. | Pass |
| App Sandbox | A correctly bundled same-Team runner retained `app-sandbox` and `hypervisor`, booted with one exact absolute read-only disk exception, and passed the full probe. The identical bundle without disk authority failed while configuring virtio-blk. | Pass; temporary exception is spike-only |
| Live identity | Security.framework returned identifier `com.capsulecorp.spike.libkrun-runner`, Team ID `3DDR84M4JS`, CDHash `f02a81293dd90a09f7fcfe8e515fd945cec1e5c7`, and a valid exact requirement for the live runner. PID, start seconds/useconds, path, UID, and GID were retained. | Pass |
| Exact teardown | `SIGTERM` to the verified runner PID removed the VM in the next 100–200 ms poll. Two concurrent runners were independent; cancelling A left B live and code-valid. | Pass |
| Controller crash window | A private inherited pipe gated VM start. Controller `SIGKILL` before record left no record and no runner; after durable record but before authorization left a record and an exited runner; after authorization left a recorded, reparented, code-valid runner that recovery reaped exactly. | Pass at all three checkpoints |
| Bun | Digest-pinned Bun 1.3.14 reported its version and ran native TypeScript as UID/GID 65534. | Pass for dependency-free smoke scope |
| Startup | Five sequential `/bin/true` guests completed in 0.13–0.15 seconds (mean 0.144 seconds). | Promising |
| Idle footprint | One 256 MiB-configured idle guest showed about 101 MiB host RSS by `ps`; virtual/shared mappings are much larger and were not treated as committed memory. | Measurement only |

Final ignored artifact hashes at the evidence point:

| Artifact | SHA-256 |
| --- | --- |
| signed runner | `18657ed8a8b14e330d6377d6680456beeb16d43d847842a8e8ef94d1d8b5c8e0` |
| signed libkrun | `4b46beeaea7fce6494c5e4bc40c2475499c1cef9d6fd50906d1202fcbcda88ed` |
| signed libkrunfw | `433ad743f570df81ec34f4b5615c757ddfbde379739e38ae4c8d4f6eadfc13c3` |
| final Alpine probe disk | `fd9b87168fa4f1553dfd0185e7f8dad6259a94766ebb205fdd4c6778ba10cc6e` |
| Bun compatibility disk | `83f6949696eb42ace80f7efc01355cd04d07c3a7af7cfdd9f4ec9ba1d9bf68ff` |
| guest probe | `752781a94044d3d88c1fa307c4d4f8f06ae60dc4e3ac764508c1a8639bdb96c9` |
| guest launcher | `dd96564b269df973fb62b6a893769574e6d5a3184eaa0b8f37573d8ff5004696` |

Signing timestamps make rebuilt Mach-O hashes non-reproducible even when source inputs are
unchanged. Runtime manifests must bind the distributed bytes, while source provenance separately
binds the pinned commits, patches, toolchain, and firmware/kernel source.

## Why this differs from Apple Containerization

Apple Containerization hid VM ownership behind controller and framework helpers with no supported
durable host handle, enumeration, reopen, or force-reap operation. libkrun/HVF makes the signed VMM
process itself the VM: Apple documents one VM per Hypervisor process, and the observed runner had no
new helper. Capsule can persist a live PID/start/code tuple before authorizing guest start, then
verify or kill that exact process after Supervisor restart.

This does not make PID or path alone an identity. Recovery must require the persisted PID and start
time, live Security.framework code requirement/CDHash, expected executable location, attempt state,
and handshake transcript. A mismatch is unresolved and execution remains disabled; process-name
scans are never cleanup authority.

## Required product design

1. Keep one runner process and one VM per attempt; never multiplex attempts in one VMM.
2. Preserve the durable-record-before-start handshake and fail closed on control-pipe EOF.
3. Package the runner and same-Team dynamic libraries in a signed sandboxed bundle. Store disks in
   a component-owned container/app group instead of temporary absolute-path exceptions.
4. Build libkrun with only required device features. V0 has block, console, RNG, and no network,
   TSI, host directory, GPU, sound, or arbitrary device attachment.
5. Use raw, digest-verified, immutable runtime/source disks. Add one separately bounded disposable
   writable block disk for scratch/output; never probe a guest-writable image as another format.
6. Make the trusted guest launcher part of the signed runtime bundle and independently review its
   UID/GID, groups, capabilities, `no_new_privs`, rlimits, mount, seccomp, and shutdown behavior.
7. Bound stdout/stderr outside the VM independently of guest cooperation. A full pipe or hostile
   console must not block timeout/cancellation/reaping.
8. Treat runner absence as authoritative only when the exact recorded identity is absent and the
   create/start protocol proves no unrecorded VM could have started.

## Remaining gates

- Add read-only source/input and bounded writable scratch/output block devices, then verify quotas,
  symlink/special-file attacks, output truncation, parser isolation, and post-stop extraction.
- Add bounded console capture, wall timeout, guest `SIGTERM` grace, forced host kill, and teardown
  evidence under output flooding and a wedged guest kernel.
- Decide the exact user-owned CPU/memory profiles. One vCPU and hardware RAM sizing are exact, but
  no host CPU-percentage claim was tested.
- Run the complete malicious Bun/kernel/VMM corpus, fuzz libkrun-facing configuration and block
  inputs, and test cross-job leakage across repeated and concurrent attempts.
- Test sleep/wake, logout/login, Supervisor restart loops, memory/disk pressure, host reboot,
  corrupt runtime disks, update replacement, installed app containers, notarization, stapling, and
  Gatekeeper from a clean machine.
- Independently review both libkrun patches and the guest launcher; upstream or maintain a governed
  fork with advisories, SBOM, provenance, patch response, rollback, and exact source publication.
- Accept the Apple-silicon/macOS 14+ product floor or select and separately validate another backend
  for Intel Macs.
- Compare the completed native profile with gVisor on isolation depth, lifecycle TCB, update
  surface, operations, performance, and failure recovery before selecting the final backend.

## Decision consequence

ADR-0020 remains correct about Apple Containerization and gVisor remains an independent candidate,
but Gate C is no longer blocked on a Linux worker. libkrun/HVF becomes the preferred native Apple
candidate for the next backend slice. No backend posture claim changes until the remaining gates
pass and an exact runtime/profile validation record is accepted.

## Primary references

- [Apple Hypervisor framework](https://developer.apple.com/documentation/hypervisor)
- [Apple `com.apple.security.hypervisor` entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.hypervisor)
- [Apple App Sandbox](https://developer.apple.com/documentation/security/app-sandbox)
- [libkrun upstream](https://github.com/libkrun/libkrun)
- [libkrunfw upstream and license/distribution notes](https://github.com/libkrun/libkrunfw)
- [libkrun v1.19.4](https://github.com/libkrun/libkrun/releases/tag/v1.19.4)
- [libkrunfw v5.5.0](https://github.com/libkrun/libkrunfw/releases/tag/v5.5.0)
