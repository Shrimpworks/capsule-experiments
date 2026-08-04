# Gate C P0-0 Bun source-build toolchain

This is development-only setup for defensively testing Capsule's exact retained Bun 1.3.14 source.
It is not an isolation boundary, an admitted runtime, or permission to run user-provided code. The
baseline harness runs only `container/baseline.ts`; large build products remain under ignored
`.runs/` paths.

## Recommended first setup: exact-LLVM Linux/arm64 container

Use `container/run-baseline-llvm.sh`. It leaves the host toolchain untouched, starts from the exact
retained stock Bun image, verifies Bun's required LLVM 21.1.8, installs the repository-pinned Rust
nightly, builds the stock release profile, then reruns Capsule's owned fixture with Docker networking
disabled.

| Input | Exact value used on 2026-08-02 |
| --- | --- |
| Platform | Linux/arm64 on an Apple Silicon Docker host |
| Base image | `docker.io/oven/bun@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04` |
| Stock Bun bootstrap | `1.3.14+0d9b296af` |
| Builder image ID | `sha256:47b2d086f6f131b2ed4a30e43dc409bd87c5dd4cc15900bc8888819e237c86e5` |
| Builder image size | 3,286,299,955 bytes |
| Bun source | tag `bun-v1.3.14`, commit `0d9b296af33f2b851fcbf4df3e9ec89751734ba4` |
| apt.llvm.org installer | SHA-256 `9474ecd78b52aba6e923976b1e9773f5613027cc7e237b9956986cb536e02a36` |
| LLVM package | `21.1.8`, Debian package revision `1:21.1.8~++20251221033036+2078da43e25a-1~exp1~20251221153213.50` |
| rustup installer | SHA-256 `6c30b75a75b28a96fd913a037c8581b580080b6ee9b8169a3c0feb1af7fe8caf` |
| Rust toolchain | `nightly-2025-12-10`; `rustc 1.94.0-nightly (c61a3a44d 2025-12-09)` |
| Build profile | `release` |
| Default parallelism | 4 jobs |

Host requirements are Docker Desktop or Docker Engine capable of Linux/arm64 containers, Git, at
least 12 GiB memory assigned to Docker, and at least 40 GiB free disk for conservative headroom.
The successful retained run occupied about 7.26 GB and the builder image about 3.29 GB. Peak Zig
resident memory was about 6 GB; four build jobs fit inside the 11.67 GiB Docker limit.

Fetch the base deliberately and run:

```sh
docker pull docker.io/oven/bun@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04
CAPSULE_ALLOW_BUILD_NETWORK=1 CAPSULE_BUILD_JOBS=4 CAPSULE_BUILD_PROFILE=release \
  ./experiments/gate-c-bun-runtime-authority/governed-closure/container/run-baseline-llvm.sh \
  /private/tmp/capsule-gate-c-p0-0-bun-src-network
```

Network access is explicit because the image build obtains Debian and apt.llvm.org packages, the
pinned Rust toolchain, and the source build's pinned Zig, WebKit, npm, Cargo, and native dependency
inputs. The final fixture rerun uses `--network none` and read-only source/build mounts. This proves
the built binary can run the owned fixture without network access; it does not make the build
hermetic or the runtime safe.

The installer scripts and major tool versions are pinned, but Debian and apt package repositories
are not snapshot-pinned. The retained local image ID anchors this run only. A future rebuild must
read back every version, reject LLVM other than 21.1.8, and produce a new evidence identity; exact
long-term reproduction would additionally require a governed package snapshot or retained OCI
image outside Git.

The current Debian base's apt signature policy rejected the older apt.llvm.org signing-key binding.
The development Dockerfile extends that key-binding acceptance date inside this builder only; it
does not disable apt signature verification. This policy exception, the live repositories, and the
moving package set are unacceptable for a production supply chain and must remain explicit in any
future evidence review.

## Exact resolved container tools

| Tool | Resolved version |
| --- | --- |
| Clang/LLVM/LLD | 21.1.8 |
| CMake | 3.31.6 |
| Ninja | 1.12.1 |
| ccache | 4.11.2 |
| GCC/build-essential | GCC 14.2.0 / build-essential 12.12 |
| Go | 1.24.4 |
| rustup | 1.29.0 (`28d1352db`, 2026-03-05) |
| Rust | 1.94.0-nightly (`c61a3a44d`, 2025-12-09) |
| Cargo | 1.94.0-nightly (`2c283a9a5`, 2025-12-04) |
| Ruby | 3.3.8 |
| Python | 3.13.5 |
| Perl | 5.40.1 |
| GNU libtool | 2.5.4 |
| pkg-config | 1.8.1 |

The Rust install includes `rust-src` and the source-declared
`aarch64-linux-android`, `x86_64-linux-android`, and `x86_64-unknown-freebsd` targets in addition to
the native `aarch64-unknown-linux-gnu` target. Release builds require nightly Rust because Bun builds
`lolhtml` with `-Zbuild-std`; distro stable Rust correctly refuses that option.

## Retained outputs and cache lifecycle

Raw logs and the 94,907,656-byte binary are retained under
`governed-closure/.runs/20260802T192812Z-63683/`. The successful release binary is not committed:

```text
version  1.3.14
revision 1.3.14-canary.1+0d9b296af
sha256   c06708363d3903ee3e2fd11622ca14175784acaf4006b5d372bbb5588b31d52b
```

The harness keeps task-scoped caches and supports resuming an exact-commit run:

