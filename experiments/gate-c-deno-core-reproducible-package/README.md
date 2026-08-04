# Governed `deno_core` reproducible-package experiment

Status: **BYTE-REPRODUCTION PASS; RUNTIME-SELECTION EVIDENCE NO-GO** on 2026-08-02.

This development-only experiment defensively tests whether the exact governed `deno_core` 0.409.0
physical-omission candidate can be reconstructed from independently declared inputs into a bounded,
reviewable Linux/arm64 bundle. It is confined to this repository, the exact upstream identities
retained by the merged physical-omission experiment, fixed benign Capsule fixtures, controlled
local builders, and the owned Docker Desktop Linux/arm64 environment. It does not authorize any
other workload, system, identity, credential, guest, backend, signing service, or deployment.

Two clean, network-disabled containers built the candidate from the same digest-pinned official
Rust base and the exact 191-crate offline source bundle. Every declared package byte matched, and
the result reproduced the prior snapshot and binary identities. This is same-host clean-container
reproducibility, not independent-builder provenance.

The result is not sufficient for a runtime-selection ADR. The `v8` crate excludes `LICENSE*`, no
complete source/third-party-notice manifest corresponding to the prebuilt `rusty_v8` archive is
retained, and the two-file bundle depends on an exact dynamic Bookworm runtime root that it does
not contain. TypeScript and external-isolation composition also remain outside this experiment.
No runtime/profile/backend is admitted, `RUNTIME-001` remains unsupported, and execution requiring
it must refuse.

## Layout

- `builder/Dockerfile`: digest-pinned, zero-apt builder declaration.
- `cargo-config.toml`: offline vendored-source mapping at the exact reviewed internal path.
- `scripts/acquire-cargo-source-bundle.sh`: separate checksum-pinned Cargo source acquisition and
  normalized source-bundle construction.
- `scripts/build-twice.sh`: two clean offline source reconstructions, builds, complete package-byte
  comparison, expected hash checks, and final-link proof.
- `generate-evidence.mjs`: deterministic SBOM, source/license, manifest, provenance, reproducibility,
  and checklist generation from the exact lock/source/output set.
- `SOURCE_AND_LICENSE.md`, `PATCH_GOVERNANCE.md`, and `OPERATIONS.md`: publication blocker and
  ownership records.
- `RESULTS.md` and `HANDOFF.md`: decision and integration handoff.
- `evidence/2026-08-02/`: bounded machine-readable and selected textual evidence. Large source and
  binary bundles remain ignored/disposable.

## Exact reproduction

Acquire the complete Cargo source bundle in a new directory. This is the only network-capable
phase; Cargo accepts only `Cargo.lock` versions and checksums, and the script verifies the final
normalized bundle identity:

```sh
experiment=./experiments/gate-c-deno-core-reproducible-package

"$experiment/scripts/acquire-cargo-source-bundle.sh" \
  /path/to/deno_core-0.409.0.crate \
  /tmp/capsule-deno-cargo-source
```

Build twice from pre-fetched exact inputs. Both retained builds have no network, a read-only root,
all capabilities dropped, no-new-privileges, fixed internal paths, fixed locale/time inputs,
ASLR-disabled compiler descendants, locked/offline Cargo, and one compiler job:

```sh
"$experiment/scripts/build-twice.sh" \
  /path/to/deno_core-0.409.0.crate \
  /path/to/deno-v2.9.4-src.tar.gz \
  /path/to/librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz \
  /tmp/capsule-deno-cargo-source/cargo-source-bundle.tar.gz \
  /tmp/capsule-deno-build-a \
  /tmp/capsule-deno-build-b
```

Generate and verify evidence:

```sh
node "$experiment/generate-evidence.mjs" \
  /tmp/capsule-deno-build-a \
  /tmp/capsule-deno-build-b \
  /tmp/capsule-deno-cargo-source/vendor \
  "$experiment/evidence/2026-08-02"

"$experiment/verify.sh"
```

The source-acquisition output is an input to retained builds, not an implicit network fallback.
Changing any source, patch, feature, builder, path, environment, fixture, or output identity requires
a new reviewed experiment record.
