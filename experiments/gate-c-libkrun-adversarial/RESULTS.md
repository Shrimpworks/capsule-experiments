# Gate C adversarial libkrun/HVF results

Date: 2026-07-31

Status: **conditional fail for the exact development profile**. The reviewed corpus completed and
intentionally returned status 1 because the block-root guest saw a virtiofs device. The evidence is
precise enough for later cross-track synthesis, but not for backend-contract freeze, production
use, `validated-local`, or any claim that the profile has no host-directory or VM-escape weakness.

## Decision

Retain the development-only profile and evidence for integration, without promoting posture. The
guest-visible device finding survives review: libkrun's block-root API creates a `NullFs` virtiofs
device to expose its built-in init and pivot mount points. The pinned source sets
`shared_dir: None`; the corpus observed no mounted virtiofs filesystem and configured no host
directory. That counterevidence narrows the finding but does not make the device or its VMM attack
surface disappear.

Before backend-contract freeze, integration must either:

1. accept the exact `NullFs` device as an explicit required profile surface and validate it; or
2. remove the device from the block-root path in a governed libkrun change and rerun the corpus.

The corpus also demonstrates that VMM process exit zero is not guest-success evidence. Ordinary
success requires an exact attempt-bound completion record plus expected output and integrity
evidence.

## Validation rubric

- [x] Observe the device and mount state through the guest-visible interface.
- [x] Trace the exact block-root configuration to the pinned libkrun source and distinguish a
  `NullFs` device from a host-backed directory share.
- [x] Check the runner's imported configuration API and the safe no-start configuration probe.
- [x] Keep guest completion, runner status, teardown, and identity evidence independently
  classifiable.
- [ ] Demonstrate that the device is absent, or independently validate the exact accepted
  `NullFs` implementation against the eventual hostile-guest corpus.

## Validated finding

Finding: **the minimal block-root profile exposes an unrequested virtiofs device**.

Candidate ID: `GATE-C-ADV-NULLFS-001`. Instance key:
`728df8125077d0db44265f6e997c72b81b65c015:block-root:b04969e618dd5ecaee0cc7c87c586cba873f6f1dae00cc8db3b5d5f8a2918a9d`.

| Element | Assessment |
| --- | --- |
| Source | Guest interaction with the guest-visible virtiofs device under the fixed block-root profile. |
| Control | The runner imports no optional host-directory API, but it calls `krun_set_root_disk_remount`; that API adds the device internally. |
| Sink/boundary | libkrun's VMM-side virtiofs implementation, backed by `NullFs`, on the hostile-guest-to-VMM boundary. |
| Preconditions | The pinned libkrun 1.19.4 tree at `728df8125077d0db44265f6e997c72b81b65c015` with the block-root profile and built-in init path. |
| Counterevidence | `shared_dir: None`; no `krun_add_virtiofs*` runner import; no host directory configured; no virtiofs mount observed after pivot. |
| Proof gap | No independent `NullFs` audit, accepted-profile corpus, hostile-kernel validation, or evidence that the device can be removed without changing the boot path. |
| Disposition | Survives as an unresolved profile-contract finding; it is not evidence of a host-backed share or an observed escape. |
| Confidence | High for device presence and source cause; intentionally unscored for vulnerability impact beyond added VMM surface. |

The source trace is in the local pinned tree at
`/private/tmp/capsule-libkrun-v1.19.4/src/libkrun/src/lib.rs:2385-2418`. The relevant upstream code
adds an `FsDeviceConfig` with `shared_dir: None`; the local retained mount-flag and firmware-path
patches do not introduce that `NullFs` behavior.

## Direct observations

The reviewed raw report is `.runs/adversarial.RnxjWW/report.json`. It contains 36 VMM cases, four
identity cases, 11 classified findings, one limitation, and one failing assertion. Every VMM case
records the runner process as gone at collection time.

