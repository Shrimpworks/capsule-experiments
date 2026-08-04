# Gate C adversarial validation receipt

Date: 2026-07-31

| Field | Value |
| --- | --- |
| Candidate ID | `GATE-C-ADV-NULLFS-001` |
| Instance key | `728df8125077d0db44265f6e997c72b81b65c015:block-root:b04969e618dd5ecaee0cc7c87c586cba873f6f1dae00cc8db3b5d5f8a2918a9d` |
| Finding | Minimal block-root profile exposes an unrequested virtiofs device. |
| Affected evidence | `.runs/adversarial.RnxjWW/report.json`, case `guest.inventory` |
| Root control | `/private/tmp/capsule-libkrun-v1.19.4/src/libkrun/src/lib.rs:2385-2418` |
| Validation method | Realistic guest inventory, safe no-start configuration probe, runner import audit, and pinned-source trace. |
| Disposition | `reportable` as an unresolved profile-contract finding; no vulnerability severity assigned. |
| Survives | Yes. |
| Confidence | High for device presence and source cause; impact beyond additional guest-to-VMM surface remains unscored. |
| Artifacts | `RESULTS.md`, `SELECTED_EVIDENCE.md`, and the raw run above. |

Evidence: the guest reported virtiofs modalias `virtio:d0000001A`; the block-root source adds an
`FsDeviceConfig` with `shared_dir: None` and selects `NullFs`; the runner did not import an optional
host-directory configuration API; no virtiofs mount appeared after pivot.

Counterevidence narrows but does not suppress the finding: no host directory was configured or
observed mounted. The remaining proof gap is an explicit accept/remove decision plus independent
validation of the exact accepted `NullFs` implementation, or a device-removal change followed by a
corpus rerun.

Follow-up: the 2026-08-02 [P0-2 investigation](NULLFS_P0_2.md) falsified only the smallest removal.
Removing the internal fs-device construction prevented bootstrap before init, while the control
booted and exposed virtiofs. The finding and proof gap survive; no residual-surface acceptance,
installed-profile evidence, or posture promotion resulted.
