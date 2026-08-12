# E1 App Group namespace preflight

Date: 2026-08-11

```text
Work item: C3b/E1 exact portal-identity preflight
Status: PASSED
Scope: immutable E0, restored legacy profile, owner-host, and exact unsubmitted App Group-form
  projection only
Exact ADR-0045/E0 App Group identity candidate: NO_GO
C3b E1 platform mutation matrix: BLOCKED
Parent installed owner-lock G3/I2B: BLOCKED
ADR-0045 lifecycle: Proposed
Product admission: BLOCKED
```

## Question and result

Can the exact frozen E0 App Group identity
`3DDR84M4JS.com.capsulecorp.capsule.bootstrap.authority-e1` be registered unchanged through the
Apple Developer portal before any E1 bundle, container, or sentinel mutation?

The preflight answer is `NO_GO` for that exact candidate. On the authenticated Team `3DDR84M4JS`
App Group registration form, entering the frozen value produced the portal identifier preview
`group.3DDR84M4JS.com.capsulecorp.capsule.bootstrap.authority-e1`. The form owns the `group.`
namespace and would not register the frozen byte string unchanged. The task stopped without
pressing Continue or Register and without creating an App Group, App ID, profile, or other portal
resource.

This is a candidate-level disposition, not an E1 control result. The E1 matrix remains `BLOCKED`
until ADR-0045 and E0 are revised to one actually provisionable, independently reviewed tuple and
a new owner authorization names its exact portal and platform mutations.

## Defensive boundary

The run was confined to the exact owned Mac, Team, immutable E0 packet, restored exact legacy
profile, and the unsubmitted Apple App Group form. It did not enumerate unrelated identities,
profiles, devices, or portal resources; sign, install, or launch a bundle; create or access a
container or sentinel; grant foreign-container consent; launch the Coordinator; register a
service; access Keychain or LocalAuthentication; or start a protected root, owner/store, runtime,
backend, VM, guest, approval, attempt, or product path.

## Inputs

- `capsule-experiments` base: `cd06bd84690a16bb4d0924a8a4cd64845ebb0159`.
- E0 archive merge: `dee784d40684100f8315720fab9a5cd3399f492b`.
- E0 manifest SHA-256:
  `b5d21ed3c2b14053325d5f1af66ceb59389e5fd31d8d2dd33274e8ca37525936`.
- Capsule governing commit: `16fb810b97e7ff2a157a251ae4dc8023dcfc01b4`.
- Host label `dsteele-shrimp-mbp18-4-01`; macOS 26.5.2 build `25F84`; arm64
  `MacBookPro18,4`; Xcode 26.6 build `17F113`; SDK 26.5; Apple clang 21.0.0; EUID
  501; active `gui/501` Aqua session.
- Restored legacy profile name `Capsule I2B3 Supervisor Bootstrap Development 3DDR`, UUID
  `c45a058b-ffdd-4a6b-bd8c-d746772a2702`, CMS SHA-256
  `964f79980edf22a7280fe19e52893a1e40b0a8639d5bbe3d5dc8fdfada9c6c76`, exact
  owner 501/mode 0600/12,565-byte readback.

No raw provisioning profile, device identifier, credential, private key, account email, or
browser session value is retained.

## Decision and next action

Do not silently remove, add, or relocate the `group.` or Team prefix and do not proceed with the
remaining C3b authorization. Revise Proposed ADR-0045 and E0 together after primary-source and
portal review selects the exact portal App Group identifier and exact effective-entitlement form.
Materialize and independently verify a successor E0 packet, then obtain a fresh owner
authorization for profiles, signing, and E1-01..E1-12/E1-14..E1-15. E1-13 remains excluded.

## Verification

```sh
node experiments/macos-installation-i2b3-supervisor-authority-epoch-e1-app-group-preflight/scripts/verify.mjs
```
