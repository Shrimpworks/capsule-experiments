# Gate A2 profile-hardening spike

Decision: **CONDITIONAL PASS** for the bounded parser/profile question tested here on 2026-07-31.

This is disposable security research. Nothing in this directory is a production Capsule parser,
wire contract, signing authority, or evidence implementation. Product packages must not import it.

## Question

Does the proposed bounded deterministic-CBOR plus COSE_Sign1 direction remain viable when the
original `ApprovalGrant` profile is subjected to a larger resource-bound and confusion corpus, and
when the same profile pattern is applied to a second mutually exclusive signed object?

The second object is a spike-only `EnforcementTranscript` shape. It demonstrates object-profile
separation; it does not freeze or propose the final transcript fields.

## Retained experiment

- `go/` generates and verifies the corpus with `fxamacker/cbor` 2.9.1.
- `typescript/` independently verifies it with `cbor2` 2.3.0 and Node crypto.
- `swift/` independently verifies it with `thecoolwinter/CBOR` 1.1.2 and CryptoKit.
- `fixtures/corpus.json` is the exact 90-case snapshot used for the recorded result.
- `run.sh` runs the corpus through all three wrappers and exchanges fresh envelopes from every
  producer with every verifier for both object profiles.

The retained fixture uses the public RFC 7515 test P-256 key. It is test material only.

## Bounds and rules exercised

The spike wrapper rejects input above 4,096 envelope bytes before CBOR decoding, then limits the
protected header to 256 bytes and the embedded payload to 2,048 bytes. Go and TypeScript also set a
decoder nesting limit of 12; Swift's decoder is configured with the same recursion depth. Typed
identifier, digest, key ID, text, field-count, state, timestamp, purpose, audience, and binding
checks run before signature acceptance.

The retained cases cover:

- missing, wrong, nested, and non-preferred tags;
- duplicate keys, indefinite lengths, non-preferred integers/map/string lengths, map order, and
  trailing data;
- invalid UTF-8, floats, negative/unsafe integers, wrong types, unknown fields, nested values, and
  huge declared lengths;
- empty/nonempty/unrecognized protected and unprotected headers, wrong algorithm, content type,
  and key ID;
- object type, version, purpose, audience, installation, epoch, registration, plan, Supervisor,
  attempt, terminal state, and teardown-state confusion;
- detached/wrong body shapes, truncations, oversize raw input, 63/65/DER-shaped signatures,
  tampering, zero/out-of-range P-256 scalars, and both valid complementary-S forms; and
- valid `ApprovalGrant` presented to the transcript wrapper and the reverse.

The Go fuzz target seeds itself from every retained mutation and asserts that arbitrary inputs
cannot panic the bounded wrapper. This is a deterministic seed corpus, not a substitute for a
sustained coverage-guided campaign.

## Reproduce

Install the pinned TypeScript packages once:

```sh
cd experiments/gate-a2-profile-hardening/typescript
fnm exec --using=22.22.1 -- corepack pnpm install --frozen-lockfile --ignore-workspace
```

Then run from the repository root:

```sh
./experiments/gate-a2-profile-hardening/run.sh
```

SwiftPM may require permission for its nested build sandbox. The runner does not access Keychain,
signing identities, notarization, launchd, containers, user content, or production trust state.

## Interpretation

The two-object, three-language result strengthens the Gate A2 direction. It does not satisfy
ADR-0019's production acceptance conditions. The exact findings, wrapper hazards, and freeze
conditions are in [RESULTS.md](RESULTS.md).
