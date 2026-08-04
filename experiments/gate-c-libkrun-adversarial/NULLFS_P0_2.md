# Gate C P0-2 `NullFs` investigation

Date: 2026-08-02

Status: **minimal removal falsified; exact block-root profile remains unsupported for P0-2**.
This is a development-only source and boot investigation. It is not installed-profile evidence, a
`BackendValidationRecord`, a posture promotion, or evidence that the residual surface is safe.

## Question and bounded decision

Does the pinned libkrun build introduce `NullFs` unconditionally, which build/configuration routes
control it, and can the smallest change remove it while preserving the retained block-root boot?

The answer is route-specific:

- `NullFs` is not instantiated merely because libkrun is built or loaded.
- The exact retained runner always calls `krun_set_root_disk_remount`; every successful call in the
  pinned source adds one `FsDeviceConfig` with `shared_dir: None`. The worker consequently selects
  `Server<AugmentFs<NullFs>>`. `NullFs` is therefore unconditional for this block-root route.
- No dedicated Cargo or Make feature disables virtiofs. `BLK=1` exposes the block-root helper;
  default `init-blob` supplies the virtual `init.krun` entry but does not control device creation.
- Deleting only the internal `FsDeviceConfig` built successfully but prevented the kernel from
  mounting its bootstrap root. A different bootstrap design is required to remove the device.

P0-2 remains blocked. This experiment does not prove that all removal designs are impossible. It
falsifies the smallest removal and leaves two explicit branches: implement and validate another
bootstrap mechanism, or accept and validate the exact residual surface described below.

## Exact source and configuration observations

The inspected source was libkrun commit
`728df8125077d0db44265f6e997c72b81b65c015`, with the two retained Gate C patches for firmware
resolution and block-root mount flags. Neither retained patch introduces `NullFs`.

| Route or feature | Observed behavior in the pinned source/build |
| --- | --- |
| `make BLK=1` | Adds Cargo feature `blk`; default Cargo feature `init-blob` remains enabled. |
| Virtiofs compilation | The fs module and host-directory APIs have no independent `virtiofs` feature gate. |
| `krun_set_root_disk_remount` | Compiled with `blk` and without `tee`/`aws-nitro`; after checking a block device, always adds `/dev/root` with `shared_dir: None`, a 512 MiB shared-memory window, and virtual bootstrap entries. |
| `init-blob` | Controls insertion of `init.krun`; it does not control creation of the fs device. |
| `krun_disable_implicit_init` | Suppresses the implicit `init.krun` entry only; it does not remove the block-root fs device. |
| `krun_set_root` | Independent host-backed virtiofs root route using `shared_dir: Some(path)`. |
| `krun_add_virtiofs*` | Independent exported device routes; `krun_add_virtiofs4` with a null path directly selects `NullFs`. |
| Retained runner imports | Imports `krun_set_root_disk_remount`; imports none of `krun_set_root` or `krun_add_virtiofs*`. |
| `krun_has_feature` | Reports block/init-blob state but defines no virtiofs feature identifier. |

The dylib still exports all host-directory configuration APIs. Their absence from the retained
runner's imports is narrow route-closure evidence only. Exact installed admission must also prove a
closed typed runner surface, hardened runtime without `get-task-allow`, failed attach/injection
attempts, exact code identity, and no alternate dynamically loaded caller.

## Minimal falsifiable removal test

The retained probe patch removes only the `FsDeviceConfig` construction from
`krun_set_root_disk_remount` and preserves `ctx_cfg.set_block_root(...)`. It is intentionally not a
candidate production patch: [patches/0001-remove-nullfs-block-root-probe.patch](patches/0001-remove-nullfs-block-root-probe.patch).

The test passed only if the same valid root booted, emitted inventory/completion evidence, mounted
`/dev/vda` read-only, and exposed no virtiofs device or mount.

### Observed control

The unmodified pinned route completed inventory with status zero, mounted `/dev/vda` as ext4 with
`ro,nosuid,nodev`, and exposed `virtio3:DRIVER=virtiofs` with modalias
`virtio:d0000001A`. See
[baseline-inventory.txt](evidence/nullfs-p0-2/baseline-inventory.txt).

