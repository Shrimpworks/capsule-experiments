# E1 App Group namespace preflight

Date: 2026-08-11

```text
Work item: C3b/E1 exact portal-identity preflight
Status: PASSED
Scope: immutable E0, restored legacy profile, owner-host, and exact unsubmitted App Group-form
  projection only
Developer-portal registration path for the macOS-style App Group ID: NO_GO
Exact ADR-0045/E0 macOS-style App Group identity candidate: BLOCKED on signed execution evidence
C3b E1 platform mutation matrix: BLOCKED
Parent installed owner-lock G3/I2B: BLOCKED
ADR-0045 lifecycle: Proposed
Product admission: BLOCKED
```

## Question and result

Can the exact frozen E0 App Group identity
`3DDR84M4JS.com.capsulecorp.capsule.bootstrap.authority-e1` be registered unchanged through the
Apple Developer portal before any E1 bundle, container, or sentinel mutation?

The preflight answer is `NO_GO` only for registering that macOS-style identifier through the
Developer website's App Group form. On the authenticated Team `3DDR84M4JS`
App Group registration form, entering the frozen value produced the portal identifier preview
`group.3DDR84M4JS.com.capsulecorp.capsule.bootstrap.authority-e1`. The form owns the `group.`
namespace and would not register the frozen byte string unchanged. The task stopped without
pressing Continue or Register and without creating an App Group, App ID, profile, or other portal
resource.

The original interpretation was too broad. Apple's App Groups entitlement documentation states
that macOS also supports `<team identifier>.<group name>` identifiers and that those identifiers
do not need registration on the Developer website. Apple Developer Technical Support separately
describes the same macOS-style form and distinguishes it from registered `group.<group name>`
identifiers. The frozen ADR-0045/E0 value already has the documented macOS-style form; it is not
rejected by this form observation. Its platform behavior remains `BLOCKED` on exact signed-profile
and E1 execution evidence.

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

## Corrected decision and next action

Do not register or substitute an iOS-style `group.` identifier. Preserve the exact frozen
macOS-style value. The next no-container gate is to create/read back only the two explicit App IDs
and development profiles, sign the existing E0 Supervisor and no-launch Coordinator artifacts,
embed the exact profiles, and verify that the signed code claims the frozen macOS-style group and
role-specific Keychain groups while the profile/code-signature association is determinate. Stop
again before bundle launch if that projection does not validate. If it passes, obtain a fresh
owner authorization for E1-01..E1-12/E1-14..E1-15. E1-13 remains excluded.

## Primary sources and evidence classes

- [Apple App Groups entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.application-groups): documented mechanism; macOS supports
  `<team identifier>.<group name>` and does not require Developer-website registration for it.
- [Apple DTS: Code Signing Identifiers Explained](https://developer.apple.com/forums/thread/811970): Apple-staff explanation; distinguishes registered iOS-style IDs from macOS-style IDs.
- Portal form observation retained here: exact-host observation; proves only that the registration
  form creates an iOS-style `group.` identifier and cannot register the frozen bytes unchanged.

## Verification

```sh
node experiments/macos-installation-i2b3-supervisor-authority-epoch-e1-app-group-preflight/scripts/verify.mjs
```