```sh
docker volume inspect capsule-gate-c-p0-0-bun-build-cache-v1
docker volume inspect capsule-gate-c-p0-0-compiler-cache-v1

CAPSULE_ALLOW_BUILD_NETWORK=1 CAPSULE_BUILD_PROFILE=release \
  CAPSULE_RESUME_RUN_ID=20260802T192812Z-63683 \
  ./experiments/gate-c-bun-runtime-authority/governed-closure/container/run-baseline-llvm.sh \
  /private/tmp/capsule-gate-c-p0-0-bun-src-network
```

Cache removal is destructive and deliberately manual:

```sh
docker volume rm capsule-gate-c-p0-0-bun-build-cache-v1
docker volume rm capsule-gate-c-p0-0-compiler-cache-v1
```

## Nix diagnostic path: not the accepted baseline

`container/run-baseline.sh` retains the initial attempt using Bun's `flake.lock` and the official Nix
image digest `sha256:377d4887aca98f0dfa12971c1ea6d6a625a435d8b610d4c95a436843da6fbfd1`.
It is useful for tool discovery but is not the accepted runtime baseline:

- the lock resolves LLVM 21.1.1, while Bun documents 21.1.8 as necessary to avoid runtime allocator
  failures;
- Nix LLVM lacks zstd debug-section support, requiring the retained development-only compiler
  wrapper;
- the flake's Bun 1.2.23 bootstrap left a code-generation event loop alive, so Node 24 had to drive
  the build; and
- its resulting debug binary built but failed Capsule's trivial fixture with a JavaScriptCore
  `FreeListInlines.h(63)` assertion.

The exact-LLVM debug build hit the same assertion, so that failure is not attributed solely to Nix.
The stock-equivalent release profile is the accepted construction baseline. Debug/JIT breakage must
remain visible and be reassessed for any governed patch that depends on debug-only instrumentation.

## Future native macOS installation

Use Apple Silicon for architecture parity. Bun's pinned guide calls for approximately 10 GiB just
for the repository and build artifacts; allow at least 25 GiB locally for dependencies, caches, and
multiple profiles. The complete host prerequisites are:

- macOS with an Apple Silicon CPU and a macOS 13.0-or-newer SDK;
- current Xcode Command Line Tools, which supply the SDK, Git, Make, system Clang, and other base
  utilities (`xcode-select --install` when absent);
- Homebrew;
- a release Bun bootstrap, preferably the exact stock `1.3.14+0d9b296af` binary used by the
  container baseline;
- the Homebrew packages below; and
- rustup with the source-declared nightly, `rust-src`, and cross-targets.

Install Bun's documented Homebrew packages, deliberately substituting rustup for the guide's
stable `rust` formula because this exact source requires nightly Rust:

```sh
brew install automake ccache cmake coreutils gnu-sed go icu4c libiconv libtool ninja pkg-config ruby
brew install llvm@21
```

Rust must be managed by rustup, not only a stable Homebrew compiler, because the retained
`rust-toolchain.toml` selects `nightly-2025-12-10` plus `rust-src` and three cross-targets. Install
rustup using its official installer under a newly recorded SHA-256, then from the source checkout:

```sh
rustup toolchain install nightly-2025-12-10 --profile minimal \
  --component rust-src \
  --target x86_64-unknown-freebsd \
  --target aarch64-linux-android \
  --target x86_64-linux-android
```

For this host audit, Go, `icu4c@78`, GNU libtool, LLVM 22, and `pkgconf` were already installed. The
missing or unsuitable pieces were `automake`, `ccache`, `cmake`, `coreutils`, `gnu-sed`, `libiconv`,
`ninja`, rustup/nightly Rust, and LLVM 21. Apple clang 21.0.0 and Homebrew LLVM 22.1.8 are not
substitutes for LLVM 21.1.8. Recheck formula availability and resolved versions at install time.

Put the keg-only LLVM and GNU tools first only in the build shell:

```sh
export PATH="$(brew --prefix llvm@21)/bin:$(brew --prefix coreutils)/libexec/gnubin:$(brew --prefix gnu-sed)/libexec/gnubin:$PATH"
export CC="$(brew --prefix llvm@21)/bin/clang"
export CXX="$(brew --prefix llvm@21)/bin/clang++"
export LDFLAGS="-L$(brew --prefix llvm@21)/lib"
export CPPFLAGS="-I$(brew --prefix llvm@21)/include"
```

Record every input before building:

```sh
sw_vers
xcode-select -p
xcrun --sdk macosx --show-sdk-version
brew --version
bun --revision
clang --version
llvm-config --version
cmake --version
ninja --version
ccache --version
go version
rustup show active-toolchain
rustc --version
cargo --version
ruby --version
python3 --version
perl -e 'print "$^V\n"'
```

Also retain `brew list --versions` for all named formulae and the SHA-256 and provenance of the Bun
bootstrap and rustup installer. Do not treat a moving Homebrew formula name as an exact pin: verify
that `llvm-config --version` is exactly `21.1.8` before compiling, or stop and obtain that release
from a governed bottle/archive or LLVM's official release.

Use an isolated clean checkout at the exact tag. Establish release parity first:

```sh
bun scripts/build.ts --profile=release -j4
build/release/bun --version
build/release/bun --revision
shasum -a 256 build/release/bun
```

Native macOS builds help source iteration but cannot replace Linux syscall, descriptor, seccomp,
dynamic-loader, or Linux/arm64 oracle evidence.

## What baseline success does and does not decide

The prior missing-toolchain blocker was removed, permitting the next fail-fast source review. That
review rejected the governed Bun branch before patching because the minimum honest construction
surface is broad and unreviewable; see [CONSTRUCTION_REVIEW.md](CONSTRUCTION_REVIEW.md). The stock
baseline does not establish that subprocess, executable replacement, native loading, inspector,
Worker, configuration injection, or dynamic resolution are absent. It remains prerequisite
buildability evidence only. No runtime or backend bytes are admitted by this setup.
