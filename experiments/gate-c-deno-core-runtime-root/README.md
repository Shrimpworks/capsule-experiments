# Governed `deno_core` self-contained runtime-root experiment

Status: **STANDALONE DYNAMIC ROOT PASS; NO RUNTIME ADMISSION** on 2026-08-03.

This development-only experiment defensively tests whether the exact governed `deno_core` 0.409.0
candidate from PR #50 can execute the fixed Capsule fixture from a bounded Linux/arm64 root that
contains every loader and shared-library byte it uses. It is confined to this repository, exact
official pinned artifacts, fixed benign fixtures, controlled local processes, and owned isolated
Linux/arm64 containers. It does not authorize any other workload, system, identity, credential,
data, backend, guest, signing service, or deployment.

The selected construction packages the exact Debian loader, `libc`, `libm`, and `libgcc_s` bytes.
It invokes the loader with `--inhibit-cache` and an exact `--library-path`, has no configured
environment, and runs in a scratch image with a read-only root, network disabled, all capabilities
dropped, and no-new-privileges. The normalized 22-entry root is reproducible across two clean
same-host containers at different host paths.

This result closes only PR #50's standalone dynamic-root blocker. It does not select or admit the
runtime, promote `RUNTIME-001`, prove libkrun/external isolation, finish V8 source/notice closure,
or provide independent-builder provenance. The intended engineering direction is governed
`deno_core`; current evidence remains pre-admission.

## Reproduce

The build accepts only the already-verified PR #50 binary/snapshot and exact snapshot.debian.org
package artifacts listed in `manifests/package-sources.json`:

```sh
experiment=./experiments/gate-c-deno-core-runtime-root

"$experiment/scripts/build-root.sh" \
  /path/to/capsule-deno-core-physical-omission \
  /path/to/capsule_core_snapshot.bin \
  /path/to/libc6_2.36-9+deb12u14_arm64.deb \
  /path/to/libgcc-s1_12.2.0-14+deb12u1_arm64.deb \
  /path/to/gcc-12-base_12.2.0-14+deb12u1_arm64.deb \
  /tmp/capsule-root-a build-a
```

Run `scripts/test-root.sh` against that build and the exact `strace_6.1-0.1_arm64.deb` artifact.
The trace tool is harness-only and never enters the runtime root. Large package/root artifacts are
ignored and disposable; scripts, manifests, selected raw observations, and decisions are retained.

## Layout

- `manifests/runtime-root-files.tsv`: closed 22-entry root manifest and exact cap.
- `manifests/package-sources.json`: binary/source/notice correspondence and artifact hashes.
- `scripts/`: exact construction, verification, ELF, trace, mutation, and measurement helpers.
- `evidence/2026-08-03/`: bounded machine and selected textual observations.
- `CONSTRUCTION_COMPARISON.md`: dynamic versus static/alternative-link review.
- `SOURCE_AND_LICENSE.md`: runtime-root source and notice mapping.
- `RESULTS.md` and `HANDOFF.md`: decision and orchestrator handoff.

Prototype code remains outside product imports. Any binary, snapshot, patch, package, root entry,
invocation, environment, or profile change invalidates this result.
