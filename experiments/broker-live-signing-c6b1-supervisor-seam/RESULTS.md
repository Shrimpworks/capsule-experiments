# C6b1b Supervisor seam result

Date: 2026-08-11

Scoped status: `PASSED`.

Parent owner-only hostile-`.mjs` internal alpha: `IN_PROGRESS — TRENDING_GOOD`.

Installed signing, authenticated product IPC, protected product state, product consumers, and
product admission: `BLOCKED`.

## Result

The self-contained test-only seam passed six ordered durability/replay rows against a fixture
pinned to Capsule commit `88f3a2c1f968b1aa604ce14a2db4389822e5b193`:

1. approval response loss before commit retained zero authority;
2. approval response loss after commit reopened to the same `ApprovalID`;
3. complementary-signature replay returned the same `ApprovalID` without replacing the retained
   first envelope;
4. attempt response loss before atomic consume/create left the approval usable and created no
   attempt;
5. attempt response loss after atomic consume/create reopened to the same `AttemptID`; and
6. sixteen concurrent exact attempt requests returned one `AttemptID` and retained one consumed
   approval plus one attempt.

Reopen validation also rejected a deliberately cross-linked approval/attempt state. Race tests
passed. All generated roots were removed and verified absent after evidence capture.

The replay identity is canonical payload plus resolved signer-authorization identity. Signature
bytes are evidence, not approval identity. The Supervisor experiment store is the only durable
authority owner. The Broker has no journal, cache, store, or recovery operation.

## Evidence

- Fixture/interface: [`fixtures/supervisor-seam-v0.json`](fixtures/supervisor-seam-v0.json)
- Machine result: [`evidence/2026-08-11/result.json`](evidence/2026-08-11/result.json)
- Retained-file hashes (all experiment files except the checksum list itself):
  [`SHA256SUMS`](SHA256SUMS)
- Reproduction: [`scripts/verify.sh`](scripts/verify.sh)

Retained environment: Darwin/arm64, Go 1.23.4. No network, privilege, entitlement, identity,
credential, Keychain, LocalAuthentication, signing, installation, listener, product store,
lifecycle effect, runtime, backend, VM, or guest was used.

## Decision and limits

C6b1b construction is `PASSED`. No new ADR is required. Accepted ADR-0043 remains governing;
ADR-0024 and ADR-0021 remain Proposed.

This is not installed or product durability evidence. C6b1a's unsigned Broker harness, C6b1c
identity/profile readback, C6b1d installed signing matrix, installed authenticated IPC, protected
state, and product wiring remain separately `BLOCKED`.
