# Fork-native governed `deno_core` Linux/arm64 bundle

Status on 2026-08-04: **PASSED — EXACT CLEAN CONSTRUCTION ONLY**.

Runtime selection and admission remain **IN_PROGRESS / UNSUPPORTED**. Nothing here is a release,
signature, deployment, product integration, or runtime authority. No libkrun/HVF guest was created
or invoked.

This defensive experiment reconstructs the first standalone Linux/arm64 Capsule runtime bundle
directly from the exact merged `Shrimpworks/deno` and `Shrimpworks/rusty_v8` governed forks. It uses
only fixed benign Capsule fixtures, declared digest-pinned inputs, controlled local builders, a
connected prefetch phase, and network-disabled construction and tests.

## Exact inputs

- Deno head `9adb0b68b55bca81644827f1e7749a3acb091bed`, merge
  `ea18b9dc21ff8ebd19347be7095f47937ee14ec2`, upstream anchor
  `14eea3160ae5834476aa3b9d317b8d41d991b982`, tree
  `72edd0f7b5f83b918945860653714e344c8a303f`.
- `rusty_v8` head `80e863ddb942a4aa2b384e794fc23e35b9d2bb15`, merge
  `cbf56de2e1156b1cf1561fdbaea7172a0aa056f4`, upstream anchor
  `d305e6afa7736f6e298c30ae6646f7709ee9382b`, tree
  `d8950a7a1ee907761720b23d24eaa9b63aa33b10`.
- Builder `rust:1.95.0-bookworm@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1`.
- Direct-workspace Cargo lock `4dd8f08c8b223adbf3468fce5fe9e0468dfe9f4a255129cc304cb604fa0d389d`:
  193 packages, including 189 checksum-locked registry sources and four exact path packages.
- Exact Debian arm64 loader/library, strace, and corresponding-source inputs retained in the
  closed evidence manifest.

Remote refs, merge parents, ancestry, tree identities, the 20 `rusty_v8` gitlinks, 22 cross
packages, profile/output contracts, and fork-local verifiers were checked before construction.
Stale heads were rejected.

## Construction result

| Subject | Size | SHA-256 |
| --- | ---: | --- |
| Governed `rusty_v8` archive gzip | 37,674,703 | `1ae209c9e4ba5803d010d2c79ee4cc0af0126c5a7ebcca211c7e41deaede4cd2` |
| Deno binary | 68,497,624 | `56d3acefd2cc2f5136a0b8143c47131e49a58fbf66382dfd3e84f715ce8e2898` |
| Snapshot | 699,988 | `4e8965217d5a6675a880326eee6f690bbeec7e7cb243decf2f3e9f453a871a2c` |
| Two-file Deno bundle | 20,983,891 | `0cc08f93e82fcfe68b033e8807975a3bd67068a817da811a87a73aedc3f23937` |
| 22-entry root manifest | 1,807 | `100832dbb37737f29341bc5404df6d4405b8d6b706f274028892801fa88e7de8` |
| Root tar | 71,895,040 | `9c46b45c4d220aedcc47c9ee53e875bc71d31d0b881b51740aaa9b882b5741e6` |
| Root gzip | 22,192,615 | `e847651b35cd425dd8f6fe3bd45d693aff0af244e3a7bd30c629fa125cac62e8` |

The Deno binary, snapshot, two-file bundle, root manifest, root tar, and root gzip reproduced across
clean A/B outputs. Snapshot construction is explicitly pinned to one visible logical CPU and CPU
set 0; two prior four-thread attempts failed closed on a two-byte V8 snapshot payload variance and
are retained rather than normalized.

## Verified boundary

- exactly three final-link built-in op symbols and exactly the three-op runtime registry;
- fixed result `{"count":3,"label":"capsule-owned","sum":6}`;
- no static or dynamic module request, no module loader, no inspector, and no extensions;
- physical omission and four-op restored-`op_print` refusal;
- inherited descriptor manifest `[0,1,2]`, syscall seal, and four syscall restoration refusals;
- closed ELF loader/library versions and loader/file-open trace with no socket syscall or
  executable mapping after the host seal;
- all 14 root and manifest restoration mutations rejected;
- exactly 22 root entries, 71,871,210 regular-file bytes, and all artifact/root caps respected;
- closed source, license/notice, CycloneDX/SPDX, checksum, and unsigned provenance inventories.

The prior binary `597baba6…6f5`, snapshot `ef5f1e78…fa0b`, and root gzip
`b0e17261…79283` are comparison oracles. The current fork-native values explicitly supersede them:
20 root entries remain byte-identical and only the versioned binary and snapshot entries differ.
The successful `rusty_v8` workflow run 30925045754 was used only as an oracle; its archive matches
the local clean archive exactly.

## Layout and verification

- `manifests/input-contract.json`: exact inputs, outputs, fail-closed rules, and admission boundary.
- `manifests/known-answers.json`: prior comparison-only known answers.
- `builder/`: direct fork-native prefetch, build, root, and recovery contracts.
- `evidence/2026-08-04/`: canonical results, comparisons, complete logs, manifests, source/SBOM/
  provenance closure, and retained failure evidence.
- `RESULTS.md` and `HANDOFF.md`: detailed decision and next composed-profile boundary.

Run the retained verification with the two exact local forks:

```sh
./experiments/gate-c-fork-native-deno-runtime-bundle/scripts/verify.sh \
  /path/to/Shrimpworks-deno-at-9adb0b68 \
  /path/to/Shrimpworks-rusty_v8-at-80e863dd
```

This result unblocks only a later, separately authorized external-isolation composition task. It
does not select or admit this runtime and must not be imported into Capsule product packages.
