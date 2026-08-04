# Gate C P0-1: immutable runtime-root custody

Status: **development-only retained experiment; FD-native PATCH-CANDIDATE recorded 2026-08-02**.
Nothing here is product code, an admitted backend, or permission to execute user-supplied bytes.

Owner: Capsule core. Retain until an exact installed, signed/notarized App Sandbox bundle using a
narrow FD-native libkrun API has rerun this corpus and the result has been reconciled into the
canonical Gate C decision. Product packages must not import this directory.

## Defensive scope and question

This experiment defensively validates P0-1 using only owned repository fixtures, local processes,
the already pinned libkrun/libkrunfw build, locally cached OCI fixture images, and one owned local
Hypervisor.framework guest. It does not access another system, identity, credential, or data.

It separates three claims and now evaluates the governed fallback selected by the original
pathname experiment:

1. P0-1A: whether a raw-only FD-native libkrun 1.19.4 route retains the exact inherited read-only
   object without any pathname open, reconstruction, or fallback;
2. P0-1B: whether exclusive construction, closure of every writable alias/mapping, unlink, and
   post-finalization digest produce a frozen object; and
3. P0-1C: whether the whole topology resists the locally testable baseline same-user and crash
   cases.

## Exact inputs

- libkrun `v1.19.4`, commit `728df8125077d0db44265f6e997c72b81b65c015`, built with `BLK=1`
  and without `NET`;
- libkrunfw `v5.5.0`, embedded Linux `6.12.91`;
- the two existing Gate C source patches for firmware `@rpath` resolution and exact read-only root
  mount flags;
- governed patch `patches/0003-read-only-raw-root-fd.patch`, SHA-256
  `48cdbc307b3fa1209fa0ec68fc3f817634af312983d68f0de259db86c0b43333`;
- Alpine fixture
  `alpine@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce`;
- Ubuntu builder
  `ubuntu@sha256:0e0a0fc6d18feda9db1590da249ac93e8d5abfea8f4c3c0c849ce512b5ef8982`.

The selected comparable root is ext4 without a journal. The journaled control is retained because
the guest's mounted block-device view replayed metadata in memory and therefore did not equal the
unchanged host backing bytes.

## Reproduce

Prepare and build the exact patched pinned libkrun tree from local sources:

```sh
./experiments/gate-c-libkrun-root-custody/prepare-fd-native-libkrun.sh
./experiments/gate-c-libkrun-root-custody/build.sh
./experiments/gate-c-libkrun-root-custody/prepare-root.sh
```

Run the local descriptor/race corpus and source audit:

```sh
./experiments/gate-c-libkrun-root-custody/source-audit.sh
python3 ./experiments/gate-c-libkrun-root-custody/local_custody.py
```

Run the owned unsandboxed guest path:

```sh
python3 ./experiments/gate-c-libkrun-root-custody/run_guest.py --timeout 60
```

Attempt the App Sandbox path. Exit 78 means this host reproduced the retained pre-main signing/
sandbox initialization limitation, not that libkrun or custody passed or failed:

```sh
python3 ./experiments/gate-c-libkrun-root-custody/run_guest.py --sandboxed --timeout 60
```

Focused verification, excluding the Docker/guest rerun by default:

```sh
./experiments/gate-c-libkrun-root-custody/verify.sh
CAPSULE_RUN_GUEST=true ./experiments/gate-c-libkrun-root-custody/verify.sh
```

Generated builds and raw reruns remain ignored under `.build/` and `.runs/`. The original pathname
evidence is retained under `evidence/2026-08-02/`; selected FD-native evidence is under
`evidence/2026-08-02-fd-native/`.

## Decision boundary

The governed raw-only API passed the local attachment, ownership/lifetime, positional-I/O,
deliberate-mutation, and four-run owned guest digest corpus with zero runtime-root pathname opens.
It is therefore **PATCH-CANDIDATE**, not PASS: the exact signed/notarized installed App Sandbox
runner and protected construction-store same-UID corpus could not be exercised without a valid
signing identity. This evidence neither admits libkrun nor closes P0-1C, and the patch remains
non-production material pending independent review and the final installed corpus.
