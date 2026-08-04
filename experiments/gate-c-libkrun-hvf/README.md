# Gate C: libkrun with Apple Hypervisor.framework

Status: **development-only spike; conditional pass recorded 2026-07-31**. This experiment is not a
production backend and must not emit authoritative receipts or a `validated-local` posture.

Owner: Capsule core. Remove this code after its mechanisms have either been independently reviewed
and implemented behind the production backend interface or rejected by a later ADR.

## Question

Can an Apple-silicon-only backend use libkrun and Hypervisor.framework to provide a hardware-VM
boundary, exact host lifecycle identity, no network, immutable block storage, non-root guest
execution, hard resource limits, and macOS App Sandbox defense in depth without Apple
Containerization's hidden-helper lifecycle problem?

## Result

**Conditional pass as a serious Apple production-backend candidate.** One signed runner process is
the VMM and the VM lifecycle identity. The retained probe passed immutable-root, network, vsock,
guest-authority, resource, App Sandbox, concurrent cancellation, controller-crash, Bun, and startup
checks. See [RESULTS.md](RESULTS.md) for the evidence and remaining gates.

This does not make libkrun or the profile production-ready. Writable scratch/output, bounded
console capture, sleep/reboot/pressure recovery, installed/notarized packaging, malicious-guest
VMM testing, update/SBOM/source delivery, and the complete shared attack corpus remain open.

## Exact inputs

| Input | Pin |
| --- | --- |
| libkrun | `v1.19.4`, commit `728df8125077d0db44265f6e997c72b81b65c015` |
| libkrunfw | `v5.5.0` prebuilt source asset, SHA-256 `5bfae6efee63dbdf04a8fac2a69d772d9f900af2f54c4429b4acdfd6d86b9979` |
| embedded kernel | Linux `6.12.91` |
| Alpine fixture | `alpine@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce` |
| Bun fixture | `oven/bun@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04`, Bun `1.3.14` |

The libkrun build enables only `BLK=1`; it does not compile the optional `NET` feature. The runner
also calls `krun_disable_implicit_vsock()` and uses only raw block images. No virtiofs host
directory, host socket, or OCI engine endpoint is exposed.

Two retained source patches are required:

1. resolve `libkrunfw.5.dylib` through the signed bundle's `@rpath`;
2. pass Linux `MS_RDONLY | MS_NOSUID | MS_NODEV` for the exact immutable-root option set.

Both must be reviewed or accepted upstream before a production fork is selected.

## Build and run

Prerequisites are Xcode, Rust, Go, Homebrew `lld`, Docker for fixture construction, and a signing
identity. Build source and firmware, then the fixture and signed runner:

```sh
./prepare-libkrun.sh
./build-guest-probe.sh
./prepare-root-disk.sh
CAPSULE_SIGNING_IDENTITY='<Developer ID Application identity>' ./build-runner.sh
./audit-build.sh
```

Run the full guest probe through the trusted launcher:

```sh
./.build/capsule-krun-runner \
  ./.build/alpine-3.22-root.ext4 \
  /usr/local/libexec/capsule-guest-launcher \
  /usr/local/libexec/capsule-guest-probe
```

The sandboxed bundle requires the absolute disk path named by its spike-only read entitlement:

```sh
./.build/CapsuleKrunSpike.app/Contents/MacOS/capsule-krun-runner \
  "$PWD/.build/alpine-3.22-root.ext4" \
  /usr/local/libexec/capsule-guest-launcher \
  /usr/local/libexec/capsule-guest-probe
```

Run the three controller `SIGKILL` checkpoints with:

```sh
./test-controller-crashes.sh
```

Generated source trees, disks, signed products, and run evidence remain under `/private/tmp` or
ignored `.build/` and `.runs/` directories.

## Distribution and trust notes

libkrun is Apache-2.0. libkrunfw's generated library code is LGPL-2.1-only and its embedded Linux
kernel is GPL-2.0-only. The upstream project states that binary distribution of libkrunfw must be
accompanied by the corresponding kernel and library source. Capsule therefore needs a reviewed
third-party-notice/source-offer pipeline and must ship the exact patched source, build scripts, and
kernel source corresponding to every runtime bundle.

The temporary absolute-path App Sandbox exception is evidence, not the product storage design.
Production should place immutable runtime/source disks and bounded writable attempt disks in a
component-owned app container or narrowly scoped app group and test that installed topology.
