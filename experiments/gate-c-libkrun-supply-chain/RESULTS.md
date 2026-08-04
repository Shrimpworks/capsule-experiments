# Gate C libkrun/HVF supply-chain spike results

Date: 2026-07-31

Decision: **conditional pass for the feasibility/design track; no-go for admitting the currently
observed runtime bytes into a development validation record.**

The controlled build shows that reproducible unsigned libkrun/libkrunfw dylibs are feasible after
an explicit macOS 14 deployment target and Rust path remapping. The retained default build is not
reproducible across source directories, its rebuilt runner and firmware declare macOS 26.0, the
current package is only ad-hoc signed, notarization was not submitted, exact corresponding source
is incomplete, and operational disable/update workflows are designs rather than implementations.
This result does not change Capsule's development posture or claim production readiness.

## Hypothesis and threat

Hypothesis: exact libkrun/HVF runtime bytes can be derived from pinned, reviewable inputs and
packaged with sufficient identity, source publication, vulnerability response, rollback, and
disable evidence to support a future development-only `BackendValidationRecord`.

Threats include dependency/source substitution, moving or incomplete build inputs, unreproducible
artifacts, patch drift, unsafe launcher behavior, signature/notarization confusion, license/source
publication failure, stale/vulnerable runtime activation, unsafe rollback, and inability to disable
known-bad bytes offline.

## Environment and pinned inputs

| Item | Observed value |
| --- | --- |
| Host | MacBookPro18,4, Apple M1 Max, arm64 |
| macOS | 26.5.2 (25F84), Darwin 25.5.0 |
| Xcode / Apple clang / ld | Xcode 26.6 (17F113); clang 21.0.0; ld 1267 |
| Rust / Cargo | 1.93.1 (`01f6ddf...` / `083ac513...`) |
| LLVM / LLD | Homebrew 22.1.8 / 22.1.8 |
| Go | 1.26.5 darwin/arm64 |
| Git / make | Apple Git 2.50.1; GNU Make 3.81 |
| notarytool | 1.1.2 (41) |
| libkrun | 1.19.4, commit `728df8125077d0db44265f6e997c72b81b65c015` |
| libkrun Cargo.lock | SHA-256 `9d5dc785636a264794a396ab478821c4ed33acae91650db8d72e8a35733f288c` |
| libkrunfw | 5.5.0, release archive SHA-256 `5bfae6efee63dbdf04a8fac2a69d772d9f900af2f54c4429b4acdfd6d86b9979` |
| libkrunfw kernel bundle input | Linux 6.12.91 `kernel.c`, SHA-256 `96561a4e5dccec0364a28ac32c5668e13e31180d083f412c9f8be7599380c70d` |
| Capsule patch 1 | SHA-256 `a845cce3cd479a73c6a698164dc1b466e8d67796018b107077504478e0ec9cd5` |
| Capsule patch 2 | SHA-256 `b2120d4cc848e138a28165906d6c5cc4da1efee8004e392a7ddddc2334136823` |
| guest launcher source | SHA-256 `b44e02ebd6d6f94c948ca514780caa3e7928a6507b7bacfd255bc8316efa6f34` |

