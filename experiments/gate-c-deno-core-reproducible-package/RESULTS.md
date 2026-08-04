# Governed `deno_core` reproducible-package result

Date: 2026-08-02

Decision: **BYTE-REPRODUCTION PASS; RUNTIME-SELECTION EVIDENCE NO-GO**

Admission effect: none. No runtime/profile/backend is selected or admitted, ADR-0003 is not
superseded, and `RUNTIME-001` remains unsupported.

## Question and fail-fast result

Can the physical-omission candidate be reconstructed from exact independent input declarations
into a bounded runtime bundle with a reviewable manifest, SBOM/source/license closure, and
reproducibility evidence strong enough to justify a later runtime-selection ADR?

The bounded byte-construction question passes. The stronger selection-evidence question does not.
The experiment stopped its admission conclusion at three exact blockers rather than treating them
as normalizable packaging details:

1. both clean builds ran on the same owned Apple M1 Max Docker Desktop/LinuxKit host and exact OCI
   implementation; no second independently controlled Linux/arm64 builder or host was available;
2. the `v8` 150.2.0 crate intentionally excludes `LICENSE*`, while the official prebuilt archive
   has no retained complete source and generated third-party-notice manifest; and
3. the declared two-file archive is dynamically linked to four subjects from the exact Bookworm
   runtime root and is not a standalone root bundle.

TypeScript approved-byte handling, complete external-isolation composition, signing/notarization,
guest execution, and profile admission were excluded by scope and remain open.

## Exact inputs and builder

The build binds:

- Deno v2.9.4 commit `14eea3160ae5834476aa3b9d317b8d41d991b982` and source archive
  `95f9d836...e6dc94`;
- `deno_core` 0.409.0 crate `16b44f6f...778b4`;
- `v8` 150.2.0 crate `c7f4e905...cd1bc`, `rusty_v8` commit `d305e6afa...9382b`, and
  Linux/arm64 archive `8d91df74...20595`;
- 193 locked Cargo packages: two path packages and 191 registry packages, with a normalized
  70,283,110-byte source bundle `912ee37b...4df58c`;
- the ordered physical-omission patch `f45fda69...bac37`, then snapshot-order patch
  `9dd33fd4...061e`, plus restoration mutation `e0e98557...ee40`;
- the exact wrapper, snapshot builder, Cargo manifest/lock, and eight fixed fixture identities; and
- `rust:1.95.0-bookworm@sha256:6258907a...d4a1`, platform image ID `7cf1e580...3977`,
  Rust/Cargo 1.95.0, LLVM 22.1.2, binutils 2.40-2, GCC 12.2.0-3, and glibc
  2.36-9+deb12u14.

The builder Dockerfile adds nothing to the digest-pinned official image. No `apt`, mutable package
repository, Cargo registry, or network is reachable during either retained build. Source
acquisition is separate, accepts only lockfile checksums, and produces one verified content input.

## Reproduction result

Both clean builds independently extracted the crate and Cargo source bundle, applied the two patches
in fixed order, and built at fixed internal `/workspace`, `/cargo-home`, and `/target` paths with:

```text
SOURCE_DATE_EPOCH=0 TZ=UTC LC_ALL=C LANG=C
CARGO_NET_OFFLINE=true RUSTY_V8_ARCHIVE=/inputs/rusty-v8.a.gz
/usr/bin/setarch aarch64 -R cargo build --locked --offline --release -j1
```

The build-only Docker seccomp exception permits `personality(2)` for `setarch -R`; network remains
absent, the root is read-only, capabilities are dropped, and no-new-privileges remains set.

Complete declared outputs matched:

| Subject | Size | SHA-256 | A/B |
| --- | ---: | --- | --- |
| Binary | 68,497,544 bytes | `597baba6...6f5` | equal |
| Snapshot | 699,980 bytes | `ef5f1e78...fa0b` | equal |
| Normalized two-file archive | 20,983,063 bytes | `da8f7558...f498` | equal |

The binary and snapshot exactly reproduce the prior physical-omission identities. The deterministic
archive contains only the executable at mode `0755` and the separately reviewable embedded-snapshot
copy at mode `0644`; tar ownership, ordering, timestamps, PAX fields, and gzip timestamp are fixed.

## Reviewed nondeterminism

No output byte was rewritten. Three construction inputs were reviewed and fixed before comparison:

- PR #43 found randomized module-sidecar order; patch 0002 sorts the existing vector before
  serialization.
- ASLR perturbs V8 snapshot bytes; `setarch aarch64 -R` governs Cargo and descendants.
- An initial package replay at `/build/workspace` produced equal A/B outputs but different hashes
  (`adf3e5ae...` binary and `37c4b280...` snapshot). Restoring and declaring the original internal
  path identities reproduced the retained bytes. This demonstrates path sensitivity and is why
  those prefixes are manifest inputs.

Any additional unexplained divergence or broad post-build normalization remains a fail-fast case.

## Physical omission and restoration evidence

The rebuilt binary preserves the exact three-op runtime registry and metadata checks. Final-link
inspection reports only:

1. `op_get_ext_import_meta_proto`
2. `op_get_extras_binding_object`
3. `op_set_captured_bootstrap`

The fixed nominal/sealed/import/raw-TypeScript/refused-byte cases, four construction mutations,
four post-seal syscall mutations, inherited-descriptor mutation, and retained restored-`op_print`
binary all failed or passed exactly as expected. The four-op restoration was rejected before the
fixture ran. This preserves the earlier bounded proof; it does not prove absence of every unreachable
helper byte or establish a hostile-code boundary.

## SBOM, source, license, and runtime-root result

The CycloneDX 1.6 document contains 195 components: the complete 193-package Cargo lock graph,
the exact `rusty_v8` archive, and the digest-pinned builder/runtime-root subject. The source inventory
binds all 191 registry crate checksums and publication URLs. All 191 declare a license expression;
179 retain a root license/copying/notice file whose digest is inventoried.

That is not complete publication closure. The `v8` crate excludes its license files and does not
identify the complete source and third-party notice set used for the official prebuilt archive.
The executable also needs `ld-linux-aarch64.so.1`, `libc.so.6`, `libgcc_s.so.1`, and `libm.so.6`
from the exact declared root. The machine SBOM therefore marks its composition incomplete, and the
license inventory marks the selection check blocked rather than claiming closure.

## Supporting measurement

The exact archive is 20,983,063 bytes. Twenty sequential fixed-fixture process starts inside one
already-running digest-pinned container measured 23.675-29.615 ms, with p50 24.776 ms and mean
25.207 ms. This is supporting same-host measurement only; container launch, cold cache, memory,
guest, backend, and production latency are not characterized.

## Decision and next action

The governed candidate is reconstructible to the exact declared bytes on the retained host from a
digest-pinned no-apt builder and complete offline Cargo source bundle. That closes the prior local
builder-image ambiguity for this bounded experiment.

It does not provide evidence strong enough for a runtime-selection ADR. A follow-up may proceed only
after it obtains the exact archive-corresponding `rusty_v8`/V8 source and notice closure, defines the
complete runtime root, and reproduces unsigned subjects on an independently controlled builder/host.
It must then separately resolve TypeScript approved-byte semantics, external-isolation composition,
and the full runtime-profile admission corpus without weakening `RUNTIME-001`.
