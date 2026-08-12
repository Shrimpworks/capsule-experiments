# C6b1a handoff

Scoped status: `PASSED` for unsigned, no-credential Broker harness construction.

Parent owner-only hostile-`.mjs` internal alpha: `IN_PROGRESS — TRENDING_GOOD`.

Installed Broker signing, authenticated product consumers, installed security composition, and
product admission: `BLOCKED`.

## Retained artifacts

- source input: `Shrimpworks/capsule-corp` commit
  `88f3a2c1f968b1aa604ce14a2db4389822e5b193`;
- generated fixture identity: `fixtures/manifest.json` and its `compositeSha256`;
- complete experiment identity: `experiment-manifest.json` and its `compositeSha256`;
- future test-only Supervisor interface: `interfaces/supervisor-seam-v0.json`;
- candidate request inputs: `inputs/`; and
- executable/test sources: `Package.swift`, `Sources/`, and `Tests/`.

## Verification

```sh
node scripts/generate-fixtures.mjs
node scripts/verify.mjs
plutil -lint inputs/CapsuleC6b1BrokerEvidence.entitlements inputs/Info.plist.template
swift test
swift run capsule-c6b1-broker-evidence --fixture-root "$PWD"
```

## C6b1b coordination boundary

C6b1b may consume the seam JSON and fixture digests only in a non-product test harness. It must
prove Supervisor durable commit/replay/response-loss/crash convergence without an installed
listener. It must preserve canonical payload plus resolved signer authorization as approval replay
identity and one atomic Supervisor approval-consume/attempt-create transaction. It may not add a
Broker journal, store, recovery owner, or durable authority.

## Limitations

No Apple identity/profile, signed artifact, effective entitlement, Keychain item, private key,
Secure Enclave operation, LocalAuthentication context/prompt, user account/container, listener,
installed process, Supervisor durable store, runtime/backend/VM/guest, or product consumer was
created, inspected, or used. Candidate algorithm/accessibility names remain unproved with no
fallback. Separate owner authorization is required before identity readback and again before any
mutation/signing matrix.
