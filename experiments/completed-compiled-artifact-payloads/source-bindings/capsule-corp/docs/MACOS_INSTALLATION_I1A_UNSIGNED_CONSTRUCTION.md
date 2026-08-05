# macOS installation I1A unsigned construction result

Date: 2026-08-04

```text
Work item: I1A unsigned no-guest application construction
Status: PASSED
Scope: one deterministic visible Swift status app and the exact I0 seven-role unsigned bundle
  tree; closed Info.plists, inactive launch-agent descriptors, role/service/entitlement
  projections, nested-code order, byte manifest, independent readback, and refusal fixtures
Evidence or reason: two clean local source/module-cache builds produced identical Broker Mach-O
  and complete bundle bytes; the checked-in manifest binds 23 files and readback refuses missing,
  mixed, extra, substituted, changed-mode, or changed-manifest input before returning the permanent
  inactive-signing refusal
Remaining work: Apple identity/profile authorization, signed effective entitlements and CDHashes,
  installed supported layout, private XPC, SMAppService, bootstrap, owner/store, IPC, runtime,
  backend, and guest work are excluded
Next action: submit a separate exact I1B/R3 credentialed authorization request after all selected
  Team-3DDR role profiles, signing inputs, entitlements, and constraint/placement bytes exist
Parent status: developer-signed installed I1 composition is BLOCKED
```

## Constructed tree and identities

The retained output is
`artifacts/macos-i1a-unsigned-app-shell/dist/Capsule.app`. It is not installed or launched.

| Required I0 role | Bundle/signing identity | Constructed byte identity |
| --- | --- | --- |
| visible Approval Broker/status app | `com.capsulecorp.capsule.broker` | Swift Broker SHA-256 `365b8ebb5bb7dbd8823db7cc292c1b5807baa0fda4d09ba2d2905df7bee3cd5f` |
| daemon agent | `com.capsulecorp.capsule.daemon` | non-executable test-only placeholder SHA-256 `d1b57d60e078a0812315bf14c381f6dda4480b97ecda6b7fcff1694b35dc0e5a` |
| Execution Supervisor agent | `com.capsulecorp.capsule.supervisor` | non-executable test-only placeholder SHA-256 `88f8a2f45ff653ef93b8808a8c3be7f063e02052799014fac2910de8b9126fc2` |
| daemon Source Validator launcher | `com.capsulecorp.capsule.source-validator.daemon.v1` | merged R2 SHA-256 `4bc270c84f166dfb077d84458940411073f3c70a7f70db2e4af48601500b36cc` |
| daemon parser child | `com.capsulecorp.capsule.source-validator-parser.daemon.v1` | merged R2 SHA-256 `f54c349e3a61b06e0b4d482bc1ed28924ffe712a7ff2531f504e7b57917defc7` |
| Broker Source Validator launcher | `com.capsulecorp.capsule.source-validator.approval-broker.v1` | merged R2 SHA-256 `81284de5ba54e2288602bee4e9aca4e4513211b560bacfd1286b7ab57c922613` |
| Broker parser child | `com.capsulecorp.capsule.source-validator-parser.approval-broker.v1` | merged R2 SHA-256 `7abac7da99f4b9edef77bb5ecfff135e8b752e5ed656664632272079b5408577` |

The complete bundle-manifest SHA-256 is
`5bd80097775908031b1a4c90680e8c7656cc5e9f97df2cc187592f75ee67a56f`.
The exact R2 inactive-policy digests remain
`c198dac71f3b5c2d2e8cca34fc3e9c01ff7b8093ef1a881d8160a34800ff1098`
for daemon and
`b0ce8504190b5fe9b0a0296c22340a6439ab453cb32f32c19ddb6e594698568d`
for Broker.

## Visible shell and permanent refusal

The AppKit surface displays only hard-coded typed installation facts. It prominently states
`UNSIGNED CONSTRUCTION CHECKPOINT` and `Execution: DISABLED`, identifies Team `3DDR84M4JS` only as
inactive intended development metadata, and provides no button or code path for approval,
registration, bootstrap, XPC, process creation, runtime, backend, or guest activity.

The daemon and Supervisor placeholder files are role-distinct plain text with no executable mode.
Their closed launch-agent descriptors are also `Disabled`, not registered, and not evidence that
the exact placement is supported. The R2 launchers retain inactive resource policies and refuse
without spawning. Canonical I0 activation therefore returns `signing-profile-inactive` even for an
otherwise exact inventory.

No entitlement is applied to a binary in I1A. The exact I0 entitlement set is retained as an
expected inactive projection, including unresolved Keychain/App Group/parser-inheritance values;
it is not signed entitlement evidence.

## Evidence and refusal coverage

The construction evidence records Apple Swift 6.3.3, the macOS 26.5 SDK, arm64 macOS 14 target,
two clean-directory byte equality, identity-free linker signing, manifest identity, and the exact
limitations. Readback independently compares the canonical I0 fixture, closed source templates,
R2 evidence identities, modes, every file digest, metadata projections, and the external manifest
digest. Focused tests mutate temporary copies only and prove refusal for:

- a missing required parser role;
- daemon/Broker parser mixing;
- any extra file;
- daemon/Supervisor placeholder substitution;
- changed executable/data modes; and
- replacement of the manifest itself.

No test launches any retained program or uses a network, Keychain, Apple credential, service,
runtime, backend, or guest.

## Separate I1B/R3 authorization request

I1B and Source Validator R3 must be a new credentialed task. Its request must name the exact
selected Apple Development identity and prove subject OU and emitted TeamIdentifier
`3DDR84M4JS`; provide exact role-specific Mac App Development profiles, profile UUIDs and
entitlement digests outside Git; freeze effective role entitlements, launch/library constraints,
App Group/private-service choice, and supported bundle placement; and explicitly authorize the
bounded Keychain/signing/install/service mutations. It must still keep execution disabled and use
no runtime, backend, guest, user source, or arbitrary code.

I1A neither makes nor implies that authorization.
