# C6b1c Broker identity and signed-artifact readback

Date: 2026-08-11

```text
Work item: C6b1c disposable Broker identity/profile and signed-artifact readback
Status: PASSED
Scope: exact existing portal resource, selected Apple Development identity, unsigned harness build,
  one disposable code-sign operation, strict signature/requirement/effective-entitlement readback,
  and retained signed artifact only
Parent C6b1d installed Broker live-signing matrix: BLOCKED
Parent owner-only hostile-main.mjs internal alpha: IN_PROGRESS — TRENDING_GOOD
Product admission: BLOCKED
```

## Question

Can the merged unsigned C6b1a target be built and signed with the exact authorized Apple
Development identity while the provisioning profile remains only an allowlist and the app's code
signature claims exactly one Broker Approval Keychain group?

For this no-install/no-launch slice, yes. The retained app verifies strictly on the named Mac,
uses the hardened-runtime code-directory flag, and has exactly App Sandbox plus the single access
group `3DDR84M4JS.com.capsulecorp.capsule.broker.approval.epoch-7` in its signed entitlement blob.

## Defensive boundary

This task used only the exact owner-authorized Team, existing Broker App ID/profile, selected Apple
Development identity, merged public harness, and one disposable artifact under `/private/tmp`.
It did not install or launch the app; create, query, use, or delete a Capsule Approval key; invoke
LocalAuthentication; register a service; activate a Supervisor seam or product consumer; or start
a runtime, backend, VM, guest, approval, attempt, or product path.

The profile's wildcard Keychain entitlement is classified only as the provisioning allowlist. It
is not the app's effective claim. The signed app claim is the narrower exact group above.

## Exact inputs and observations

- `capsule-experiments` base: `cd06bd84690a16bb4d0924a8a4cd64845ebb0159`.
- C6b1a archive merge: `4a2447d4b6b6572a0a9007f693bc9ba6a327115a`.
- Capsule governing commit: `16fb810b97e7ff2a157a251ae4dc8023dcfc01b4`.
- Host label: `dsteele-shrimp-mbp18-4-01`; macOS 26.5.2 build `25F84`, arm64,
  `MacBookPro18,4`; Xcode 26.6 build `17F113`; SDK 26.5; Apple clang 21.0.0.
- App ID: `com.capsulecorp.capsule.broker.c6b1`.
- Active profile: `Capsule C6b1 Broker Evidence macOS Development epoch 7`, portal ID
  `XT8MS38HWV`, UUID `2e8d338c-5668-4d41-9eb3-eb29634ebecf`, CMS SHA-256
  `a00dca2e4cfb8d4d432ffbeeaa0cc616e74aa8294364286f28dfe998ae0e32ee`, expiry
  2027-08-11, one selected certificate and one registered Mac.
- Selected certificate SHA-1 `80A4969BCD1B3926020888094B9D812A283D3793`, SHA-256
  `D3E9FBDDBC342F747C3649B5A6FFB307A575827404E02D638C11B6B795A09629`, Team
  `3DDR84M4JS`.
- Unsigned executable SHA-256
  `a3abec2c686845b71b094c1810f9a673dc4806f317c95278e8e64a888d4fd46c`.
- Signed executable SHA-256
  `0a31663736678b0fccefb3f524209167aaed085b3c214cf8af2024a82ea38833`.
- Signed CDHash `029b8d5cabd38e1fde9e23564e4e5b1590cf569d`; full CodeDirectory digest
  `029b8d5cabd38e1fde9e23564e4e5b1590cf569dabc8bf1d307d7f80340c0431`.

The raw provisioning profile is not retained. A second portal download was requested, but host
privacy controls prevented the repository process from reopening `Downloads`; the task did not
bypass that control. The profile UUID/CMS digest above are the earlier exact local readback, and
the current portal readback confirmed the same active profile ID/name/App ID/expiry. The signed
artifact deliberately contains no embedded provisioning profile and therefore makes no installed
execution or Keychain-access claim.

## Verify

```sh
node experiments/broker-live-signing-c6b1c-signed-artifact-readback/scripts/verify.mjs
codesign --verify --deep --strict --verbose=4 \
  experiments/broker-live-signing-c6b1c-signed-artifact-readback/artifacts/CapsuleC6b1BrokerEvidence.app
codesign -d --entitlements - \
  experiments/broker-live-signing-c6b1c-signed-artifact-readback/artifacts/CapsuleC6b1BrokerEvidence.app
```

The strict `codesign` verification needs ordinary access to the host trust chain. It neither
launches the app nor uses its private key.

## Next gate

C6b1d remains `BLOCKED` on a new exact owner authorization for key creation, Keychain queries,
LocalAuthentication prompts, live signing, failure/race rows, and cleanup. C6b1c does not activate
an installed Broker, authenticated IPC, product consumers, or product admission.
