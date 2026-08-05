# Results

## Decision

**PASSED — scoped no-guest sub-artifact construction only.**

| C2A role | Result | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| governed libkrun dylib | constructed, unadmitted | 4,426,736 | `f8e05177ce57a6f773f86d6755a29fe3f2bab92140dfe8caa33663a28584ae52` |
| libkrunfw dylib | constructed, unadmitted | 24,339,104 | `0b14f4b8005dafd33c38df5935b9efdb6381c724224b3967ba1cecbecf10b6e9` |
| guest kernel | constructed, unadmitted | 24,117,248 | `b50a4165215d5d897ab3614606a2105756cf8f2b2510cbceda9dc06057a5622d` |
| trusted init | constructed, unadmitted | 930,144 | `4f4f2c8bc037c3226b183ad0d6daf35395c49467dfe5786d10a33290adf585cd` |
| trusted launcher | constructed, unadmitted | 995,920 | `fd255394a26affadb1226d3f724494e76fc89785a5cced027a7bb9859d7da32d` |
| raw runtime root | constructed, unadmitted | 134,217,728 | `390a4786a20d45f1c691ec8c203f84f5e9d372a30e98f867cc8309a144ca6798` |

The runtime-bundle manifest candidate is 8,845 bytes with SHA-256
`d37c9311cf21e87cf693594ebb6bbf6c29bcb50d13c3f8a5e8334a0f02d30607`.
It is not the still-null canonical governed manifest identity.

## Observed

- Two clean builds used identical inputs and empty output/cache directories.
- Connected acquisition ended before decisive builds. macOS compilation ran under `deny network*`;
  Linux/arm64 assembly ran in the pinned builder with `--network none` and no default route.
- All 34 declared output/evidence files compared byte-for-byte equal without normalizing declared
  outputs after either build.
- The trusted init and launcher are static AArch64 PIE ELF files with no `NEEDED` entries.
- The root is a fixed-UUID ext4 image with no journal. `e2fsck -fn` passed. Its inventory contains
  the fixed runtime, snapshot, init, launcher, loader, libc, libm, and libgcc only; no shell, package
  system, network configuration, writable host mount, or general host path exists.
- The retained host runner is intentionally build-only. Static disassembly has no call to any
  `krun_*` symbol. Exact preflight plus missing fd7, extra fd8, wrong mode, wrong control byte,
  linked root, extra argv, and extra environment cases behaved as specified.
- The three fixed transport frames were accepted by the archived P0-3 cross-language verifier.

## Inference

These results support exact byte closure for the six listed sub-artifacts. They do not establish
guest bootability, libkrun/HVF behavior, port numbering, child execution, root custody inside a
guest, teardown, runtime admission, or composed-profile admission.

## Parent status

**BLOCKED — not NO_GO.** Remaining exact dependencies:

1. a final host runner that performs the complete governed configuration, record-before-start,
   start, drain, cancellation, forced teardown, identity-before-signal, and absence proof;
2. a separate runnable firmware byte identity, or a canonical decision that the role is inapplicable;
3. exact supported CPU-time, host-VMM-memory, and bounded scratch mechanisms/values;
4. an accepted composed runtime-profile object and digest using these new identities; and
5. one separately authorized owned-guest C2B run for guest-only device, transport, root, child,
   trace, lifecycle, and restoration evidence.

`RUNTIME-001` and `VMM-001` remain unsupported. Confidence is high for build identity/equality and
medium for later guest suitability because guest execution was prohibited.
