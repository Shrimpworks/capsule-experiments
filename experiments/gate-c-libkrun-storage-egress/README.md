# Gate C libkrun block-storage and egress follow-up

Status: **development-only feasibility spike**. Nothing in this directory is a production backend,
an authoritative receipt source, or evidence for `validated-local` posture.

Owner: Capsule core. Remove this experiment after its mechanisms are either independently reviewed
and implemented behind the production backend and content-custody interfaces, or rejected by a
later integration decision.

## Question

Can the exact libkrun/HVF candidate attach separate raw, digest-verified, read-only source and input
block devices and one fixed-size, per-attempt writable scratch/output raw block device without
virtiofs, host-directory sharing, image-format probing, or ambient host access? Can a post-stop gate
reject hostile filesystem objects and bound extraction?

## Safety boundary

The retained VMM calls only `krun_add_disk`, whose API fixes the image format to raw. It attaches a
read-only raw root plus separate read-only source and input disks and one writable scratch disk. The
guest storage probe mounts the first three filesystems read-only and mounts scratch with
`nodev,nosuid,noexec`, then drops to UID/GID 65534, clears supplementary groups, and sets
`no_new_privs` before exercising the cases.

Fixture construction and offline ext4 inspection use a digest-identified Ubuntu container with no
network. This is test tooling, not the proposed in-process Supervisor parser. The proposed design in
`RESULTS.md` requires a disposable, independently bounded parser environment.

## Build and run

Prerequisites match `../gate-c-libkrun-hvf`: the retained patched libkrun v1.19.4 and libkrunfw
v5.5.0 trees under `/private/tmp`, Go, Xcode/clang, Docker, and a suitable signing identity for the
App Sandbox case.

```sh
./build-guest-probe.sh
./prepare-fixtures.sh
CAPSULE_SIGNING_IDENTITY='<Developer ID Application identity>' ./build-runner.sh
./run-tests.sh
```

`run-tests.sh` refuses fixture-digest mismatch, creates a fresh fixed-size scratch image per case,
and writes logs, manifests, and summaries under ignored `.runs/`. It never reuses a consumed disk.
Selected final evidence is retained in `evidence/final-run.txt` and analyzed in `RESULTS.md`;
ignored bulky raw disks and signed products can be reconstructed with the commands above.
