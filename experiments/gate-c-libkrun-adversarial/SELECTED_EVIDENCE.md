# Gate C adversarial selected evidence

Date: 2026-07-31

This tracked file indexes selected observations from the ignored raw corpus at
`.runs/adversarial.RnxjWW/`. It is a review summary, not a replacement for the raw report, a signed
attestation, or a `BackendValidationRecord`.

## Corpus identity

| Item | Value |
| --- | --- |
| Started | `2026-07-31T21:22:10.970009Z` |
| Completed | `2026-07-31T21:22:20.209308Z` |
| Report | `.runs/adversarial.RnxjWW/report.json` |
| Report SHA-256 | `da82be6e14beb7002906d7d507e94cf2c58aff347227b9febfaa64d6df819a6f` |
| Cases | 36 VMM cases; 4 identity cases |
| Report classification | 11 findings; 1 limitation; 1 failure |
| Failure | `minimal block-root guest exposed an unrequested virtiofs device` |
| Root disk SHA-256 | `aefccae2f2fd0bc714ecae5b7871372bd81ff433fe26531683a8d69ca47b7830` |

The report and the original copy under `/Users/dsteele/repos/capsule-corp/` have the same SHA-256.
The raw paths embedded in the report therefore identify the checkout where the run occurred, while
the experiment-relative path above identifies the preserved worktree copy.

## Raw auxiliary hashes

| File under `.runs/adversarial.RnxjWW/` | SHA-256 |
| --- | --- |
| `audit.txt` | `db4bb6a05b15515cdb405b57fe459bd3b373253c1d635b285c916824d79bac97` |
| `config-probe.txt` | `958f9fa7e2fdcfd8cbd3e3944f25e612fa1daee46fe70005e6104e828bbf8e3c` |
| `config-probe.txt.runner-imports` | `d9d5a1f103548253355d18dc86df2136515b4c8da3e051de176e28284ad6ceec` |
| `config-probe.txt.otool` | `59955b071d99a6b578ccebfc13afab26208365d96894a6f547cbf6ca6d14debc` |
| `go-test.txt` | `70d3f9fc2a604abbc5523661438c23fe44adddaf0734158f7a330c94219dd417` |
| `hashes.txt` | `ea8ae4f0641601101850abdfefc2b6981e278e4fc3ab948d02db987fd5fdaced` |

## Tested artifact hashes

These values are copied from raw `hashes.txt`; signing timestamps make them identities for the
retained test bytes, not reproducible-build claims.

| Artifact | SHA-256 |
| --- | --- |
| `capsule-krun-runner` | `b04969e618dd5ecaee0cc7c87c586cba873f6f1dae00cc8db3b5d5f8a2918a9d` |
| `config-probe` | `3bd86bf478a9554e68a62bfdec7571bf9439b7b0fe095cccbc4e77b4908c2217` |
| `libkrun.1.19.4.dylib` | `851ab7b3f8f39e39db93ab20d69ecee1f5b3955e2fa35c43917997ad05ceec98` |
| `libkrunfw.5.dylib` | `e175e5f7ac9665a1fb9d1f87e6fe3c3df745ec46dfaf460092637d3c0f644e04` |
| `adversarial-root.ext4` | `aefccae2f2fd0bc714ecae5b7871372bd81ff433fe26531683a8d69ca47b7830` |
| `guest-adversary-linux-arm64` | `ee53fda2705de6e5d96cace4c8aac20f2695eec94c336380e4016f27309c80d6` |
| `guest-launcher-linux-arm64` | `dd96564b269df973fb62b6a893769574e6d5a3184eaa0b8f37573d8ff5004696` |

## Selected direct evidence

