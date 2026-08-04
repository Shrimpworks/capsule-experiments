# Gate C P0-0 governed Bun runtime-authority closure result

Date: 2026-08-02

Decision: **NO-GO for the governed Bun construction branch.** The toolchain follow-up removed the
environmental blocker, but exact source review found that the minimum honest construction closure
requires at least 40 hand-authored files and 10 generated outputs. That triggers the explicit
broad/unreviewable fail-fast rule before a candidate patch or governed build. Capsule must preserve
the v0 contract, investigate an alternate runtime, and reconsider or supersede ADR-0003. No runtime
or backend bytes are admitted.

## Governed-construction fail-fast result

The post-toolchain experiment is retained in
[`CONSTRUCTION_REVIEW.md`](CONSTRUCTION_REVIEW.md). Its read-only inventory expands the prior
21-file lower bound to 40 hand-authored files plus 10 mandatory generated outputs; changes to the
duplicated process/native binding tables likely add two further generated LUTs. The surface crosses
profile propagation, generated registries, duplicate aliases, ESM/CommonJS/native loader dispatch,
`Bun` and `process` globals, Worker construction, addon/N-API/plugin and SQLite-extension sinks,
inspector, macro/preload/configuration discovery, and package resolution/install.

A narrow TSYNC seccomp self-seal appears conditionally feasible for process-shaped `clone` and
post-start `exec`, at the seam immediately before `vm.loadEntryPoint()`. It does not solve the
construction failure: lazy Bun/JSC threads require some `clone`, Worker is indistinguishable from
required threads at that layer, and no generic `dlopen` syscall filter can be assumed compatible
with JSC JIT and runtime-owned libraries. Exact release tracing would be required if that mechanism
were pursued under another bounded construction, but it cannot make this patch small.

The task required stopping at the first fail-fast condition. Consequently no Bun source patch,
governed binary, governed runtime/JIT run, syscall/descriptor trace, or restoration mutation was
started. The candidate diff is empty, with SHA-256
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. The prior stock release
binary and builder identities below remain prerequisite evidence only.

## Question and defensive boundary

Question: can the narrowest construction-level governed Bun 1.3.14 profile plus exact external
launcher/kernel enforcement preserve ADR-0003's dependency-free Bun first slice while making
subprocess/execve, FFI/native loading, inspector, Worker, macro/preload/config/environment-file,
and package-install/dynamic-resolution authority structurally unavailable?

This was authorized defensive, local-only research against Capsule's repository fixtures and the
retained exact Bun checkout. No user or third-party workload was run, no unrelated system was
accessed, and the prior stock Docker evidence was not treated as a security boundary.

## Exact retained inputs

| Input | Exact observation |
| --- | --- |
| Capsule task base | `22aa6d7f48019fb537c751b5495e6ee9d3a4e955` |
| Bun source | tag `bun-v1.3.14`, commit `0d9b296af33f2b851fcbf4df3e9ec89751734ba4`; clean retained checkout at `/private/tmp/capsule-gate-c-p0-0-bun-src-network` |
| Stock Linux runtime evidence | Bun SHA-256 `37141662ebed915a2ab89313156e455e2a1374395f5f6760d06407f49406f086` in the retained Linux/arm64 image |
| Local host | Apple M1 Max class arm64 host, macOS 26.5.2 build 25F84, Darwin 25.5.0 |
| Local bootstrap Bun | `1.3.14+0d9b296af`; macOS binary SHA-256 differs from the retained Linux runtime, as expected |

The exact read-only input check and output are retained in `check-inputs.sh` and
`evidence/2026-08-02/input-check.txt`.

## User-authorized toolchain follow-up

The follow-up deliberately installed nothing on the macOS host. It built a development image from
the retained stock Bun image digest, verified LLVM/Clang/LLD 21.1.8, installed the source-pinned
`nightly-2025-12-10` Rust toolchain with `rust-src`, and compiled the exact clean source at four-way
parallelism. The successful stock-equivalent release result was:

