# `.mjs` Source Validator V1 artifact

Status: unwired V1 artifact prerequisite for Proposed ADR-0035. The executable parses but never
executes JavaScript. No Capsule product package imports this crate, and no daemon, Broker,
Supervisor, IPC endpoint, runtime, backend, or guest consumes it.

The binary accepts exactly one V0 request frame on standard input, requires one fixed
`--artifact-profile-digest=<64 lowercase-or-uppercase-hex>` launch argument, emits exactly one
138-byte V0 result on success, and exits nonzero without output for an invalid launch identity,
malformed request, invalid UTF-8, leading BOM, cap violation, or internal counter refusal. Parser
and semantic diagnostics are fixed typed refusal results with zero counts; no diagnostic prose or
source bytes cross the output channel. It never interprets the source as executable code.

The launch argument is a V1-to-V2 seam, not caller authority. A future V2 fixed launch descriptor
must seal it to the independently decoded enrolled artifact profile and must prove descriptor
closure, sandboxing, resource ceilings, deadline kill/reap, and artifact identity. Until then,
running this executable provides crash isolation only. Timeout, crash, signal, partial output,
malformed output, or a profile/digest/length mismatch has no allow result and must be refused by a
future parent exactly as frozen by V0. No fallback parser or scanner exists.

Build and test with the pinned toolchain and existing local Cargo source cache:

```sh
cargo test --manifest-path artifacts/mjs-source-validator-v1/Cargo.toml --locked --offline
./artifacts/mjs-source-validator-v1/scripts/reproduce.sh
node artifacts/mjs-source-validator-v1/scripts/verify-evidence.mjs
```

The retained evidence records the exact artifact, inputs, dependency graph, registry checksums,
licenses/notices, CycloneDX SBOM, build/assessment subjects, two-clean-directory same-host
reproduction, V0 fixture agreement, and mutation/restoration results. The Mach-O's identity-free
linker ad-hoc signature and CodeDirectory digest are recorded; they are not an installation
signature. This is also not independent-builder reproduction. `ASSESSMENT.md` lists the admission
blockers and the update/rollback rule.

The earlier multi-candidate parser experiment is retained separately at
`Shrimpworks/capsule-experiments` commit `0d8233b55f153b27a901a9ec45a3834208e3aa86`.
Offline artifact reproduction binds its reviewed Cargo lock digest and comparison result as
historical provenance; it does not require a live `experiments/` checkout in this repository.
