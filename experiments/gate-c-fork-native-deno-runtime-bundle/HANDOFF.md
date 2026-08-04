# Fork-native governed runtime-bundle handoff

Date: 2026-08-04

Parent task: `019fc2de-552d-77a0-aa47-35ac39d02edc`

## Result

**PASSED — EXACT CLEAN CONSTRUCTION ONLY.** Runtime selection/admission remains
**IN_PROGRESS / UNSUPPORTED**.

The exact merged `Shrimpworks/deno` head `9adb0b68…1bed` and `Shrimpworks/rusty_v8` head
`80e863dd…b15` constructed the clean unsigned Linux/arm64 runtime bundle using connected
digest-only prefetch followed by network-disabled build/test/evidence collection. No fork or
product package contains imported experiment code. No guest, release, signature, deployment,
backend, arbitrary workload, unrelated system, identity, or credential was used.

## Subjects

- `rusty_v8` archive gzip: `1ae209c9e4ba5803d010d2c79ee4cc0af0126c5a7ebcca211c7e41deaede4cd2`
  (byte-equal to comparison-only workflow run 30925045754).
- Deno binary: `56d3acefd2cc2f5136a0b8143c47131e49a58fbf66382dfd3e84f715ce8e2898`.
- Snapshot: `4e8965217d5a6675a880326eee6f690bbeec7e7cb243decf2f3e9f453a871a2c`.
- Two-file Deno bundle: `0cc08f93e82fcfe68b033e8807975a3bd67068a817da811a87a73aedc3f23937`.
- 22-entry root manifest: `100832dbb37737f29341bc5404df6d4405b8d6b706f274028892801fa88e7de8`.
- Root tar: `9c46b45c4d220aedcc47c9ee53e875bc71d31d0b881b51740aaa9b882b5741e6`.
- Root gzip: `e847651b35cd425dd8f6fe3bd45d693aff0af244e3a7bd30c629fa125cac62e8`.

The old binary `597baba6…6f5`, snapshot `ef5f1e78…fa0b`, and root `b0e17261…79283` are
superseded comparison answers. The root difference is closed to the binary and snapshot entries;
the remaining 20 entries are exact.

## Retained evidence

- Canonical decision: `RESULTS.md`.
- Exact input/output contract: `manifests/input-contract.json`.
- Canonical result and subject manifest: `evidence/2026-08-04/result.json` and
  `runtime-bundle-manifest.json`.
- Ref, environment, comparison, root-entry, descriptor, file-open, source/license, SBOM, unsigned
  provenance, and artifact checksum evidence: `evidence/2026-08-04/`.
- Full successful and failed logs are retained there, including V8 Docker ENOSPC recovery, Deno
  lock-closure failures, four-CPU snapshot variance, the post-build harness resume, and root tests.
- Direct repeatable contracts: `builder/` and `scripts/`.

Verification checks exact refs/trees/merge ancestry and fork-local verifiers, all JSON closure,
Cargo count/license closure, three final-link symbols, fixed/sealed/module/syscall/restoration
results, file-open and descriptor closure, 14 root mutations, A/B artifact equality, V8 oracle and
build-metadata attribution, caps, source/SBOM/provenance closure, and admission refusal.

## Operational facts

The deterministic Deno snapshot profile requires one visible logical CPU pinned to CPU set 0 in
addition to `setarch aarch64 -R`, `SOURCE_DATE_EPOCH=0`, fixed `/workspace` paths, offline Cargo,
and the exact builder image. Four visible logical CPUs produced a retained two-byte snapshot
payload variance on this host and must remain fail-closed; do not normalize those bytes.

Docker Desktop ENOSPC recovery removed only verified disposable task-owned GN object
intermediates after the completed archive matched its oracle. The exact fixed test, QEMU run,
collector, and release verifier resumed network-disabled. No unrelated Docker data was pruned.

## Next composed-profile boundary

The smallest next task is not another runtime build. It is a separately authorized external-
isolation composition using these exact unsigned subjects, followed by independent-builder/host
reproduction and an explicit selection/admission review. Do not invoke a guest from this handoff,
publish or sign these artifacts, or change `RUNTIME-001` before that review.
