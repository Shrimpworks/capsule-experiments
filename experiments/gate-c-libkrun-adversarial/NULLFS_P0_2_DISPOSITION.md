# Gate C P0-2 `NullFs` disposition spike

Date: 2026-08-02

Status: **`GOVERNED-PATCH` selected; removal is credible but not admitted**.

This is a defensive, development-only local prototype against Capsule's pinned libkrun fixture. It
does not admit a backend, authorize user bytes, establish installed-profile identity, or claim that
any remaining VMM surface is safe or bug-free.

## Decision

The unexpected `NullFs` device is not intrinsic to block I/O. The pinned route uses it to deliver
the first-stage `init.krun` and four pre-pivot mount points. A narrowly governed alternate
bootstrap can remove that device: place the same trusted init binary inside the candidate immutable
block root, boot `/dev/vda` directly, and remount the root `ro,nosuid,nodev` before launching the
workload.

The retained prototype built and booted with the internal pinned libkrunfw kernel, exposed only
virtio balloon, RNG, console, and block devices, mounted no virtiofs filesystem, denied the network
probe, and exposed no usable vsock. The 36-case adversarial rerun no longer reported the original
`NullFs` failure. Its three failures were the expected consequence of ad-hoc signing on a host with
no valid Developer ID identity, not device or route failures.

Capsule should therefore carry the direct-block-root change into an independently reviewed
governed patch branch and rerun every affected final-profile gate. It should not start the much
larger residual virtiofs/FUSE acceptance campaign unless this governed branch later fails its
installed, custody, or review requirements.

The other dispositions were rejected for this spike:

- `REMOVE` would overstate a development probe as final removal without governed source,
  installed-byte, custody, and final-corpus evidence.
- `ACCEPTANCE-CAMPAIGN` is not the next action because a smaller credible removal route now boots.
  The prior acceptance-feasibility map remains a bounded fallback, not completed acceptance.
- `REJECT` is premature because the direct-root prototype preserved guest startup and the tested
  device/cross-job properties.

## Authorized scope and method

The experiment used only this repository, the pinned libkrun 1.19.4 source at commit
`728df8125077d0db44265f6e997c72b81b65c015`, the retained libkrunfw 5.5.0 bytes, generated public
Alpine fixture bytes, local Docker fixture construction, and bounded local HVF guests. No user
content, unrelated system, third-party deployment, credential, or arbitrary untrusted workload was
accessed.

Prototype changes remain under `experiments/`. Product packages do not import them.

## Pinned bootstrap dependency trace

The exact retained `krun_set_root_disk_remount` path supplies two distinct mechanisms:

| Stage | Pinned dependency | Why the minimal deletion failed |
| --- | --- | --- |
| Kernel command line | `DEFAULT_KERNEL_CMDLINE`, `init=/init.krun`, and `KRUN_BLOCK_ROOT_*` values | With no early root containing `/init.krun`, the kernel had no PID 1 to perform the block-root pivot. |
| Dummy root transport | One virtiofs fs device with `fs_id=/dev/root`, `shared_dir=None`, and a 512 MiB shared-memory window | Deleting it removed the kernel's initial root. |
| Server selection | `Server<AugmentFs<NullFs>>` | `NullFs` supplies no host directory, but the generic queue/FUSE server remains guest reachable. |
| Bootstrap file | One-shot `/init.krun` from `init_blob::INIT_BINARY` | This trusted static binary mounts system filesystems, reads the libkrun kernel-command-line environment, and launches the configured executable. |
| Bootstrap directories | Virtual `/dev`, `/proc`, `/sys`, and `/newroot` entries | They are mount points before the block root is moved into place. |
| Block pivot | `init.krun` mounts `/dev/vda` at `/newroot`, moves it to `/`, chroots, then mounts system filesystems again | The block device itself is usable after early init; it was not configured as the kernel's original root. |
| Root hardening | The retained mount patch translates exact `ro,nosuid,nodev` into generic VFS flags | Passing those generic flags as ext4 data fails, so a direct kernel root needs a post-mount remount. |

`shared_dir=None` prevented construction of the macOS passthrough server, but it did not make the
virtiofs transport, queues, descriptor handling, FUSE decoder, worker, overlay, or shared-memory
mapping path absent. That prior residual-surface finding remains correct for unpatched bytes.

The compact trace is retained in
[`bootstrap-trace.txt`](evidence/nullfs-p0-2-disposition/bootstrap-trace.txt).

## Alternate-bootstrap probes

### External initramfs: rejected