| Area | Observation | Classification |
| --- | --- | --- |
| Guest surface | Inventory showed virtio balloon, RNG, console, virtiofs, and block devices. Root was `/dev/vda` mounted `ro,nosuid,nodev`; no virtiofs mount was reported. | Profile failure for the unexpected device; no observed host-directory mount. |
| Guest authority | The inventory reported UID/GID 65534, no supplementary groups, `NoNewPrivs=1`, and zero effective capabilities. | Pass for the exact trusted-launcher fixture only. |
| Network and vsock | The build reported `feature.net=0`; the guest saw loopback and down `dummy0`; one TCP probe returned network unreachable; the local-CID ioctl failed. | Narrow positive evidence, not proof of all network/IPC denial. |
| Configuration surface | The exact profile was accepted. Safe no-start calls for explicit vsock, host virtiofs, GPU, sound, duplicate disk ID, and a missing disk returned zero even when feature reporting was absent. | libkrun return zero is not capability or policy evidence; a closed typed runner/Supervisor surface is required. |
| Runner imports | The runner imported block/root, VM config, rlimit, workdir, exec, init-log, and start APIs; it imported none of the audited optional-device configuration APIs. | Pass for the retained runner bytes only. |
| Completion semantics | A valid profile emitted `completionMarker=valid-profile`. Memory stress stopped after 192 MiB touched, an intentional guest crash produced a stack trace, malformed disks failed to mount, and a missing guest executable failed—while the runner returned zero in several of those cases. | Runner status alone is ambiguous; exact completion evidence is mandatory. |
| Malformed block inputs | Empty, random, truncated, corrupt-superblock, 8 GiB sparse, missing, and directory cases emitted no completion marker and left no recorded runner process. Capsule preflight rejected every non-exact input. | Fail-closed for the observed cases, with ambiguous zero host status for six cases. |
| Path indirection | Direct runner launch followed a symlink to the valid disk and completed; `OpenVerifiedRawBlock` rejected the same symlink. | Preflight is required. This does not solve the later pathname-mutation race documented by the storage track. |
| Runtime bytes | Missing libraries ended with `SIGABRT`; corrupt firmware-library bytes returned 125. Neither emitted a completion marker or left a recorded runner. | Fail-closed for the two observed fixtures only. |
| Resource probes | FD stress reached `EMFILE` after 61 opens; fork stress reached `EAGAIN` after 29 children; the 4 MiB stdout flood was fully drained while retaining 128 KiB and a full-stream hash. | Positive spike evidence for those exact bounds; no broader CPU/host-memory claim. |
| Timeout and kill | The hang hit the two-second timeout and disappeared after `SIGTERM`. A separate non-cooperative runner received exact `SIGKILL`, reported signal `killed`, and disappeared. | Positive evidence for bounded timeout and exact forced kill. Graceful shutdown is not established as a required mechanism. |
| Repetition/concurrency | Ten sequential `/bin/true` VMs and four concurrent one-second VMs exited zero without timeout and recorded `processGone=true`. | Positive finite-run evidence only. |
| Exact identity | The intended PID/start/path/code tuple was accepted. Wrong-path, wrong-start, and wrong-code tuples were rejected; the copied wrong-path runner still passed the code requirement alone. | Exact tuple required; PID, path, or signature alone is insufficient. |
| Cross-job state | The token write failed because `/tmp` was read-only; the next VM reported the token absent. | Not exercised. Writable cross-job state belongs to the separate storage track. |

Raw crash output remains in the report under case `guest.crash`; it is not duplicated into tracked
prose. The tracked evidence index and raw-file hashes are in
[SELECTED_EVIDENCE.md](SELECTED_EVIDENCE.md). The durable validation disposition is in
[VALIDATION_RECEIPT.md](VALIDATION_RECEIPT.md).

## Inferences and contract consequences

- A fixed, typed admission layer must reject optional devices and arbitrary libkrun calls even
  when a library call returns zero.
- Guest success must be based on a typed, attempt-bound completion record and expected integrity
  evidence, never the VMM's exit status alone.
- Exact runner recovery authority requires PID, start time, expected absolute path, and live code
  identity/CDHash together.
