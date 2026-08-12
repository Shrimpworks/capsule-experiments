# C3a handoff

## Status

- C3a deterministic E0 fixture materialization: `PASSED`.
- C3b/E1 identity-separation execution: `BLOCKED`.
- Parent installed owner-lock G3/I2B: `BLOCKED`.
- ADR-0045: `Proposed`.
- Product admission: `BLOCKED`.

## Retained result

The archive retains exact current/legacy probe sources and unsigned bundles, a Coordinator bundle
that was never launched, Info/LaunchAgent plists, role entitlements, profile-request inputs,
selected legacy profile metadata, an inactive descriptor input, a closed file manifest,
construction evidence, independent verification, and bounded positive/negative/mutation proof.

The source Capsule input is commit
`88f3a2c1f968b1aa604ce14a2db4389822e5b193`. The legacy negative input is frozen as the public
metadata of profile `Capsule I2B3 Supervisor Bootstrap Development 3DDR`, UUID
`c45a058b-ffdd-4a6b-bd8c-d746772a2702`, CMS SHA-256
`964f79980edf22a7280fe19e52893a1e40b0a8639d5bbe3d5dc8fdfada9c6c76`; no profile bytes are
retained or used.

## Required C3b inputs

Before any E1 action, the orchestrator must pin this experiment's merged archive commit and
manifest digest and obtain exact owner authorization for:

1. the stable non-secret owner-Mac label and current OS/build/architecture/Xcode/SDK;
2. the current registered-device binding, with raw device identifier kept outside Git;
3. creation/readback of only the two epoch-one explicit App IDs and macOS App Development
   profiles, using an explicitly authorized Apple Development identity;
4. an owner-controlled non-ephemeral evidence workspace and final immutable archive destination;
5. E1-01 through E1-12 and E1-14 through E1-15 only, with E1-13 excluded;
6. exact sentinel-only container mutations and exact owner-probe cleanup; and
7. immediate stop on any prompt, wrong identity/entitlement/requirement, shared container,
   successful cross-mutation, path mismatch, unexpected state, or cleanup ambiguity.

The run must still stop before Coordinator launch, service registration, Keychain,
LocalAuthentication, Secure Enclave, protected root, owner/store, runtime, backend, VM, guest,
approval, or attempt activity.

## Unresolved by design

The inactive descriptor lists every value that cannot honestly be materialized in E0: the initial
absence encoding, installation/release/trust bindings, current profile identities, certificate,
signed CDHashes/effective entitlements/peer requirement, container URL digests, bootstrap object
schemas, state-engine identity, and owner-lock mechanism. C3b must retain observed values and must
not rewrite this E0 packet to pretend those values were known earlier.

## Verification

Run:

```sh
./experiments/macos-installation-i2b3-supervisor-authority-epoch-e0/scripts/reproduce.sh
git diff --check
```

After merge, verify the remote commit/tree and run the reproducer from a fresh checkout before
Capsule's canonical documentation links the result.
