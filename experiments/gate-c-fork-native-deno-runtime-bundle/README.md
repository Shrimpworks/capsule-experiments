# Fork-native governed `deno_core` runtime-bundle experiment

Status: **LINUX/ARM64 CONSTRUCTION BLOCKED; NO BUILD OR RUNTIME ADMISSION** on 2026-08-03.

This development-only experiment defensively asks whether the first clean fork-native Capsule
runtime bundle can be constructed from the exact merged `dills122/deno` and
`dills122/rusty_v8` governed commits for the intended Linux/arm64 profile. It is confined to the
Capsule repository, those two user-owned forks, exact declared source/tool inputs, fixed benign
Capsule fixtures, controlled local inspection, and owned isolated build environments. It does not
authorize arbitrary workloads, any real backend or guest, product wiring, signing, publication,
profile admission, or access to any other system, identity, credential, or data.

The fork refs, merge parents, upstream ancestry, governed Deno patch/fixture identities,
`rusty_v8` 20-gitlink source lock, and exact existing builder locks were independently checked. The
Deno fork head preserves the exact three-op source and fixed known answer. The current merged
`rusty_v8` follow-up, however, defines only a Linux/amd64 host and
`x86_64-unknown-linux-gnu` target. Its builder image, LLVM/bindgen packages, sysroot, GN/Ninja,
Rust toolchain, output names, collection, verification, and provenance are all amd64-specific.

The task's fail-fast rule therefore applies: no clean build was started, and Linux/amd64 was not
substituted for Linux/arm64. See [RESULTS.md](RESULTS.md) and [HANDOFF.md](HANDOFF.md).

## Exact fork refs

- Deno governed PR #1 head:
  `9adb0b68b55bca81644827f1e7749a3acb091bed`.
- Deno governed merge:
  `ea18b9dc21ff8ebd19347be7095f47937ee14ec2` on
  `capsule/upstream-v2.9.4`, based on
  `14eea3160ae5834476aa3b9d317b8d41d991b982`.
- `rusty_v8` governed follow-up PR #2 head:
  `a43ee7486c3e05bce5d6e5db586b3e2e688c33cf`.
- `rusty_v8` governed follow-up merge:
  `a31b8f39dc6933d5635367e8ccb67d70f2cc2385` on
  `capsule/upstream-v150.2.0-d305e6a`, based on
  `d305e6afa7736f6e298c30ae6646f7709ee9382b`.

The stale original `rusty_v8` head `17698caedb8721c132a3e2f08f7ab0ae212f313a`
is recorded only as rejected history. It is not the consumed fork head.

## Layout

- `manifests/input-contract.json`: closed intended Linux/arm64 material and output contract. A
  missing digest or unsupported construction state refuses rather than floating or substituting.
- `manifests/known-answers.json`: exact prior physical-omission, root, and TypeScript fixture
  oracles. They are comparison inputs, not fork-native output claims.
- `evidence/2026-08-03/ref-verification.json`: retained observed refs, ancestry, trees, locks, and
  the exact architecture blocker.
- `scripts/verify.sh`: offline retained-evidence verification, plus optional verification against
  local checkouts of the two exact fork heads.
- `RESULTS.md` and `HANDOFF.md`: decision, limitations, and smallest next fork change.

## Verify

Offline retained evidence:

```sh
./experiments/gate-c-fork-native-deno-runtime-bundle/scripts/verify.sh
```

Also verify local exact fork checkouts without network:

```sh
./experiments/gate-c-fork-native-deno-runtime-bundle/scripts/verify.sh \
  /path/to/dills122-deno-at-9adb0b68 \
  /path/to/dills122-rusty_v8-at-a43ee748
```

The verifier intentionally has no build mode while the contract reports
`blocked-arm64-builder-absent`.

## Removal or replacement

Retain this blocker until a later merged `dills122/rusty_v8` change supplies and verifies a fully
digest-pinned Linux/arm64 builder/publication profile. Replace the blocked contract only with exact
observed fork refs, material digests, generated metadata, unsigned output identities, clean
network-disabled build evidence, and same-host equality. Independent-builder evidence remains a
separate stronger result.
