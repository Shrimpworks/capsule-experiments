# Governed `deno_core` runtime-root research handoff

Date: 2026-08-03

Parent/orchestrator task: `019fc2de-552d-77a0-aa47-35ac39d02edc`

## Question, defensive scope, and method

Defensively validate a self-contained Linux/arm64 root for the exact PR #50 governed `deno_core`
candidate using only Capsule fixtures, exact official pinned artifacts, controlled local processes,
and owned network-disabled Linux/arm64 containers. No unrelated system, identity, credential, data,
arbitrary workload, backend, guest, signing service, or deployment was accessed.

Two clean containers extracted immutable Debian snapshot packages into different host paths,
verified a closed entry manifest, and emitted normalized root tar/gzip bytes. A scratch image ran
the fixed fixture with an empty image configuration, packaged loader, exact library path, no loader
cache, read-only root, network none, all capabilities dropped, no-new-privileges, and fixed
argv/cwd/FDs. Exact strace evidence and deliberate mutations tested route closure.

## Three distinct statuses

1. **Intended engineering direction:** governed `deno_core` is the first runtime candidate after
   the hard Bun pivot; Node is not reopened here.
2. **Current evidence:** **STANDALONE DYNAMIC ROOT PASS; NO RUNTIME ADMISSION**. PR #50's unbundled
   Bookworm-root blocker is closed for the exact candidate and fixture.
3. **Admission:** no runtime/profile/backend is selected or admitted; `RUNTIME-001` remains
   unsupported and must refuse.

## Exact identities and result

- Binary: 68,497,544 bytes, `597baba6...6f5`.
- Snapshot: 699,980 bytes, `ef5f1e78...fa0b`.
- Patch queue: `f45fda69...bac37`, then `9dd33fd4...061e`; restoration mutation
  `e0e98557...ee40`.
- Runtime packages: `libc6 2.36-9+deb12u14` arm64 (`01f43307...b1cf4`) and
  `libgcc-s1 12.2.0-14+deb12u1` arm64 (`576926b2...eacf3`); `gcc-12-base` supplies the exact
  retained notice (`674cf6cb...b5440`).
- Closed root: 22 entries/cap 22; 71,871,122 regular-file bytes.
- Root tar: 71,895,040 bytes, `d1f600b4...6d925`.
- Root gzip: 22,192,043 bytes, `b0e17261...79283`.
- Reproducibility: complete A/B equality across two clean same-host containers at distinct paths.
- File-open result: no ambient Bookworm config/library/locale/timezone/NSS/package/cache use; only
  declared root bytes plus explicit procfs/cgroupfs/urandom kernel inputs.
- Mutation result: all missing/substituted/mutated/version/digest/mode/owner/extra/relocation/env and
  exact-cap/cap-plus-one cases rejected as intended.
- Startup: 20 fresh scratch-container samples, p50 125.631 ms; same-host warm-cache support only.

## Candidate comparison

Exact dynamic packaging was selected. Static/alternative linking stopped as broad and
identity-changing: it would require a new V8/archive/ABI/provenance campaign and static glibc or
musl review. It is not needed to close this exact blocker.

## Required real-fork boundary

The candidate should continue, so source governance must move from bounded experiment patches to a
real hosted fork of `https://github.com/denoland/deno`, tag `v2.9.4`, commit
`14eea3160ae5834476aa3b9d317b8d41d991b982`. Proposed branch/release shape:

- branch: `capsule/deno-core-0.409.0-governed`;
- ordered patches: exact physical omission then snapshot ordering patches above;
- release tag: a versioned Capsule suffix such as `capsule-deno-core-v0.409.0-1`;
- required CI: clean Linux/arm64 reproduction, physical/final-link/restoration corpus, root closure,
  SBOM/source/notices, provenance, and signed review state;
- operations: named advisory owner, upstream tracking, rebase/removal policy, reviewed patch
  changes, immutable releases, and emergency-disable/update inputs.

Destination owner/repository name is ambiguous, so no external fork was created. The parent should
obtain the user's exact destination before that separately authorized action. A shippable runtime
must pin the hosted fork commit/archive, not these experiment patches or a copied registry tree.

## Retained files, verification, and limits

- Decision/method: `RESULTS.md`, `README.md`, `CONSTRUCTION_COMPARISON.md`.
- Root/package manifests: `manifests/`.
- Supply-chain mapping: `SOURCE_AND_LICENSE.md`, `evidence/2026-08-03/sbom.cdx.json`.
- Exact observations: `evidence/2026-08-03/`.
- Reproduction/mutations: `scripts/`.

Focused root/build/mutation/trace checks passed. Full repository verification is recorded in the
PR handoff. Limitations remain independent builder, V8 publication closure, fork/release ownership,
production TypeScript, installed custody/signing, external isolation, and complete profile
admission. Confidence is high for the bounded same-host dynamic-root result and deliberately does
not extend beyond it.
