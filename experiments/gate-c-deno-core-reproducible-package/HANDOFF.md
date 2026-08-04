# Governed `deno_core` package research handoff

Date: 2026-08-02

Parent/orchestrator task: `019fc2de-552d-77a0-aa47-35ac39d02edc`

## Question and defensive scope

Defensively validate reconstructible packaging/provenance for the governed `deno_core`
physical-omission candidate using only this repository, the exact retained upstream inputs, fixed
benign Capsule fixtures, controlled local builders, and the owned isolated Linux/arm64 development
environment. No unrelated system, identity, credential, data, arbitrary workload, backend, guest,
signing service, or deployment was accessed.

## Decision

**BYTE-REPRODUCTION PASS; RUNTIME-SELECTION EVIDENCE NO-GO.**

The prior builder ambiguity is closed for the bounded build: a digest-pinned official Rust base,
no `apt`, a complete 191-crate source bundle, and network-disabled clean builds reproduce the
original binary and snapshot exactly. The evidence is not strong enough for a runtime-selection
ADR because it is same-host only, V8 source/license/notice closure is incomplete, and the archive
depends on an exact unbundled dynamic runtime root. `RUNTIME-001` remains unsupported.

## Exact method and outputs

- Baseline: `54489437f75465f6ed7b9ef4477bc5557bf5b923`.
- Builder: `rust:1.95.0-bookworm@sha256:6258907a...d4a1`; no added layer/package manager.
- Sources: Deno v2.9.4 `95f9d836...e6dc94`; `deno_core` 0.409.0
  `16b44f6f...778b4`; `rusty_v8` 150.2.0 `8d91df74...20595`; 191-crate
  bundle `912ee37b...4df58c`.
- Patches: `f45fda69...bac37`, then `9dd33fd4...061e`; restoration mutation
  `e0e98557...ee40`.
- Build level: two independent clean containers on one Docker Desktop/LinuxKit host, fixed internal
  paths, ASLR disabled for compiler descendants, locked/offline single-job Cargo.
- Binary: 68,497,544 bytes, `597baba6...6f5`.
- Snapshot: 699,980 bytes, `ef5f1e78...fa0b`.
- Normalized two-file archive: 20,983,063 bytes, `da8f7558...f498`.
- Complete declared bundle file and archive bytes: equal A/B.
- Runtime/final-link/restoration checks: pass; exactly three built-in op symbols.
- SBOM: CycloneDX 1.6, 195 components; complete 193-package lock graph.
- Cargo source/license inventory: 191 sources and license expressions; 179 root
  license/copying/notice file sets hashed.

## Retained evidence and files

- Decision: `experiments/gate-c-deno-core-reproducible-package/RESULTS.md`.
- Reproduction: `builder/Dockerfile`, `cargo-config.toml`, and `scripts/` in that directory.
- Bundle manifest: `evidence/2026-08-02/runtime-bundle-manifest.json`.
- SBOM and source inventory: `sbom.cdx.json` and `source-bundle-inventory.json`.
- License/publication inventory: `SOURCE_AND_LICENSE.md` and `license-and-source.json`.
- Provenance/reproducibility: `provenance.intoto.json` and `reproducibility.json`.
- Patch/advisory ownership: `PATCH_GOVERNANCE.md` and `OPERATIONS.md`.
- Machine decision: `admission-checklist.json`.
- Selected raw observations: `physical-and-elf-proof.txt`, `performance.txt`, and
  `verification.txt`.

Large crate/vendor/binary/archive outputs remain disposable under `/private/tmp` and are not
product imports or Git artifacts. The exact scripts reconstruct and verify them.

## Verification

Focused retained checks:

- exact input and source-bundle hashes;
- two fresh network-disabled builds and complete package-byte equality;
- expected binary/snapshot/archive identities;
- runtime registry/metadata, fixed fixtures, prohibited-power, descriptor, syscall, and restored
  `op_print` checks;
- final-link three-symbol allowlist;
- ELF dynamic dependency inventory;
- CycloneDX/source/license/provenance/checklist structural and referential-integrity checks;
- shell/Node syntax and `git diff --check`.

Full repository verification is recorded in `evidence/2026-08-02/verification.txt`.

## Limitations and next decision

No second independent builder/host was available. No broad normalization was performed. No complete
archive-corresponding V8 notices/source set, standalone runtime root, TypeScript approved-byte
pipeline, external-isolation composition, signing/notarization, guest/backend run, or runtime-profile
admission was produced.

The next runtime-selection research must close those exact blockers and then create a new ADR. It
must not treat this handoff as activation authority or weaken the prohibited-power contract.
