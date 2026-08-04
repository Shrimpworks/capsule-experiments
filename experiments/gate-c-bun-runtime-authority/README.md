# Gate C P0-0: Bun runtime-authority closure

Status: **development-only experiment evidence**. Nothing in this directory is product code, an
admitted runtime profile, or permission to execute user bytes.

This bounded experiment evaluates `RUNTIME-001` for the exact Bun 1.3.14 source revision and Linux
arm64 image already pinned by Gate C. It inventories native capability and syscall/module-loading
construction paths, then exercises stock-runtime behavior with fixed hardening arguments and
deliberate flag-removal controls.

The experiment never imports into `packages/`, runs no user-supplied bytes, uses no live host path
inside a hostile guest, and does not change the documented no-subprocess/no-FFI/native-addon/
inspector/macro/environment-file/package-install contract. Docker is only an offline execution
oracle for the pinned Linux binary; it is not treated as the Capsule backend or security boundary.

## Exact pins

- Bun source tag `bun-v1.3.14`, commit `0d9b296af33f2b851fcbf4df3e9ec89751734ba4`.
- OCI index `oven/bun@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04`.
- Selected local Linux/arm64 image ID
  `sha256:bc9f668f713165b415f680bdffb9077f3355886fc1aa8a087f2fe258da0c7a58`.
- `/usr/local/bin/bun` SHA-256
  `37141662ebed915a2ab89313156e455e2a1374395f5f6760d06407f49406f086`.

## Reproduce

The image must already be present locally. The script uses `--pull=never`, `--network none`, a
read-only container root, a no-exec temporary work directory, UID/GID 65534, dropped Linux
capabilities, `no-new-privileges`, and a 64-task/256 MiB/one-CPU Docker envelope. Those Docker
controls constrain the experiment; they are not evidence for the planned libkrun profile.

```sh
./experiments/gate-c-bun-runtime-authority/run.sh
```

Raw reruns go to ignored `.runs/`. The reviewed decision and selected exact output are retained in
`RESULTS.md` and `evidence/2026-08-02/`.

Retain this directory until a governed runtime fork/external enforcement profile or alternate
runtime has passed the full P0-0 construction, mutation, installed-bundle, and hostile corpus on
the final bytes. Product code must not import these fixtures.