The upstream libkrun README states macOS/ARM64 support and a macOS 14-or-newer build requirement.
The project therefore uses Apple Silicon/macOS 14+ as a **provisional source/platform floor**, not
as a validated exact-package floor. See [libkrun upstream](https://github.com/libkrun/libkrun) and
the [1.19.4 release](https://github.com/libkrun/libkrun/releases/tag/v1.19.4).

## Commands and observed cases

All commands ran from the repository root unless noted.

| Case | Command | Observation | Result |
| --- | --- | --- | --- |
| Pinned rebuild | `./experiments/gate-c-libkrun-hvf/prepare-libkrun.sh` | Existing checkout matched the pinned commit, both patches were already applied, firmware archive/kernel.c digests passed, and libkrun rebuilt with `BLK=1`. | Positive |
| Package rebuild/audit | `./experiments/gate-c-libkrun-hvf/build-runner.sh`; `./experiments/gate-c-libkrun-hvf/audit-build.sh` | Runner/dylibs were rebuilt ad-hoc and strict code-sign verification, patch checks, App Sandbox, and hypervisor entitlement checks passed. | Positive for local build integrity only |
| Default double source build | `./experiments/gate-c-libkrun-supply-chain/run-reproducibility.sh` | Clean build A was `6789832b...23cd`; B was `e8fb9abc...582ec`. Same pinned sources/materials, different source directories. | Negative: retained build is not path-independent |
| Remapped double source build | `CAPSULE_REMAP_PATHS=true ./experiments/gate-c-libkrun-supply-chain/run-reproducibility.sh` | With Cargo offline and `--locked`, both libkrun outputs were `24f14dbc...3372`; both libkrunfw outputs were `0b14f4b8...b6e9`. Both declared minOS 14.0. | Positive controlled feasibility result |
| Ad-hoc signing flow | `./experiments/gate-c-libkrun-supply-chain/test-signing-flow.sh` | Two same-basename, timestamp-free ad-hoc signatures produced identical `24953c40...8e87` bytes; one post-sign byte mutation failed verification. | Positive and negative controls pass |
| Release-signing identity | `security find-identity -v -p codesigning` | Zero valid signing identities were available in this worktree/session. | Expected failure; no Developer ID test |
| Notarization | `xcrun notarytool --version`; no submit command | Tool was present. No submission, credential use, ticket, staple, Gatekeeper, or clean-machine case was performed. | Not tested by design |
| Minimum OS inspection | `otool -l` on rebuilt runner/dylibs | Runner minOS 26.0; packaged libkrun 11.0; packaged libkrunfw 26.0. | Negative for a macOS 14 package claim |
| Dependency inventory | `fnm exec --using=22.22.1 -- node ./experiments/gate-c-libkrun-supply-chain/generate-sbom-input.mjs` using locked/offline Cargo metadata for `aarch64-apple-darwin` plus `libkrun/blk` | 115 components: 113 Cargo workspace/build inputs, of which 83 are in libkrun's final runtime closure, plus libkrunfw and Linux. Every entry has a declared license expression or hashed license-file reference. | Conditional: input inventory, not release SBOM |

The default-build divergence is an observation. Absolute source paths were the inferred cause; the
path-remapped match supports that inference but does not prove there are no other unstable inputs.
The matching control also reused one local sysroot and toolchain, so it is not an independent
two-builder or clean-room reproducibility claim.

## Source reproducibility versus signed-byte identity

These are separate records:

1. **Source/build provenance** binds source archives/commits, patches, lockfiles, feature selection,
   sysroot packages, toolchain/SDK, build environment, reproducibility controls, and unsigned output
   digest. A double build can test this relation.
2. **Runtime manifest identity** binds every final distributed byte after install-name mutation,
   nested signing, bundle sealing, Developer ID timestamping, notarization/stapling, and packaging.
   The Supervisor admits these final digests/code requirements, not a prediction from source.

Timestamped Developer ID signatures and notarization are release-service outputs. Their final bytes
must be hashed and manifested after signing; reproducibility is evaluated on the unsigned/pre-sign
subjects. The prior Gate C record observed Developer-ID-signed byte hashes, but this independent
track had no valid signing identity and did not repeat or submit that flow.

## Dependency and build-input findings

- Cargo.lock pins registry crate versions/checksums, but the upstream Makefile invokes `cargo build`
  without `--locked`; a governed builder must enforce locked/offline vendored resolution.
- The selected `blk` runtime closure contains 83 Cargo components. Because the retained Makefile
  builds the virtual-workspace defaults, the builder closure expands to 113 Cargo components; the
  115-component CycloneDX file adds libkrunfw and Linux and marks build-only inputs separately. It
  is a machine-readable starting input, not a complete release SBOM.
- The macOS libkrun Makefile creates a Debian sysroot from a moving package index and unpinned
  package URLs. The retained source tree had a sysroot marker but no manifest binding every package
  archive/digest. That blocks full material completeness.
- libkrunfw's prebuilt archive and `kernel.c` are digest pinned. The current script does not retain
  the complete libkrunfw source, Linux 6.12.91 source archive digest, config, and patch set needed to
  recreate and publish the exact embedded kernel.
- Xcode SDK, Apple linker, Rust, Homebrew LLVM/LLD, deployment target, locale/time, build paths, and
  install-name/signing order affect bytes and must be builder-image inputs.
- The default libkrun artifact contains `/opt/homebrew/opt/llvm/lib` as `LC_RPATH`; release review
  must remove or justify every load path and bind all runtime dependencies.

## Patch, launcher, and upstream decision

The full review is in [PATCH_REVIEW.md](PATCH_REVIEW.md).

- The firmware `@rpath` change worked for the exact bundle but was still absent from upstream main
  when inspected. It is plausibly upstreamable as an explicit-path or documented relocatable
  packaging mechanism; the current global behavior change should remain a governed patch.
- The block-root defect is upstreamable, but the retained exact-string implementation is a narrow
  Capsule profile fix. Upstream should parse and reject generic mount flags robustly.
- The launcher passes the prior smoke probe, but independent environment construction, descriptor
  closure, complete capability policy, executable identity, seccomp, and shutdown behavior remain
  open. It is not admitted product runtime code.

Until both fixes land in an upstream release and the exact profile is revalidated, use a governed
fork rather than an informal patch directory. Each patch needs an owner, upstream issue/PR, target
commit, digest, tests, rebase record, and removal condition.

## Support floor

Observed upstream/source floor: Apple Silicon (`arm64`) and macOS 14+. Observed execution host:
Apple M1 Max on macOS 26.5.2. A controlled build with `MACOSX_DEPLOYMENT_TARGET=14.0` produced both
dylibs with minOS 14.0, demonstrating build feasibility. The current retained package omitted that
setting for C/firmware compilation, so runner and libkrunfw declare 26.0.

Therefore:

- source/platform planning floor: **Apple Silicon, macOS 14+ (provisional)**;
- exact bytes tested in Gate C: **only the recorded host/configuration**;
- validation floor claim: **not confirmed** until the complete signed/notarized bundle builds with
  minOS 14 and passes on a clean macOS 14 Apple Silicon host, plus representative newer hosts.

Intel Macs remain unsupported by this backend and require a separately selected/validated backend.

## Licensing and publication

Upstream libkrunfw documents the embedded Linux kernel and its patch directory as GPL-2.0-only and
the library/generated code as LGPL-2.1-only, and says binary distribution must be accompanied by the
kernel and library source. See the [libkrunfw 5.5.0 release](https://github.com/libkrun/libkrunfw/releases/tag/v5.5.0)
and [upstream license/distribution notes](https://github.com/libkrun/libkrunfw).

[LICENSE_AND_SOURCE.md](LICENSE_AND_SOURCE.md) inventories the engineering actions and exact-source
publication set. It is not legal advice. The signed app's effect on practical LGPL modification and
relinking requires counsel review; dynamic linking alone is not treated as a completed analysis.

## Advisory, update, rollback, and disable design

[OPERATIONS.md](OPERATIONS.md) assigns operational owners/cadence and defines advisory intake,
governed patching, two-builder release, exact-source publication, TUF-backed activation, crash-safe
trust-epoch update, explicit non-revoked rollback, and runtime disable/revocation. These workflows
preserve deny-by-default behavior: the updater performs network trust processing; the Supervisor
consumes a bounded local snapshot; known disable wins offline; the daemon cannot clear state; and
indeterminate teardown blocks ordinary success/artifact release.

This is design evidence only. No updater, TUF role, trust transition, revocation object, exercise,
or operational service level was implemented or validated here.

## Admission decision

The machine-readable checklist is [evidence/admission-checklist.json](evidence/admission-checklist.json).
An exact runtime may enter a **development** validation record only when every required item is
`pass` with immutable evidence:

- final byte inventory and signatures/notarization/readback;
- complete immutable source/material pins and exact-source publication;
- independently reviewed/upstreamed or governed patches and hardened launcher;
- reproducible unsigned outputs on two independent builders;
- complete SBOM, signed provenance, licenses/notices, and vulnerability results;
- supported floor proven by Mach-O metadata and clean-host execution;
- operational update/rollback/disable mechanisms exercised;
- exact final bundle/configuration passes all required backend corpus rows.

Current checklist: **no-go**. The supply-chain feasibility track itself is a **conditional pass**
because it demonstrated a reproducible-build control, produced machine-readable design inputs, and
identified bounded closure conditions. Passing those conditions would allow later consideration of
one development profile only; it would not imply `validated-local` or production posture.

## Retained evidence, limitations, and residual risk

Retained: scripts, both patch/launcher reviews, CycloneDX input, incomplete in-toto/SLSA-shaped
provenance input, exact-byte manifest input, admission checklist, license/source notes, and
operational workflows. Large build outputs remain ignored/disposable.

Limitations and residual risks include compromised upstream/build/signing keys, SHA-1 Git object
identity without an independently pinned source archive, incomplete sysroot/kernel materials,
unknown dependency or hypervisor/VMM vulnerabilities, no independent builders, no notarization or
clean-floor-host test, no exercised emergency disable, no legal conclusion, and all remaining Gate
C isolation/recovery corpus gaps. A valid signature or matching rebuild does not establish secure
logic or production readiness.