| Item | Result |
| --- | --- |
| Builder image ID | `sha256:47b2d086f6f131b2ed4a30e43dc409bd87c5dd4cc15900bc8888819e237c86e5` |
| Binary | version `1.3.14`, revision `1.3.14-canary.1+0d9b296af`, 94,907,656 bytes |
| Binary SHA-256 | `c06708363d3903ee3e2fd11622ca14175784acaf4006b5d372bbb5588b31d52b` |
| Owned fixture | returned `42` during the build and again with Docker `--network none` |
| Source state | exact commit and tag; no tracked source patch |

[`TOOLCHAIN.md`](TOOLCHAIN.md) records the container recipe, installer hashes, resolved packages,
resource requirements, caches, limitations, and the full future native macOS inventory. Compact
retained results are in `evidence/2026-08-02/container-release-baseline.txt` and
`evidence/2026-08-02/container-debug-breakage.txt`; raw logs and binaries remain in ignored `.runs/`.

## Fail-fast trigger

Bun's pinned `CONTRIBUTING.md` requires an existing Bun release, CMake, Ninja, LLVM 21.1.8, and the
documented platform dependency set; the build scripts also initialize Zig and dependencies. The
retained checkout had no `build`, `node_modules`, or `vendor/zig` tree. The host had a bootstrap Bun,
Go, Rust/Cargo, Ruby, GNU libtool, and `pkg-config`, but lacked `cmake`, `ninja`, `clang-21`,
`automake`, `ccache`, and GNU sed executables in `PATH`. The available Apple clang reported 21.0.0,
not the pinned LLVM 21.1.8 toolchain named by Bun's build instructions. Network-dependent toolchain
bootstrap was outside the available local inputs for this fail-fast campaign.

The original task required an immediate NO-GO when the local source/build inputs were unavailable. No
governed source patch was authored after that trigger, no Bun build was attempted, and no mutated
binary was represented as evidence in that campaign. The later user-authorized toolchain follow-up
is separately identified above and does not rewrite that historical decision.

## Construction map and candidate mechanism

[`SOURCE_MAP.md`](SOURCE_MAP.md) records the pinned registry, process/native-loader,
module-resolution, inspector, Worker, configuration, and syscall entry routes. The smallest honest
candidate was not an API blacklist:

1. make a mandatory Capsule build profile omit every prohibited global, native module, compatibility
   module, loader, Worker, macro, discovery, and package-resolution route;
2. initialize indispensable JSC/Bun runtime state, then install a mandatory fail-closed Linux
   process/exec seal immediately before registered source evaluation; and
3. combine that with fixed empty environment/cwd/argv, an empty/no-exec workload staging design,
   and exact launcher/child descriptor manifests.

A purely external launcher filter is insufficient at the required timing: it must permit the first
`execve` that starts Bun but deny later replacement-image execution. A stateful seccomp broker would
add a new complex boundary. A runtime self-seal is narrower, but its `clone`/`clone3` and lazy-thread
compatibility can be determined only from the exact built runtime. Native loading has no generic
syscall filter compatible by assumption with Bun/JSC JIT behavior, so it additionally depends on
complete construction-level loader removal.

## Required measurements and mutations

| Required item | Result |
| --- | --- |
| Authored patch size | `0` lines; no patch was authored after the fail-fast trigger |
| Lower-bound maintenance surface | 40 hand-authored source files plus 10 mandatory generated outputs; two further generated LUTs are conditional; see `CONSTRUCTION_REVIEW.md` and `SOURCE_MAP.md` |
| Build and final binary digest | Unmodified release baseline produced: `c06708363d3903ee3e2fd11622ca14175784acaf4006b5d372bbb5588b31d52b`; no governed binary exists |
| JIT/runtime breakage | Both Nix LLVM 21.1.1 and exact LLVM 21.1.8 debug builds aborted on the owned fixture at JSC `FreeListInlines.h(63)`; exact-LLVM release passed |
| Descriptor inheritance | Not rerun; retained stock evidence still shows main VM and Worker reading inherited FD 3, so a closed exact manifest remains mandatory |
| Primitive restoration mutations | Not run; subprocess, execve, FFI, addon/plugin, SQLite loader, inspector, Worker, macro, preload/config/env, and package-resolution mutations require a built governed runtime |
| Structural closure argument | Not established. The source map identifies the required construction boundaries, but absence cannot be claimed without a governed diff, exact build, syscall trace, and restoration mutations |

