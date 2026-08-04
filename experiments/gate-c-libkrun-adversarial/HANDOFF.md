# Gate C adversarial handoff

Date: 2026-07-31

## Bottom line

The recovered corpus is usable for cross-track synthesis and intentionally remains non-green. Its
one failing assertion is the guest-visible `NullFs` virtiofs device. Pinned source evidence narrows
that result to a non-host-backed device (`shared_dir: None`), but it remains additional
guest-to-VMM surface and a literal mismatch with a device-absent profile.

No harness behavior was changed. The source and raw report already classify the evidence
correctly; the genuine defects were incomplete tracked documentation and the missing scoped ignore
for generated evidence. This task completed `RESULTS.md`, added `SELECTED_EVIDENCE.md`, recorded the
finding in `VALIDATION_RECEIPT.md`, added this handoff, linked the reviewed run from the README, and
added an experiment-local `.gitignore` so `.build/` and `.runs/` remain untracked. No shared ADR,
architecture, schema, posture, or evidence-matrix file was updated.

## Decision inventory

| Topic | Decision for integration |
| --- | --- |
| `NullFs` virtiofs device | Unresolved profile finding. Explicitly accept and validate the exact device, or remove it and rerun. Do not call it absent. |
| Host-backed virtiofs | Not configured or observed mounted in this run; this is not a general host-directory isolation guarantee. |
| VMM exit status | Never guest success evidence by itself. Require typed attempt-bound completion plus output/integrity evidence. |
| Malformed disks | Observed no completion marker and no retained runner; preflight rejected them. Several ambiguous runner-zero results remain expected evidence. |
| Configuration APIs | Keep a closed typed runner/Supervisor surface. A zero return from an optional libkrun configuration call is not authorization or capability proof. |
| Exact teardown | Exact runner `SIGKILL` succeeded for the retained case; terminal evidence must still bind the exact recorded identity. |
| Process identity | Require PID + start time + expected path + live code requirement/CDHash. The negative controls defeat weaker tuples. |
| Writable cross-job state | Deferred to the separate storage track; this root-only token write never succeeded. |

## Evidence paths

All paths are relative to `experiments/gate-c-libkrun-adversarial/` unless absolute:

| Purpose | Path |
| --- | --- |
| Reviewed raw report | `.runs/adversarial.RnxjWW/report.json` |
| Raw auxiliary evidence | `.runs/adversarial.RnxjWW/{audit.txt,config-probe.txt,config-probe.txt.runner-imports,config-probe.txt.otool,go-test.txt,hashes.txt}` |
| Raw malformed/runtime fixtures | `.runs/adversarial.RnxjWW/malformed/` |
| Tracked interpretation | `RESULTS.md` |
| Tracked selected-evidence index | `SELECTED_EVIDENCE.md` |
| Tracked validation receipt | `VALIDATION_RECEIPT.md` |
| Harness | `cmd/harness/main.go` |
| Capsule-owned preflight | `internal/preflight/` |
| Pinned source trace | `/private/tmp/capsule-libkrun-v1.19.4/src/libkrun/src/lib.rs:2385-2418` |

The raw report SHA-256 is
`da82be6e14beb7002906d7d507e94cf2c58aff347227b9febfaa64d6df819a6f`. The worktree and original
run copies match. Raw crash output remains inside case `guest.crash` in the report.

## Verification

Experiment-local checks:

```sh
go test ./...
go test ./internal/preflight -run '^TestValidateProfileDeterministicPropertyCorpus$' -count=1 -v
go test ./internal/preflight -run '^$' -fuzz '^FuzzValidateProfile$' -fuzztime=3s
sh -n build.sh prepare-disk.sh run.sh audit-feature-surface.sh
shellcheck build.sh prepare-disk.sh run.sh audit-feature-surface.sh
codesign --verify --strict --verbose=2 .build/capsule-krun-runner
codesign --verify --strict --verbose=2 .build/config-probe
codesign --verify --strict --verbose=2 .build/lib/libkrun.1.19.4.dylib
codesign --verify --strict --verbose=2 .build/lib/libkrunfw.5.dylib
jq empty .runs/adversarial.RnxjWW/report.json
```

Repository checks required by `AGENTS.md`:

```sh
pnpm install
pnpm check
pnpm lint
pnpm test
pnpm verify:schemas
go test ./...
go vet ./...
go build ./...
git diff --check
```