### Observed mutation

The probe source built successfully with the same `BLK=1` and default `init-blob` feature set. The
runner printed its ready line, produced no stdout or completion marker, and the guest kernel
panicked with `VFS: Unable to mount root fs on "" or unknown-block(0,0)`. See
[minimal-removal.txt](evidence/nullfs-p0-2/minimal-removal.txt).

The host runner returned zero after the kernel panic. That is additional confirmation that runner
status is not guest completion evidence; it is not a successful removal result.

### Inference

The exact helper couples bootstrap to the dummy virtiofs root: the kernel starts with
`init=/init.krun`, and the overlay supplies that file and the pre-pivot mount points before the
built-in init mounts `/dev/vda`. A removal design must deliver a trusted bootstrap through another
mechanism, such as a separately reviewed initramfs/initrd path, and must rerun every affected
runtime, device, lifecycle, custody, supply-chain, and installed-profile gate. This investigation
does not select that mechanism.

## Exact residual guest-reachable surface

With the current block-root route, `shared_dir: None` prevents construction of the macOS
passthrough backend and selects the `Null` server enum variant. No host directory was configured or
observed mounted. The residual is nevertheless much larger than the 50-line `NullFs` leaf:

1. libkrun configuration, `VmResources`, shared-memory allocation, and VMM attachment;
2. virtio-mmio transport, feature negotiation, one high-priority queue, one request queue, queue
   notification, descriptor-chain readers/writers, used-ring updates, interrupts, reset, and worker
   thread shutdown;
3. the complete generic FUSE request decoder/dispatcher and response encoder, including all known
   opcodes, header/length handling, names, variable-sized values, mapping requests, and errors;
4. `AugmentFs`, its shared inode allocator and lock-protected virtual-entry maps, the one-shot
   `init.krun` file, and virtual `dev`, `proc`, `sys`, and `newroot` directories; and
5. the `NullFs` leaf, whose explicit operations are init, root getattr, and negative lookup while
   other operations inherit generic trait behavior.

The directly involved fs subtree excluding host passthrough, read-only passthrough, multikey, and
platform utility files is 5,730 source lines in this checkout. It also depends on the generic
descriptor, queue, and MMIO implementations (3,184 additional lines) and VMM builder/configuration
code. Line counts are scope indicators, not risk scores or evidence of reachability by themselves.

The host-backed macOS passthrough implementation is not instantiated on the observed `None` branch.
However, the generic server still parses every guest FUSE opcode before `NullFs` or `AugmentFs`
returns data or an error. On macOS the configured shared-memory region also makes setup/remove
mapping opcodes parser-reachable; virtual-file DAX currently returns `ENOSYS`, but the decode,
bounds, dispatch, concurrency, and error paths remain guest-facing.

## Existing coverage and exact gaps

Observed local checks:

- the current 36-case adversarial rerun again observed the device and valid completion; its three
  additional identity failures are expected from the explicitly non-hardened ad-hoc signing used
  because the host had no valid Developer ID identity. It is not installed-profile identity
  evidence. The selected summary is
  [adversarial-summary.json](evidence/nullfs-p0-2/adversarial-summary.json);
- `cargo test -p krun-devices --features blk --lib`: 47/47 passed;
- `cargo test -p libkrun --features blk --lib` with the pinned Linux cross-compiler configuration:
  1/1 passed;
- experiment `go test ./...`: passed;
- the 10,000-profile deterministic corpus accepted only the exact profile; and
- the five-second Go profile-validator fuzz run passed 1,676,130 executions.

The compact command/result record is
[verification.txt](evidence/nullfs-p0-2/verification.txt).
The read-only [source-route audit](audit-nullfs-source.sh) retains a bounded regression check for
the pinned commit, build features, block-root/direct-null/host-backed source routes, `NullFs`
selection, and optional runner imports. It does not exercise the guest parser or advance posture.