| Report location | Selected observation |
| --- | --- |
| `cases[name=guest.inventory]` | Guest inventory included `DRIVER=virtiofs` / `MODALIAS=virtio:d0000001A`; root was ext4 `ro,nosuid,nodev`; no virtiofs mount line appeared. |
| `cases[name=guest.completion-marker]` | Exit zero plus exact `completionMarker=valid-profile`. |
| `cases[name=guest.memory-stress]` | Exit zero after output stopped at `memoryStress.touchedMiB=192`; the 320 MiB completion marker was absent. |
| `cases[name=guest.crash]` | `crash.started=true`, retained 4,280-byte crash stderr with SHA-256 `1936927fa98fc137e08e31ccd98316c43234002003247bcff245dfe8c3b3bc5e`, exit zero, process gone. The full crash output remains only in raw JSON. |
| `cases[name=guest.output-flood]` | 4,194,304 stdout bytes drained; 131,072 retained; truncation true; full-stream SHA-256 `ab33f46aa16767d32f29fc354a6eef255b68014798c9ed7fbc3a3dfb4286362b`. |
| `cases[name=guest.hang]` | Two-second timeout; signal `terminated`; process gone. |
| `cases[name=runner.sigkill]` | Forced kill true; signal `killed`; process gone. |
| `cases[name startswith repeat.true.]` | Ten of ten exited zero without timeout and recorded process gone. |
| `cases[name startswith concurrent.]` | Four of four exited zero without timeout and recorded process gone. |
| `cases[name startswith disk.]` | No malformed non-symlink case emitted a completion marker; all recorded process gone. Six malformed cases nevertheless returned runner status zero. |
| `cases[name=disk.symlink]` and `preflight.symlink` | Direct runner followed the symlink and completed; preflight rejected it as non-regular path indirection. |
| `cases[name startswith runtime.]` | Missing libraries ended with `SIGABRT`; corrupt firmware-library bytes returned 125; neither completed a guest. |
| `identityCases` | Exact tuple accepted; wrong-path, wrong-start, and wrong-code tuples rejected. The wrong-path copy still had valid code identity, demonstrating why code identity alone is insufficient. |
| `findings` and `failures` | Runner-zero ambiguity is classified separately from the single virtiofs profile failure; writable cross-job state is explicitly not exercised. |

## Source trace for the surviving finding

The pinned local libkrun tree is commit
`728df8125077d0db44265f6e997c72b81b65c015`. In
`/private/tmp/capsule-libkrun-v1.19.4/src/libkrun/src/lib.rs:2385-2418`,
`krun_set_root_disk_remount` creates an `FsDeviceConfig` for `/dev/root` with:

```text
shared_dir: None
```

The same source states that the device serves built-in init and pre-pivot mount points through
`NullFs`. `src/devices/src/virtio/fs/worker.rs:118-128` selects the `NullFs` server when no
passthrough configuration exists. This supports the narrow inference that no host-backed directory
was configured; it does not suppress the guest-visible device or validate its VMM implementation.

## P0-2 replacement evidence

The 2026-08-02 [bounded P0-2 investigation](NULLFS_P0_2.md) retains the smallest tested removal
patch, selected baseline/mutation output, a rerun summary, and verification record under
`patches/` and `evidence/nullfs-p0-2/`. It falsifies only removal of the internal fs-device
construction: the build passed but bootstrap panicked before init. It does not accept the residual
surface or update installed-profile evidence.

## Review queries

```sh
jq '{caseCount:(.cases|length),identityCaseCount:(.identityCases|length),findingCount:(.findings|length),limitationCount:(.limitations|length),failureCount:(.failures|length)}' .runs/adversarial.RnxjWW/report.json
jq '.failures, .findings, .limitations' .runs/adversarial.RnxjWW/report.json
jq '.cases[] | select(.name == "guest.inventory" or .name == "runner.sigkill")' .runs/adversarial.RnxjWW/report.json
jq '.identityCases' .runs/adversarial.RnxjWW/report.json
shasum -a 256 .runs/adversarial.RnxjWW/report.json .runs/adversarial.RnxjWW/*.txt
```

Run those commands from `experiments/gate-c-libkrun-adversarial/`. Do not interpret the one failure
as a damaged corpus and do not rewrite it to green.
