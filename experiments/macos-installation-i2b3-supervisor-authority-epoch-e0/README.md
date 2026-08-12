# Supervisor authority epoch E0 construction packet

Date: 2026-08-11

```text
Work item: C3a deterministic I2B3-E0 fixture materialization
Status: PASSED
Scope: repository-local unsigned source, bundle, plist, entitlement, profile-request, descriptor-
  input, manifest, independent-verifier, and mutation construction only
Parent installed owner-lock G3/I2B: BLOCKED
ADR-0045 lifecycle: Proposed
Product admission: BLOCKED
```

## Question tested

Can the inert E0 definition at Capsule commit
`88f3a2c1f968b1aa604ce14a2db4389822e5b193` be materialized as a closed, byte-addressed,
independently verified unsigned packet without consulting or mutating an Apple identity, profile,
container, service, Keychain, installed component, runtime, backend, VM, or guest?

The answer is `PASSED` for construction. The packet does not test the platform separation
inference and does not authorize E1.

## Defensive boundary

This experiment is local, defensive, inert construction. It does not:

- access the Apple Developer portal or enumerate a signing identity;
- sign, provision, install, register, or launch any bundle or process;
- create, open, enumerate, or delete an App Sandbox or App Group container;
- access Keychain, LocalAuthentication, Secure Enclave, a protected root, owner, or store;
- start a product service, runtime, backend, VM, guest, approval, or attempt; or
- accept ADR-0045 or make an installed/product-admission claim.

The three retained Mach-O files are unsigned build products. The build disables linker UUID and
automatic ad-hoc code-signature load commands, builds twice in clean directories, and compares the
complete bundle trees before retaining one copy. The build never executes those files.

## Exact input

- Capsule repository: `Shrimpworks/capsule-corp`
- Capsule commit: `88f3a2c1f968b1aa604ce14a2db4389822e5b193`
- E0 packet document SHA-256:
  `5fa48de7f83c7dcc68cdf393bbff2d08ebef8badfc0e0975788e51c4de6ddc0d`
- Proposed ADR-0045 SHA-256:
  `43cd022cf8d44c1ebf8f606d58f9da89ffbf561bfcfddc43ad56aa542402ef1a`
- `capsule-experiments` base commit: `8ae2cd1cbebdff403fe354da15eac4e27b461765`

The [packet fixture](fixtures/e0-packet.json) freezes the complete identities, selected legacy
negative-profile metadata, sentinel bytes, bundle inventory, E1 case inventory, and no-effect
construction boundary.

## Retained packet

- [`sources/probe/authority_epoch_probe.m`](sources/probe/authority_epoch_probe.m) plus the exact
  current and legacy role configurations;
- [`sources/coordinator/main.m`](sources/coordinator/main.m), whose only behavior if mistakenly
  launched is a fixed refusal and exit 78;
- three complete unsigned bundles in `dist/` for the current Supervisor probe, stable legacy
  Supervisor probe, and no-launch current Coordinator;
- exact Info plists, role-specific entitlement requests, and disabled LaunchAgent input;
- current Supervisor/Coordinator unprovisioned profile-request inputs and the metadata-only legacy
  I2B3 profile reference;
- an explicitly inactive
  [`SupervisorAuthorityDescriptorV0` input](descriptors/supervisor-authority-descriptor-v0.input.json)
  that refuses activation while E1 values remain unresolved;
- [`manifest.json`](manifest.json), which binds every retained file other than itself by path,
  size, mode, and SHA-256; and
- independent verification and 23 negative/mutation cases in `scripts/`.

The descriptor is an experiment input, not a production protocol object. It deliberately leaves
the initial-absence value, installation/release/trust bindings, current profile identities,
signed CDHashes and requirements, container URL digests, bootstrap schemas, state-engine identity,
and owner-lock mechanism unresolved. Inventing those values in E0 would erase the E1 review gate.

## Reproduce and verify

Requirements are the recorded macOS arm64/Xcode 26.6/SDK 26.5/Apple clang 21.0.0 construction
toolchain, Node.js 22.22.1 through `fnm`, and standard macOS `plutil`/`otool` tools.

```sh
./experiments/macos-installation-i2b3-supervisor-authority-epoch-e0/scripts/reproduce.sh
```

The reproducer:

1. refuses an unrecorded clang/SDK pair;
2. builds all bundles twice without UUIDs or code-signature load commands;
3. compares both bundle trees recursively;
4. regenerates the closed manifest;
5. independently verifies identities, closed maps, unresolved fields, plists, entitlements,
   bundle bytes/modes, unsigned Mach-O load commands, and the no-effect boundary; and
6. proves missing/extra/substituted/unknown/mixed/sequence/wrong-Team/wrong-group/wrong-service/
   path-bearing/active/cap/symlink mutations refuse.

## Next gate

E1 remains `BLOCKED`. A later task must separately name and authorize the owner-controlled Mac,
current host/toolchain facts, development profiles, one legacy negative profile, evidence
workspace, exact E1-01 through E1-12 and E1-14 through E1-15 mutations, and cleanup. It must pin
this packet's immutable archive commit and manifest digest and stop again before any Keychain,
service registration, protected root, owner/store, runtime, backend, VM, or guest work.
