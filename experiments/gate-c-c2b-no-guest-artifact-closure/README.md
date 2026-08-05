# Gate C C2B no-guest artifact closure

This defensive archive asks which null C2A artifact identities can be constructed without creating
or entering a guest. It uses only exact governed/public inputs, fixed C1/C2A fixtures, and controlled
local build processes.

The scoped result is **PASSED** for six reproducible byte identities: governed libkrun dylib,
libkrunfw dylib, extracted guest kernel, trusted init, trusted launcher, and no-journal raw runtime
root. One exact runtime-bundle manifest candidate was also constructed. All remain unadmitted.

The parent remains **BLOCKED**. A final host runner, separate firmware byte identity, composed
profile identity/digest, exact CPU-time/host-VMM-memory/scratch enforcement, and guest-observed
evidence are still absent. `RUNTIME-001` and `VMM-001` remain unsupported.

No libkrun start API, HVF entry point, VM, guest, arbitrary workload, signature, notarization,
release publication, product wiring, or runtime/profile admission occurred.

Primary records:

- `RESULTS.md`
- `HANDOFF.md`
- `manifests/artifact-closure-report.json`
- `manifests/runtime-bundle-candidate.json`
- `evidence/2026-08-05/verification-summary.txt`

The large binaries are reproducible build outputs, not Git archive contents. The repository retains
their exact size/mode/digest identities, construction sources, commands, SBOM, license inventory,
unsigned provenance, and A/B equality evidence.
