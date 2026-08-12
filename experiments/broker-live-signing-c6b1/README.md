# C6b1 unsigned Approval Broker evidence harness

Date: 2026-08-11

Scoped construction status: `PASSED`.

Parent owner-only hostile-`.mjs` internal alpha: `IN_PROGRESS — TRENDING_GOOD`.

Installed Broker signing evidence, authenticated product consumers, the installed security
boundary, and product admission: `BLOCKED`.

## Question

Can Capsule retain an exact, independently verifiable, unsigned Broker evidence target and
composite fixture without accessing a credential, Keychain, LocalAuthentication, Secure Enclave,
installed service, product consumer, runtime, backend, VM, or guest?

For this exact construction, yes. This result is a deterministic no-credential preparation for a
later, separately authorized installed experiment. It is not signing or installed evidence.

## Defensive and authorized scope

This experiment is defensive, repository-local, and fixture-only. It uses immutable public data
from `Shrimpworks/capsule-corp` commit
`88f3a2c1f968b1aa604ce14a2db4389822e5b193` and a public P-256 test vector. It does not enumerate,
read, create, update, sign with, or delete an Apple identity, provisioning profile, private key,
Keychain item, credential, biometric record, or account. It does not invoke Security.framework,
LocalAuthentication, a prompt, a listener, XPC, Service Management, an installed app, a product
store, a runtime, a backend, a VM, or a guest.

The requested entitlement files are inert inputs only. They are not effective entitlements,
profile evidence, a signature, installation authorization, or an accepted product identity.

## Retained construction

The Swift package contains:

- `CapsuleC6b1BrokerEvidence`, an unsigned executable that verifies the closed fixture and emits a
  content-free result;
- `CapsuleC6b1BrokerNativeShim`, an Objective-C inert native target that imports no authority API;
- a one-interaction state machine with an exact one-sign budget, generation rejection, and terminal
  context/budget clearing;
- a retained-signature test double that accepts only the frozen `Sig_structure` digest and owns no
  private key or credential; and
- Swift tests for public-only signature verification, message/signature mutation, authorization
  substitution, one-sign enforcement, cancellation, and stale callbacks.

The deterministic fixture binds:

- the exact 527-byte ordinary ExecutionPlan, 89-byte SourceManifest, and 50-byte `main.mjs` from the
  pinned Capsule commit;
- the complete ADR-0043 projection, six warnings, digest/length-only inline input, and reversible
  ASCII-safe source display;
- a 77-byte canonical public-only P-256 COSE_Key and `kid = SHA-256(COSE_Key)`;
- the closed 12-field ApprovalGrant payload, exact protected header, `Sig_structure`, 64-byte raw
  `R || S` public test signature, and tagged embedded COSE_Sign1 envelope;
- a 300-second synthetic fixture-clock interval that explicitly permits no live use;
- the full public-only test authorization projection; and
- a stable future C6b1b Supervisor seam interface.

The fixture private scalar was not retained. The known answer uses the public SEC 2 P-256 generator
point and a fixed public test signature. The executable and both verifiers possess only public
coordinates and the retained signature.

## Authority and replay boundary

The Supervisor durable `SubmitApprovalV0` commit is the sole approval-authority linearization
point. The Broker may hold only bounded process memory. This experiment creates no Broker journal,
cache, recovery store, replay ledger, durable record, or state authority.

The stable [Supervisor seam](interfaces/supervisor-seam-v0.json) preserves these future C6b1b
oracles:

- `SubmitApprovalV0` replay identity is canonical payload plus resolved signer-authorization
  identity; response loss converges to no record or the same `ApprovalID` and current state;
- `RequestAttemptV0` is one Supervisor atomic consume/create transaction; response loss converges
  to no effect or the same `AttemptID`, never a second attempt; and
- exact or mathematically equivalent signatures do not create separate approval identity.

C6b1b may implement a test-only Supervisor seam against this interface. It must not retrofit a
durable Broker authority or activate an installed listener/product consumer.

## Candidate-only inputs

The requested bundle ID is `com.capsulecorp.capsule.broker.c6b1`. The requested access group is
`3DDR84M4JS.com.capsulecorp.capsule.broker.approval.epoch-7`. The requested effective-entitlement
projection contains App Sandbox plus that one group and explicitly excludes App Groups, network,
user-file, hypervisor, JIT, unsigned-memory, disabled-library-validation, automation,
`get-task-allow`, and temporary exceptions.

`kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly` and
`kSecKeyAlgorithmECDSASignatureMessageRFC4754SHA256` remain experiment candidates only. The
fixture selects no fallback, and their names do not prove platform availability or behavior.

## Reproduction

Use Node.js 22 or newer and the installed Swift toolchain:

```sh
node scripts/generate-fixtures.mjs
node scripts/verify.mjs
plutil -lint inputs/CapsuleC6b1BrokerEvidence.entitlements inputs/Info.plist.template
swift test
swift run capsule-c6b1-broker-evidence --fixture-root "$PWD"
```

To intentionally regenerate deterministic derived files after a reviewed source change:

```sh
node scripts/generate-fixtures.mjs --write
```

The generator check and independent verifier do not import each other. The verifier independently
decodes canonical CBOR, closes maps and file inventories, checks all digests and bindings, verifies
the public signature, rejects bounded mutations, validates requested-entitlement exclusions, and
rejects live-authority API imports.

## Limitations and next action

This experiment observes no signed target, effective entitlements, provisioned profile, access
group, Keychain mode, Secure Enclave operation, LocalAuthentication behavior, user interaction,
installed identity, update, process death, authenticated IPC, Supervisor durable commit, or product
consumer. Its fixture clock and public test key cannot be used as live approval authority.

Next, C6b1b may build the separately reviewed test-only Supervisor seam using the frozen interface.
Only after both construction slices pass may an owner separately authorize identity/profile
readback. Key creation, prompts, signing, installation, and destructive rows require another exact
authorization. Product wiring remains `BLOCKED`.
