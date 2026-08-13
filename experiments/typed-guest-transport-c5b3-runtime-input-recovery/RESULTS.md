# Results

## Decision

`PASSED` for exact bounded recovery and reproducibility planning.

`BLOCKED` for exact-byte recovery/reconstruction, a complete C5b executable successor, controlled
execution, runtime/profile admission, and product admission.

## Bounded negative result

None of the following exact files is retained in either repository history, any Capsule-named
temporary workspace searched, or the authorized `llrt` repository:

| Role | Required bytes | Required SHA-256 | Result |
| --- | ---: | --- | --- |
| governed fixed-fixture `deno_core` executable | 68,496,520 | `e781a90236cdf1272a9a16189c6be033164fa25a5aa9e52376ef998982ec0a77` | absent |
| `libkrunfw.5.dylib` boot-kernel carrier | 24,339,104 | `0b14f4b8005dafd33c38df5935b9efdb6381c724224b3967ba1cecbecf10b6e9` | absent |
| extracted Linux 6.12.91 arm64 kernel | 24,117,248 | `b50a4165215d5d897ab3614606a2105756cf8f2b2510cbceda9dc06057a5622d` | absent; derived evidence only |

The repository histories were also checked by Git blob size, so the result is not merely a
working-tree search. This does not claim absence from unrelated paths, backups, expired remote
artifacts, or systems outside the authorized boundary.

## Recovered exact `rusty_v8` input

The parent orchestrator restored valid Keychain-backed GitHub authentication and recovered
`Shrimpworks/rusty_v8` Actions run `30925045754`, artifact `8902402057`, before its 2026-09-03
expiry. Every downloaded file matches the artifact checksum manifest, release manifest, and
unsigned provenance subjects.

The retained 37,674,703-byte archive is SHA-256 `1ae209c9...4cd2`; the retained 40,369-byte binding
is `8603f09a...ba4`. Both are byte-equal to the earlier independently reconstructed local outputs.
Read-only inspection identifies the compressed input as a 1,877-member ar archive; its `/` and
`//` entries are GNU ar metadata, and no actual member uses an absolute or parent-traversal name.

The 202,703,184-byte corresponding-source archive is internally hash-consistent and contains only
`cargo-registry/` and `rusty_v8/` top-level roots. It contains no Deno/probe root or top-level
`Cargo.lock`, so it does not close the Deno fixed-fixture source or 189-package Cargo closure. The
large duplicate source/evidence archives were not added to Git; their exact identities and archive
inspection are retained in the recovery receipt.

## Reproducibility closure

The governed runtime recipe remains precise:

- Deno fixed-fixture commit `29b71f06c2df5ab06721ccbb7bc744fb8104356e`, tree
  `172e57551fe5a6683f11c886a81f9634023a5514`;
- exact source archive `7073152...4cf3`, Cargo lock `4dd8f08c...389d`, and 189-package vendored
  source bundle `1e96e49a...d1d4`;
- governed `rusty_v8` commit `80e863dd...2bb15`, exact 37,674,703-byte archive
  `1ae209c9...4cd2`, and binding `8603f09a...ba4`;
- pinned builder `rust:1.95.0-bookworm@sha256:6258907a...d4a1`, one logical CPU,
  `SOURCE_DATE_EPOCH=0`, connected acquisition followed by network-none empty-target builds;
- two historical same-host builds produced byte-equal runtime, snapshot, bundle, source archive,
  Cargo lock, and Cargo source closure.

The `libkrunfw` recipe is also named:

- wrapper commit `ec4b297964877d83432f9ccda6dad8ff6e9de3e4`;
- v5.5.0 release archive `5bfae6ef...9979`, source archive `ef7207eb...fd0`, Linux 6.12.91
  source archive `0ff2ab9e...7969`, and exact generated `kernel.c` input `96561a4e...70d`;
- macOS 26.5.2 build 25F84 arm64, Rust 1.93.1, Apple clang 21.0.0,
  `MACOSX_DEPLOYMENT_TARGET=14.0`, path-remapped offline build, and kernel extraction through the
  retained narrow helper.

These are reproducibility instructions and historical evidence, not substitute bytes.

## Immediate blockers

1. The local Docker daemon is stopped. No pinned image inventory could be read, and this task did
   not start Docker or pull an image.
2. The Deno source archive/Cargo source bundle and the libkrunfw/kernel acquisition inputs are
   absent locally. The recovered `rusty_v8` corresponding source is a different closure and cannot
   substitute for them.
   Re-acquisition is a separately auditable connected phase and was not attempted without valid
   source inputs and a running pinned builder environment.
3. The original macOS toolchain was Rust 1.93.1, while the current machine/toolchain and exact
   cached inputs have not been requalified for byte equality.

The shortest honest construction input is therefore: make the pinned Docker image available;
independently acquire and hash every named Deno and libkrunfw source input; then run two
fresh empty-state builds and require byte equality to every frozen identity. Any mismatch creates
a versioned successor candidate and must not be labeled recovery of the old bytes.

## Effects and limitations

No recovered artifact was loaded or executed. The orchestrator used authorized GitHub access only
to download the named expiring artifact; no credential content was read or retained. No
libkrun/HVF call, process, VM, guest, signing operation, product state, or admission state
participated. The initial local search does not prove that an owner backup exists or does not exist.