## Decision and next action

`RUNTIME-001` remains unsupported and execution requiring it must refuse. The next fail-fast review
found that the minimum honest Bun construction spans at least 40 hand-authored files and 10
generated outputs. The governed Bun patch is therefore rejected as broad and unreviewable; it was
not authored or built.

The required next experiment is alternate-runtime investigation under the same authority contract,
followed by an ADR that supersedes ADR-0003's Bun-first implementation choice. The parent
orchestrator must not interpret stock buildability or the narrow process/exec self-seal seam as
authority to weaken the profile or admit current Bun/libkrun bytes.

## Limitations

- The original campaign did not install dependencies or compile Bun; the separately authorized
  follow-up downloaded container-only build inputs and compiled only exact retained source.
- The successful build is not hermetic: installer scripts are hash-pinned, but Debian and apt
  repositories are not snapshot-pinned. Exact resolved versions and the local image ID are retained.
- The debug profile aborts during JavaScript evaluation in both tested toolchains. Only the
  stock-equivalent release profile is a passing baseline.
- No governed source patch, authority probe suite, syscall trace, descriptor rerun, or restoration
  mutation was performed because the earlier reviewability fail-fast condition terminated them.
- The expanded 40-hand-authored plus 10-generated-output surface is a conservative lower bound, not
  proof that a safe patch can never exist.
- The syscall-seal analysis is a construction constraint, not validated seccomp/LSM evidence.
- The result decides this governed-Bun campaign under the explicit fail-fast rule; it does not
  select or validate the alternate runtime.

## Verification

Focused evidence checks passed:

```sh
sh -n experiments/gate-c-bun-runtime-authority/governed-closure/review-construction-surface.sh
sh -n experiments/gate-c-bun-runtime-authority/governed-closure/check-inputs.sh
sh -n experiments/gate-c-bun-runtime-authority/governed-closure/container/run-baseline.sh
sh -n experiments/gate-c-bun-runtime-authority/governed-closure/container/run-baseline-llvm.sh
shellcheck experiments/gate-c-bun-runtime-authority/governed-closure/review-construction-surface.sh \
  experiments/gate-c-bun-runtime-authority/governed-closure/check-inputs.sh \
  experiments/gate-c-bun-runtime-authority/governed-closure/container/run-baseline.sh \
  experiments/gate-c-bun-runtime-authority/governed-closure/container/run-baseline-llvm.sh \
  experiments/gate-c-bun-runtime-authority/governed-closure/container/toolchain-bin/clang \
  experiments/gate-c-bun-runtime-authority/governed-closure/container/toolchain-bin/clang++
./experiments/gate-c-bun-runtime-authority/source-inventory.sh \
  /private/tmp/capsule-gate-c-p0-0-bun-src-network
./experiments/gate-c-bun-runtime-authority/governed-closure/check-inputs.sh \
  /private/tmp/capsule-gate-c-p0-0-bun-src-network
diff -u \
  experiments/gate-c-bun-runtime-authority/governed-closure/evidence/2026-08-02/construction-review.txt \
  <(experiments/gate-c-bun-runtime-authority/governed-closure/review-construction-surface.sh \
    /private/tmp/capsule-gate-c-p0-0-bun-src-network)
git diff --check
```

Repository-required verification passed with Node 22.22.1, pnpm 10.28.2, and Go 1.26.5:

```sh
pnpm install
pnpm check
pnpm lint
pnpm test
pnpm verify:schemas
pnpm format:check
go test ./...
go vet ./...
go build ./...
```

The ambient shell still selects Node 16, so repository checks must run through the installed
Node 22.22.1 environment. The original fail-fast NO-GO remains part of the historical record; the
separately authorized container follow-up has now removed its missing-build-input blocker.
