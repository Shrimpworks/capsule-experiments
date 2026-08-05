# C2 final governed artifacts — blocked construction

Date: 2026-08-04

Status: `BLOCKED`

Scope: defensive, no-launch construction review for the governed C2 development profile.

No VM, HVF backend, libkrun guest, arbitrary workload, credential, signing, notarization,
publication, installation, runtime admission, or C2 guest profile was executed.

## Decision

The nine final artifact identities remain null. The exact governed runtime release candidate cannot
consume the exact C2A known answer:

- C2A source: 103 bytes, SHA-256
  `c8e940feb89b342de2d5e6bd13c413226676de9a539fce34c4107516e635b475`.
- C2A input: 36 bytes, SHA-256
  `9de0c909cfb111bd99c3b0b5f7a10972894270c2867022a71b6b6f3c0cd1af6e`.
- The release-candidate runtime harness accepts only five compile-time source fixtures and one
  compile-time input fixture. Its nominal source is 159 bytes at
  `a236a49337021c709875a6e921910418f8801b78627e504aaf93a5bb636622ca`; its input is 50 bytes at
  `dcca912dd4ddd9c93c1efd3e6aecf33dd2d0c0ef75b36d0b8acf89cae752264a`.
- The harness refuses a source not in `FIXED_SOURCES` and an input unequal to `FIXED_INPUT` before
  constructing the governed runtime result.

A trusted launcher cannot rewrite C2A bytes to the runtime's retained fixtures, synthesize the C2A
result from a different workload, or extend the runtime whitelist without creating a new governed
runtime candidate. Any of those would substitute authority rather than close it.

## Verification

Run the static verifier from this repository checkout:

```sh
node experiments/gate-c-c2-final-governed-artifacts/scripts/verify-blocker.mjs \
  /path/to/capsule-corp /path/to/capsule-experiments \
  /path/to/deno /path/to/rusty_v8 /path/to/libkrun
```

The verifier performs only static byte, Git-object, ancestry, patch-aggregate, and source-contract
checks. It does not build or launch a guest.

See [RESULTS.md](RESULTS.md), [HANDOFF.md](HANDOFF.md), and
[blocked-construction.json](manifests/blocked-construction.json).