The first probe extracted the exact pinned kernel bytes from libkrunfw, supplied them through
libkrun's external-kernel API, and attached a valid uncompressed SVR4 `newc` archive containing:

- `/init.krun`, built from the same pinned `init_blob` source;
- `/dev`;
- `/proc`;
- `/sys`; and
- `/newroot`.

The minimally removed libkrun built, but the pinned guest panicked before init with no inventory or
completion. This branch was not selected. Making it work would require changing or rebuilding the
pinned kernel/initramfs contract and would also introduce pathname custody for an external kernel
and initramfs. It is broader than necessary.

### Direct block root: selected prototype

The successful prototype applies
[`0002-direct-block-root-bootstrap-probe.patch`](patches/0002-direct-block-root-bootstrap-probe.patch)
after the two retained Gate C patches. It:

1. restricts the prototype block-root helper to exactly `/dev/vda`, `ext4`, and
   `ro,nosuid,nodev`;
2. removes `FsDeviceConfig` construction from that helper;
3. keeps the internal pinned libkrunfw kernel route;
4. boots with `root=/dev/vda rootfstype=ext4 ro rootwait`;
5. selects `/usr/local/libexec/capsule-init.krun` from the candidate runtime root as PID 1;
6. avoids passing `KRUN_BLOCK_ROOT_*`, so init does not pivot the already-mounted block root; and
7. remounts `/` with `MS_REMOUNT|MS_RDONLY|MS_NOSUID|MS_NODEV` before workload launch.

The trusted init becomes an ordinary exact runtime-root component covered by the runtime-bundle
manifest and P0-1 root custody. No additional guest device, shared-memory window, external kernel
path, initramfs path, or host-directory share is required.

The probe deliberately does not generalize libkrun's public API. A production proposal should use
a new narrow API or an equally explicit governed profile rather than silently changing broad
`krun_set_root_disk_remount` compatibility. Unknown devices, filesystems, options, bootstrap paths,
and route combinations must fail closed.

## Device and route rerun

The exact direct-root inventory observed:

```text
virtio0: virtio_balloon
virtio1: virtio_rng
virtio2: virtio_console
virtio3: virtio_blk
mount=/dev/root / ext4 ro,nosuid,nodev,relatime
network=denied: network is unreachable
vsock=unavailable
```

No virtiofs device or mount appeared. The runner imported `krun_set_root_disk_remount` and imported
none of `krun_set_root`, `krun_add_virtiofs*`, `krun_set_kernel`, or `krun_set_firmware`. The dylib
still exports the host-directory APIs; the narrow result is that this runner cannot call them, not
that those routes are absent from libkrun.

The read-only
[`audit-nullfs-alternate-source.sh`](audit-nullfs-alternate-source.sh) checks the pinned commit,
exact block profile, absence of fs-device construction in the selected helper, direct-root command
line, init remount, and runner imports. It is a regression assertion, not installed route-closure
or VMM-safety evidence.

The existing adversarial harness reran 36 cases plus four identity cases against the prototype:

- exact inventory and completion completed;
- four concurrent guests terminated and their processes were gone;
- timeout and forced-kill paths remained bounded;
- malformed block cases did not produce a valid completion;
- a fresh second VM reported `tokenLeak=absent`;
- the write side of that cross-job test remained unexercised because `/tmp` was read-only, matching
  the original root-only track limitation; and
- no original `NullFs` failure remained.

The harness continued to expose unrelated known limitations: runner zero is not guest completion,
preflight—not libkrun—must reject several malformed pathname/image cases, and invalid executable or
guest panic paths cannot become ordinary success.

The three harness failures were exact/wrong-path/wrong-start code-validity limitations caused by
the deliberately ad-hoc-signed probe. The result is not Developer ID, hardened-runtime, App
Sandbox, installed-service, or P0-4 identity evidence.

See
[`prototype-summary.json`](evidence/nullfs-p0-2-disposition/prototype-summary.json) and
[`verification.txt`](evidence/nullfs-p0-2-disposition/verification.txt).

## Required governed-patch exit work

This spike makes removal credible; it does not close P0-2 for final bytes. Before the current
profile can become even `development-admitted`, the governed branch must retain all of the
following:

### Source and API governance

- A narrow source diff reviewed independently against the exact pinned libkrun and init sources.
- An upstreamed change or governed fork with exact source publication, provenance, SBOM, advisory
  ownership, and libkrun/libkrunfw/kernel license compliance.