Those results do not fuzz `NullFs`, FUSE, virtqueues, or the VMM. The pinned tree contains no
virtiofs/`NullFs` fuzz target. Its fs-specific unit tests cover multikey and read-only helpers, not
the `NullFs` leaf, `AugmentFs` bootstrap overlay, generic FUSE server, fs worker, or malformed
guest descriptor/queue path. No ASan, UBSan, TSan, leak-sanitizer, coverage map, retained malformed
FUSE corpus, or crash triage was produced. Therefore the acceptance branch has not started.

## Required acceptance corpus if removal is deferred

Any decision to accept the residual surface must pin the final source, features, compiler,
firmware/kernel, runner, entitlements, and installed bytes and retain all seeds, minimized crashes,
fixes, coverage artifacts, and limitations. At minimum it must include:

- **Route closure:** mutation tests that restore `krun_set_root`, each `krun_add_virtiofs*` route,
  null-path `NullFs`, host paths, duplicate tags, and alternate dynamically loaded callers; exact
  binary imports/exports, FD manifest, attach denial, and device inventory must fail closed.
- **Virtio transport and queues:** missing/extra queues; zero, boundary, and oversized queue sizes;
  invalid GPAs; read/write descriptor inversion; indirect, cyclic, overlapping, truncated, and
  overlong chains; avail/used index wrap; notification/event-index races; reset during work;
  duplicate events; HPQ/request cross-ordering; and malformed shared-memory negotiation.
- **FUSE framing and opcodes:** short/oversized/inconsistent headers; unknown opcodes; every opcode
  with truncated, extra, and extreme fixed fields; absent/interior NUL names; integer overflow;
  count/length disagreement; xattr/readdir/batch-forget/removemapping amplification; mapping-range
  overflow; ioctl sizes; trailing data; response-buffer exhaustion; and malformed multi-descriptor
  inputs.
- **Overlay and `NullFs`:** root and non-root inode extremes; unknown handles; every inherited
  mutating/read operation; one-shot init lookup/open/read/release races; repeated forget and batch
  forget; virtual-directory traversal; concurrent lookup/release/reset; DAX attempts; and proof
  that no request reaches host passthrough or an unauthorized mapping action.
- **Concurrency and resources:** parallel HPQ/request floods; stalled or dead consumers; worker
  stop/reset/cancellation during every opcode; guest crash and VMM termination; allocation and CPU
  amplification at cap-plus-one; long-run descriptor/thread/memory leakage; and exact forced
  teardown after parser or worker failure.
- **Sanitizers and coverage:** a structure-aware in-process FUSE/server target plus end-to-end
  hostile-guest queue target under applicable ASan/UBSan and leak checks, TSan for overlay/worker
  concurrency where supported, coverage-guided fuzzing with branch/function reports, and a
  separately retained no-sanitizer exact-HVF corpus. Sanitizer/toolchain limitations must be
  explicit rather than treated as passes.

Acceptance requires zero unresolved high-severity findings after independent review and describes
the surface as accepted with residual limitations, never absent, safe, or proven bug-free.

## Environment and limitations

- Host: Apple silicon, macOS 26.5.2 build 25F84.
- Rust 1.93.1, Cargo 1.93.1, Go 1.26.5, Apple clang 21.0.0.
- No valid code-signing identity was installed. Hardened ad-hoc binaries failed macOS library
  validation before HVF execution. The boot comparison therefore used non-hardened ad-hoc signing
  for both control and mutation. This is sufficient only for the narrow bootstrap comparison.
- The root fixture contains generated public Alpine/experiment bytes only. No user content or
  product package imported or executed this spike.
- The raw rerun directory remains ignored and disposable; selected observed output and digests are
  tracked under `evidence/nullfs-p0-2/`.

## Decision

`GATE-C-ADV-NULLFS-001` survives. The smallest removal is rejected because it prevents bootstrap.
The exact current block-root profile remains unsupported for P0-2 and must not handle user bytes.
Next work must either prototype an alternate bootstrap with a closed device list or build the
sanitizer/coverage corpus above before proposing formal acceptance of the residual surface.