- Raw-block preflight must reject indirection, wrong size, wrong digest, and non-regular inputs, but
  a pathname API still requires immutable component-owned custody through VM creation.
- Writable cross-job isolation, installed recovery, output extraction, and supply-chain admission
  remain conclusions of their separate tracks and cannot be inferred from this corpus.

## Reproduction and evidence

The full corpus is intentionally bounded but requires the pinned source/build prerequisites,
signing identity, local fixture images, Hypervisor.framework, and Apple-silicon host described by
the base Gate C spike:

```sh
CAPSULE_SIGNING_IDENTITY='AD70CEDCA605604676C2853A229AA4664AD3F750' ./build.sh
./prepare-disk.sh
./run.sh
```

Until the virtiofs assertion is deliberately resolved, `./run.sh` is expected to print the new
evidence directory, print `harnessStatus=1`, and return status 1. A zero status must not be forced.
The reviewed raw directory is ignored by Git and preserved at:

```text
experiments/gate-c-libkrun-adversarial/.runs/adversarial.RnxjWW/
```

No corpus rerun was required for this consolidation. Verification commands and results are recorded
in [HANDOFF.md](HANDOFF.md).

## P0-2 replacement investigation (2026-08-02)

A fresh bounded source inspection found that virtiofs has no independent build feature in the
pinned libkrun tree. `NullFs` is not instantiated merely by loading the library, but it is
unconditional after the exact runner calls `krun_set_root_disk_remount`: the helper always adds
`/dev/root` with `shared_dir: None`. Default `init-blob` controls the virtual bootstrap file, not
device creation. The dylib also exports host-backed `krun_set_root`/`krun_add_virtiofs*` routes,
although the retained runner does not import them.

The smallest falsifiable change removed only that internal fs-device construction while preserving
the block-root configuration. The same feature build succeeded, but the guest produced no
completion or inventory and panicked before init because it had no bootstrap root. The unmodified
control booted `/dev/vda` read-only and again exposed the virtiofs device. Thus a simple removal is
rejected; a different bootstrap mechanism is required. This does not prove that every removal
design is impossible.

The residual guest-facing path includes generic virtio-mmio/queue/descriptor processing, the full
FUSE decoder and opcode dispatcher, worker/reset/concurrency handling, the `AugmentFs` bootstrap
overlay, and the small `NullFs` leaf. Existing unit tests and the Go profile-validator fuzz target
do not exercise that full path, and the pinned tree has no virtiofs/`NullFs` fuzz target or retained
sanitizer/coverage corpus. The exact profile therefore remains unsupported for P0-2. See
[NULLFS_P0_2.md](NULLFS_P0_2.md) for observed evidence, the bounded surface, required malformed
corpus, signing limitation, and prohibited claims.

## Limitations and prohibited claims

- The corpus is development-only spike evidence against exact retained bytes and one local host.
- It did not construct an exploit, test VM escape, validate a hostile replacement kernel, or prove
  the absence of VMM, firmware, guest-kernel, Hypervisor.framework, or host-kernel vulnerabilities.
- It did not establish a host-directory isolation guarantee; it established only that this run
  configured no host directory and the pinned source selected `shared_dir: None`.
- One TCP destination and one vsock ioctl are not a complete network/IPC denial corpus.
- The current report does not independently capture a complete host/toolchain manifest; artifact
  hashes bind the tested bytes, while the base Gate C results carry the broader environment record.
- The recovered worktree copy of the 8 GiB malformed fixture is no longer sparse on disk; the
  original run fixture remains sparse. The report and auxiliary evidence copied byte-for-byte.
- This result does not support production readiness, `validated-local`, full backend-contract
  freeze, vulnerability absence, or release of the current runtime bytes into a validation record.
- The P0-2 replacement boot comparison used non-hardened ad-hoc signing because the host had no
  valid Developer ID identity. It is bootstrap evidence only and does not update installed-profile
  identity, App Sandbox, attach-denial, or distribution claims.
