# Gate A2: deterministic CBOR and COSE_Sign1 interoperability

Decision: **CONDITIONAL PASS** for the bounded `ApprovalGrant` format question on 2026-07-31.

This is development-only research. Nothing here is a production Capsule component, security
boundary, canonical product contract, or source of authoritative receipt claims. Product code must
not import it.

- Owner: Capsule architecture / Gate A2 spike owner.
- Project baseline: `9bfd2acedbccfbe851f797edc06eb447733188e3`.
- Integrated first-wave evidence baseline: `01c5506170e1cde6838819b2b85b97a6015be49e`.
- Removal/replacement condition: replace this experiment when an accepted serialization ADR,
  reviewed production profile, CDDL contract, and maintained conformance/fuzz suite cover every
  signed object. Remove it if that profile selects another format.

## Bounded question and threat

Can Go, Swift, and TypeScript independently produce the same deterministic CBOR bytes for one
strict `ApprovalGrant` and exchange tagged COSE_Sign1 ES256 envelopes while rejecting dangerous
alternate representations and profile confusion?

The tested threat is parser or canonicalizer disagreement: two authorities must not approve
different meanings for the same signed object. This spike does not test key custody, freshness,
one-use consumption, installation migration, time rollback, or backend isolation.

## Exact profile exercised

- RFC 8949 deterministic CBOR with definite lengths and preferred integer/tag encodings.
- One twelve-field map with integer labels, an exact field set, and only strings, unsigned
  integers, and byte strings. Floats, optional fields, and arbitrary semantic tags are absent.
- RFC 9052 tagged COSE_Sign1 (`tag 18`), embedded payload, and an empty unprotected map.
- Exact protected headers: ES256 (`alg = -7`), the Capsule content type/version, and a byte-string
  key ID.
- ES256 is exactly 64 raw bytes (`R || S`); DER is rejected. Both mathematically valid low/high-S
  forms are accepted, and signature bytes are not semantic identity.
- The public RFC test key is fixture material and must never be used as production trust material.

## Implementations and environment

| Path | Version tested | Role |
| --- | --- | --- |
| Go | Go 1.26.5; `fxamacker/cbor` 2.9.1 | Deterministic producer, strict verifier, vector generator |
| TypeScript | Node 22.22.1; pnpm 10.28.2; TypeScript 5.9.2; `cbor2` 2.3.0 | Independent producer and strict verifier |
| Swift | Apple Swift 6.3.3; CryptoKit; `thecoolwinter/CBOR` 1.1.2 | Independent native producer and strict verifier |
| Host | macOS 26.5.2 (25F84), Apple silicon arm64 | Local license-free execution |

No Apple Developer Program membership, Developer ID certificate, provisioning profile,
notarization, production entitlement, or Secure Enclave access-control claim was used or required.
SwiftPM required a narrow sandbox exception in the managed Codex environment because it invokes its
own build sandbox.

The Go path uses the standard library for P-256 signing and verification. TypeScript uses Node's
crypto implementation. Swift uses CryptoKit. The COSE profile wrapper is deliberately small and
manual in all three paths; that reduces generic format surface but means the wrapper itself still
needs production review and fuzzing.

## Retained checks and observations

All three producers emitted identical payload and protected-header bytes. Every Go, TypeScript, and
Swift verifier accepted fresh envelopes from all three producers. Go generated the retained fixture
set under `fixtures/go-vectors.json`; the other languages consumed it independently.

The three verifiers accepted the complementary-S form according to the selected accept-both policy
and rejected all twelve negative vectors:

- tampered signature and DER-encoded signature;
- missing tag, non-preferred tag encoding, and trailing top-level data;
- a non-preferred integer encoding, an indefinite-length payload map, and a duplicate payload key,
  each inside an otherwise correctly signed envelope;
- an unprotected header, unknown protected header, non-ES256 protected algorithm, and a correctly
  signed wrong-purpose payload.

The final local test output included:

```text
Go:         verified=3
TypeScript: verified=3
Swift:      verified=3
Swift:      swiftPayloadMatchesGo=true
Swift:      swiftProtectedMatchesGo=true
Swift:      swiftVerifiesGo=true
Swift:      swiftNegativeVectors=12
```

The Swift CBOR dependency exposed a concrete integration hazard: its keyed and unkeyed generic
decoders delegate `Data` to Foundation's array-shaped Codable representation instead of the
library's byte-string specialization. The spike uses an explicit byte-string wrapper at those
boundaries. This is evidence that a production wrapper and differential suite are mandatory; using
the generic Codable surface directly would be unsafe.

## Reproduce

Install the pinned package dependencies first, then run:

```sh
./experiments/gate-a2-cbor-cose/run.sh
```

SwiftPM may need permission to run its nested build sandbox. The runner does not modify host trust,
Keychain state, launchd services, container state, or network policy.

## Decision and consequence

The narrow deterministic-CBOR + COSE_Sign1 direction is viable enough to continue. It solves the
specific cross-language canonical JSON failure from Gate A for the tested object and adversarial
representations. This is not yet approval to promote the experiment into production protocol code.

Before an ADR can freeze the production format:

1. define CDDL and byte-exact fixtures for every signed/registered object, not only
   `ApprovalGrant`;
2. add unknown-field, wrong-object, wrong-installation/epoch/registration/audience/attempt,
   resource-bound, nesting, malformed UTF-8, arbitrary-tag, and corpus-fuzz coverage;
3. independently review the narrow COSE wrappers and the Swift byte-string workaround;
4. pin dependency provenance and add supply-chain policy; and
5. keep the registered exact payload bytes authoritative—never decode and re-encode after
   registration.

The appropriate architecture status is therefore **conditional pass with a production hardening
gate**, not “secure” or “production-ready.”