- A purpose-specific API/configuration that rejects every device, filesystem, option, init path,
  and route not in the closed profile.
- Mutation tests that restore fs-device construction, `shared_dir=None`, `krun_set_root`, every
  `krun_add_virtiofs*` route, an external kernel/firmware path, or another dynamic caller and prove
  installed admission fails.

### Bootstrap and root invariants

- Bind the exact init digest, path, mode, owner, root-image digest, kernel command line, block
  identity, filesystem, and root flags in the runtime manifest and launch record.
- Prove missing, replaced, non-regular, wrong-mode, wrong-digest, symlinked, and malformed init
  states fail without workload start or ordinary completion.
- Prove the root is mounted `ro,nosuid,nodev` before the workload and remains so across launch,
  cancellation, panic, and teardown.
- Complete P0-1 attachment identity, frozen-object construction, and end-to-end same-user custody
  for the exact final root descriptor. A pathname prototype is not final immutable custody.

### Final topology and corpus

- Rebuild and rerun on the exact final signed/notarized Supervisor, runner, libkrun, libkrunfw,
  kernel, root, init, entitlements, FD manifest, and minimum macOS profile.
- Prove no host-directory import, export redemption, alternate caller, injection, attach, or dynamic
  loading route is available to the installed runner.
- Rerun full device inventory, malformed image, concurrency, cross-job writable scratch,
  cancellation, exact forced teardown, recovery, App Sandbox, supply-chain, and installed identity
  corpora.
- Retain an exact negative configuration matrix and fail the build/admission record if any
  virtiofs device or mount appears.
- Keep P0-3 typed port transport/completion separate. A NullFs-free boot does not validate console
  queues, framing, launcher ownership, or guest completion semantics.

Passing this work would remove the virtiofs/FUSE acceptance obligation only from the exact final
direct-root topology. It would not establish absence for other libkrun consumers or configurations,
nor would it prove the remaining VMM devices safe.

## Acceptance fallback disposition

The acceptance branch was not executed because removal now has a smaller credible path. If the
governed direct-root branch later fails, the complete acceptance-feasibility map in
[`NULLFS_P0_2.md`](NULLFS_P0_2.md) remains mandatory: route closure; both virtqueues and all
descriptor forms; every FUSE opcode and length edge; `AugmentFs`/`NullFs` overlay and mapping
behavior; workers, reset, cancellation, concurrency, and exhaustion; ASan/UBSan/leak checks; TSan
where supported; structure-aware in-process and hostile-guest targets; coverage artifacts; crash
triage/fixes; independent review; and zero unresolved high-severity findings.

Nothing in this result accepts that surface or permits describing it as absent, safe, or proven
bug-free on unpatched bytes.

## Environment and limitations

- Host: Apple silicon, macOS 26.5.2 build 25F84.
- Rust/Cargo 1.93.1, Go 1.26.5, Apple clang 21.0.0.
- No valid Developer ID signing identity was installed. The prototype used non-hardened ad-hoc
  signatures only to run the bounded local boot comparison.
- The external-initramfs negative result establishes failure for this exact construction; it is not
  a universal statement about initramfs support in other kernels or libkrun profiles.
- Writable `/tmp`/scratch cross-job behavior belongs to the separate storage track and must be
  rerun on the final composed profile.
- The raw harness report and generated binaries/disks remain ignored and disposable. Selected
  hashes, observations, scripts, patch, and compact evidence are tracked.
- Product packages do not import this experiment.

## Retained artifacts

- [governed patch probe](patches/0002-direct-block-root-bootstrap-probe.patch)
- [source/import audit](audit-nullfs-alternate-source.sh)
- [direct-root fixture builder](prepare-nullfs-alternate-disk.sh)
- [external-initramfs runner probe](src/alternate_bootstrap_runner.c)
- [pinned-kernel extractor](src/extract_krunfw_kernel.c)
- [compact prototype summary](evidence/nullfs-p0-2-disposition/prototype-summary.json)
- [bootstrap dependency trace](evidence/nullfs-p0-2-disposition/bootstrap-trace.txt)
- [verification record](evidence/nullfs-p0-2-disposition/verification.txt)

## Final disposition

Select **`GOVERNED-PATCH`**. Carry the direct-block-root design forward as a narrow reviewed patch
and keep the current unpatched block-root profile unsupported. Do not connect user bytes until the
governed final bytes close P0-1, P0-2, P0-3, and P0-4 together. If that branch fails, pivot to the
complete acceptance campaign or reject libkrun for this profile; do not silently retain `NullFs`.
