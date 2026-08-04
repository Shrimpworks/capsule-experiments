# Retained evidence

The files under `2026-07-31/` are the bounded, reviewable subset selected from the ignored final
run directory `.runs/corpus.J4aAdR`. They are development-spike evidence, not an authoritative
receipt or platform attestation.

| File | Purpose |
| --- | --- |
| `environment.txt` | Exact observed host and tool versions. |
| `runtime-manifest.txt` | Source commit and hashes of the final signed runner/libraries/root disk. |
| `corpus-summary.json` | Bounded machine-readable summaries for every ordinary corpus case. |
| `controller-crashes.log` | Four controller crash checkpoint outcomes. |
| `selected/profile-probe-*.capture` | Negative low-memory observations. |
| `selected/profile-vcpu1-mem64.stdout.capture` | Smallest passing minimal-fixture profile output. |
| `selected/*output*.capture`, `selected/pipe-*.capture` | Fixed-prefix flood/backpressure evidence with truncation markers. |
| `selected/controller-crash-*.recovery.json` | Exact live-runner and already-absent reconciliation outcomes. |

SHA-256 of `corpus-summary.json`:

```text
0fcbfa2c423fa7b09ca7b9035692cdb9cf7baff73023d1b61bd4c01bbfc72f8b
```

Guest-controlled captures were retained only where the fixture emitted a fixed known pattern or
where the negative kernel output is necessary to explain the decision. Full generated products
and redundant run logs remain ignored.
