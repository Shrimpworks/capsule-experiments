# Source Validator R2 unsigned role bundles

Status: **PASSED** for exact unsigned, uninstalled, offline artifact construction. The product Source
Validator remains **BLOCKED**.

This directory builds two private, role-specific XPC service bundles and two role-specific Oxc
parser children for the daemon and Approval Broker boundary selected by ADR-0035 and ADR-0036. It
uses Rust 1.95.0, exact Oxc 0.140.0, the locked Cargo graph, Apple Clang, and the macOS 14.0 target.
The build runs offline in two clean copied source and target directories and retains same-host byte
equality, source/dependency/license/SBOM evidence, and unsigned in-toto provenance.

The bundled R1 resource policies are deliberately inactive. Each native launcher accepts only one
XPC dictionary key named `request`, predecodes the fixed role-specific frame, verifies the source
and policy digests, and refuses without spawning. R2 does not invent the active threshold, cadence,
deadline, cleanup dispositions, or supported-host identity that R4 must derive from signed installed
measurements. There is no product consumer, registration, approval, runtime, backend, or guest.

Reproduce and verify locally:

```sh
./artifacts/mjs-source-validator-r2/scripts/reproduce.sh
```

This result is not signing, enrollment, installation, confinement, resource enforcement,
independent-builder provenance, or product admission. R3 remains a separately authorized signing
and installation task governed by the
[R3 execution packet](../../docs/SOURCE_VALIDATOR_R3_EXECUTION_PACKET.md); R4 remains the signed
confinement/resource/residue campaign.