The final observed outcomes are appended below after execution. The adversarial VM corpus itself
was not rerun because the retained corrected report already settles the documentation decision and
a rerun would add no evidence needed to validate the change.

## Claims allowed

- The exact retained development runner exposed a guest-visible virtiofs device backed by
  libkrun `NullFs` with no configured host directory.
- The exact valid case produced its completion marker; multiple invalid/stopped guest cases show
  why VMM status zero is insufficient.
- The retained malformed/runtime fixtures emitted no completion marker and recorded no live runner
  after collection.
- The retained exact `SIGKILL`, repetition/concurrency, runner-import, preflight, and identity
  negative-control observations occurred as described in `RESULTS.md`.
- The current track did not exercise writable cross-job state.

## Claims prohibited

- production-ready, secure, `validated-local`, complete corpus pass, or backend-contract freeze;
- absence of VMM, firmware, kernel, Hypervisor.framework, host-kernel, or other vulnerabilities;
- absence of a virtiofs device;
- general host-directory, network/IPC, cross-job, resource, immutable-input, or teardown isolation;
- guest success inferred from runner exit zero;
- admission of the current bytes to a `BackendValidationRecord`.

## Limitations

- One host and exact retained development bytes only; no clean-machine or installed-product claim.
- No exploit construction, VM-escape research, hostile replacement kernel, or unbounded fuzzing.
- The source trace establishes configuration cause, not independent security validation of
  `NullFs` or virtiofs request handling.
- The report lacks a complete independent host/toolchain manifest and relies on the base Gate C
  record for broader environment context.
- Recovery copied the 8 GiB sparse malformed fixture into this worktree without preserving its
  hole; the original run fixture still reports zero allocated blocks. The report and auxiliary
  text evidence remain byte-identical. Do not treat physical allocation after recovery as a
  property of the original run.

## Later integration recommendations

1. ADR integration: record an explicit accept/remove decision for the exact `NullFs` device and
   retain the distinction between device presence and host-backed sharing.
2. Evidence-matrix integration: add separate rows for the unresolved device surface, exact
   completion semantics, closed configuration imports, malformed-block preflight, exact runner
   identity, bounded host kill, and the deferred writable cross-job case.
3. Backend-contract integration: require a typed closed device list, immutable runtime/profile and
   validation references, exact-or-refused limits, exact completion evidence, and terminal teardown
   classification. Never expose general libkrun configuration calls through execute-time input.
4. Validation-record integration: bind exact distributed bytes, host/profile prerequisites,
   accepted `NullFs` semantics if any, the full selected evidence digest set, and all cross-track
   limitations before considering posture promotion.
5. Repository-tooling integration: exclude generated experiment `.runs/` data in the shared Biome
   configuration. Git now ignores it locally, but the current root Biome configuration still scans
   it and proposes reformatting byte-retained evidence.

## Observed verification outcome

The shell's default Node was 22.21.1, below the repository engine floor. All pnpm verification used
`fnm exec --using=22.22.1 --` with pnpm 10.28.2. Observed results:

- experiment `go test ./...`: pass;
- deterministic property test: pass, exact profile accepted once in 10,000 inputs;
- `FuzzValidateProfile` with `-fuzztime=3s`: pass, 1,282,331 executions and no failure;
- `sh -n` and ShellCheck over all four shell scripts: pass;
- retained runner, config probe, libkrun, and libkrunfw `codesign --verify --strict`: pass through
  macOS trust services; each was valid on disk and satisfied its designated requirement;
- raw report `jq empty`: pass;
- `pnpm install`: pass from the existing lockfile/store with no download;
- `pnpm check`, `pnpm test`, and `pnpm verify:schemas`: pass;
- repository `go test ./...`, `go vet ./...`, and `go build ./...`: pass;
- `git diff --check`: pass;
- final elevated `pgrep -fl capsule-krun-runner`: no match; no runner remained;
- exact `pnpm lint`: one failure because Biome tried to reformat the ignored raw
  `.runs/adversarial.RnxjWW/report.json`. It checked 56 files and reported no other diagnostic.
  The raw report was deliberately not modified because its SHA-256 is retained evidence and the
  requested edit scope excludes the shared root `biome.json` needed to suppress generated runs.

The VM corpus was not rerun. The focused verification did not launch a VM.
