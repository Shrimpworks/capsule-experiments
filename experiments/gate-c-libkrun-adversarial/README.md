# Gate C: adversarial libkrun/HVF validation

Status: **development-only retained spike; no production or `validated-local` claim**.

Owner: Capsule core. Remove the executable spike code after the corpus is implemented against the
production backend adapter or the native backend is rejected.

## Question

Does the exact minimal libkrun/HVF development profile fail closed under malformed block/config
inputs, hostile guest workloads, repetition/concurrency, cross-job probes, VMM termination, and
process-identity substitution—and which controls still depend on a Capsule-owned preflight rather
than the libkrun library itself?

The spike is defensive. It does not attempt VM escape exploitation or unbounded fuzzing.

## Scope

- Runtime `krun_has_feature` audit and exact runner import audit.
- Safe configuration misuse probes without starting those broadened configurations.
- Empty, random, truncated, corrupt-superblock, sparse-oversized, missing, directory, and symlink
  raw-block cases.
- In-guest device inventory, descriptor/process/memory/output stress, crash, hang, ten sequential
  jobs, four concurrent jobs, and a fresh-VM `/tmp` leakage probe.
- Live PID/start/path/code-requirement tuple checks, including wrong-code, wrong-path, and
  wrong-start negative controls.
- A deterministic 10,000-profile property corpus, native Go fuzz seeds, and safe raw-block
  preflight tests for Capsule-owned input validation.

## Build and run

The base Gate C source/build pins must already exist. Build fresh signed artifacts in this
experiment rather than trusting the older ignored `.build` directory:

```sh
CAPSULE_SIGNING_IDENTITY='AD70CEDCA605604676C2853A229AA4664AD3F750' ./build.sh
./prepare-disk.sh
./audit-nullfs-source.sh .build/capsule-krun-runner
./run.sh
```

Generated binaries, disks, malformed fixtures, and reports are ignored under `.build/` and
`.runs/`. The retained source and [RESULTS.md](RESULTS.md) describe the reproducible evidence.

The latest reviewed corpus is `.runs/adversarial.RnxjWW/`. It intentionally returns status 1 for
the guest-visible `NullFs` virtiofs device; this is an unresolved profile finding, not a harness
error. See [SELECTED_EVIDENCE.md](SELECTED_EVIDENCE.md) for the tracked evidence index and
[VALIDATION_RECEIPT.md](VALIDATION_RECEIPT.md) for the finding disposition, and
[HANDOFF.md](HANDOFF.md) for integration guidance.

The bounded replacement P0-2 investigation is recorded in
[NULLFS_P0_2.md](NULLFS_P0_2.md). It found no independent virtiofs build toggle, established that
the retained block-root route always creates `NullFs`, and falsified the smallest removal: deleting
only that device prevented bootstrap. Selected control/mutation output is tracked under
`evidence/nullfs-p0-2/`. The current profile remains unsupported for P0-2; the follow-up does not
replace the original Developer ID evidence with its ad-hoc boot-only comparison.
`audit-nullfs-source.sh` is a read-only regression check for the pinned source routes and optional
runner imports; passing it is not residual-surface validation.

The next fail-fast disposition spike is recorded in
[NULLFS_P0_2_DISPOSITION.md](NULLFS_P0_2_DISPOSITION.md). A direct-block-root prototype moved the
same trusted init into the candidate runtime root, booted the pinned internal kernel without constructing an
fs device, and reran the bounded adversarial corpus without the original `NullFs` failure. The
decision is `GOVERNED-PATCH`, not final removal or admission; installed route closure, P0-1 custody,
P0-3 transport, P0-4 packaging, and final signed-byte reruns remain mandatory.

## Safety boundaries

- Every launched runner has a finite host timeout and exact PID teardown.
- Output is continuously drained while only 128 KiB per stream is retained and the complete byte
  count and SHA-256 are recorded.
- The memory probe is limited to one 256 MiB VM and requests at most 320 MiB inside that VM.
- Malformed images are local bounded fixtures; the largest is an 8 GiB sparse file.
- The config probe never enters a VM after requesting optional devices.
- The test does not reboot, log out, change installed services, or mutate product state.
