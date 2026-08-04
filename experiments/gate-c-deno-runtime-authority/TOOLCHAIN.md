# Exact toolchain and upstream inputs

Retrieved: 2026-08-02. Version selection came from current official release metadata, not memory.
Only official Deno/denoland sources, generated crate metadata/docs, and exact upstream build records
were used as external technical authorities.

## Full Deno

- Stable release: `v2.9.4`, released 2026-07-23.
- Tag commit: `14eea3160ae5834476aa3b9d317b8d41d991b982`.
- Linux/arm64 release ZIP:
  `https://github.com/denoland/deno/releases/download/v2.9.4/deno-aarch64-unknown-linux-gnu.zip`
  - size: 41,975,714 bytes
  - SHA-256: `111da5c05c240cfdc4340f234a0e3539d39dbcb6755221f19dcd60bacc8be5aa`
- Unpacked `deno`:
  - size: 94,279,496 bytes
  - SHA-256: `7d87b8a5225485ddea1786024f875b2b3422c31100ba11cb2e36b6125959e218`
- Source archive:
  `https://github.com/denoland/deno/releases/download/v2.9.4/deno_src.tar.gz`
  - size: 34,010,635 bytes
  - SHA-256: `95f9d8361809f2d2f3ee2d8a6955951dcf96c2f4bbeb540c2d6fdd9363e6dc94`
  - expanded observation: 152,300 KiB, 17,257 files
- Source pins: Rust 1.95.0; `deno_core` 0.409.0; `v8` 150.2.0; TypeScript 6.0.3;
  `deno_ast` 0.53.3.
- Official release workflow:
  `https://github.com/denoland/deno/blob/v2.9.4/.github/workflows/ci.ts`
- Exact successful build run: `https://github.com/denoland/deno/actions/runs/30017930234`
- Linux ARM job: `https://github.com/denoland/deno/actions/runs/30017930234/job/89242790085`
- Source build instructions:
  `https://github.com/denoland/deno/blob/v2.9.4/.github/CONTRIBUTING.md`
- License: Deno top-level MIT. The binary ZIP did not contain a complete transitive SBOM/notices
  inventory; supply-chain admission remains incomplete.

The official Linux ARM workflow used an `ubuntu-24.04-arm64-xl` runner, LLVM 22, a configured
sysroot and release orchestration. The observed job took about 34 minutes. This experiment retained
the official binary identity rather than claiming a byte-reproducible local full-Deno builder.

## `deno_core` and V8

- `deno_core` 0.409.0 crates.io checksum:
  `16b44f6f84139c39ec2f8d1b838412eb84ecaa9837103f7b12169896fd8778b4`.
- Source commit: Deno tag commit above.
- License: MIT.
- Published crate size: approximately 510,610 bytes.
- Selected source-tree `libs/core`: 126 files and 68,711 Rust/JavaScript LOC.
- `v8` 150.2.0 crates.io checksum:
  `c7f4e905df70d6c00b95e69c5f0831fd5eb5889b0116ae2b30293578c19cd1bc`.
- `rusty_v8` tag commit: `d305e6afa7736f6e298c30ae6646f7709ee9382b`.
- Official Linux/arm64 V8 archive:
  `https://github.com/denoland/rusty_v8/releases/download/v150.2.0/librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz`
  - size: 37,576,362 bytes
  - independently observed SHA-256:
    `8d91df74c8a671c23f880e64038023f49e07ca85c96e15d76a87e2aac9b20595`
- Compatible `deno_ast` 0.53.3 checksum:
  `6f7c1384d87fc0a6439a065312fbef8f6ac6128689dbc2831b28b3a1d4f3a4e6`;
  source commit `8bd7154d96b6dcb7120ad9ed38595e22411f3fd1`; MIT.
- The retained `default-features = false, features = ["transpiling"]` marker resolves 180 locked
  packages including the marker itself (179 dependencies) under Cargo 1.93.1. This is a package-
  count surface measurement, not a source audit or transformer implementation.

The `rusty_v8` build script identifies its archive by URL/cache name rather than a declared content
hash. Capsule independently hashed the archive and passed it through `RUSTY_V8_ARCHIVE`. The crate
metadata reports a dirty source state and excludes vendored `LICENSE*` files, so the complete V8
third-party notice inventory is missing and no admission claim is possible.

## Local environment

- Host: macOS 26.5.2 (25F84), Darwin 25.5.0, Apple M1 Max.
- Docker client/server: 29.6.1.
- Base image: `rust:1.95.0-bookworm` at repository digest
  `sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1`;
  local image ID `sha256:7cf1e580ef5539f03b58560753e8ab84c8c360960d99dff714004aa98f203977`.
- Measurement image local ID:
  `sha256:b8483b5baafc8f085feb4a48ef34993b182de50d86ed03fd13b98b166e7a0ad6`.
  It adds Debian `strace` 6.1-0.1 and GNU `time` 1.9-0.2 from live indices.
- Locked prototype graph: 193 packages.
- Final Linux/arm64 prototype build: Rust 1.95.0, `cargo build --locked --offline --release`, local
  hashed V8 archive; binary size 68,427,440 bytes, SHA-256
  `da1e5ec5bc56c6856b3972ebbf65bf4c6f62c8fef58cbd8d8ae9bfb1725a6d0d`.

The initial Cargo graph population required network retrieval. The final build was offline. Neither
that build nor the measurement image is a two-builder, clean-host, byte-reproducible release proof.
