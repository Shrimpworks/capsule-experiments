# Gate A: signing and canonicalization interoperability

Decision: **FAIL** against the Gate A pass condition on 2026-07-31.

This is a development-only research spike. Nothing here is a production Capsule component,
security boundary, or source of authoritative receipt claims. Product code must not import it.

- Owner: Capsule architecture / Gate A spike owner.
- Authoritative repository baseline: `9bfd2acedbccfbe851f797edc06eb447733188e3`
  (`Document hardened architecture and spike plan (#7)`).
- Removal/replacement condition: remove this experiment after a replacement serialization ADR is
  accepted and its cross-language conformance suite covers these fixtures, or after a maintained
  Swift RFC 8785 implementation passes a rerun of Gate A.

## Hypothesis and gate

Hypothesis: maintained Go, Swift, and TypeScript paths can strictly reject ambiguous JSON, produce
identical RFC 8785 bytes, and exchange flattened JWS JSON Serialization ES256 signatures under one
deny-by-default Capsule profile.

The gate in `docs/FEASIBILITY_SPIKES.md` passes only if **all three** implementations produce or
verify one normative vector set with identical payload bytes and fail the complete negative set.
The threat being tested is parser, canonicalizer, algorithm, or object-purpose disagreement that
lets two authorities approve different meanings for the same purported signed object.

## Environment and retained paths

Observed locally, not inferred:

| Component | Version/path tested |
| --- | --- |
| Baseline | exact commit `9bfd2ac` |
| Host | macOS 26.5.2 (25F84), Darwin 25.5.0, arm64 T6000 |
| Go | 1.26.5 darwin/arm64; `go-jose/v4` 4.1.4; `gowebpki/jcs` 1.0.1 |
| Swift | Apple Swift 6.3.3, target arm64-apple-macosx26.0; Foundation and CryptoKit |
| TypeScript | Node 22.22.1; pnpm 10.28.2; TypeScript 5.9.2; `jose` 6.2.5; `canonicalize` 3.0.0 |
| Other | OpenSSL 3.6.3; Apple Git 2.50.1 |

The host's default Node was 16.15.0 and could not run pnpm 10; the experiment deliberately uses
the repository-compatible Node 22 pin. SwiftPM's nested `sandbox-exec` was denied inside the
workspace sandbox, so the Swift build/run required the narrow `swift run GateASwiftProbe` sandbox
exception. The compiler and package then ran successfully; no Swift result below is fabricated.

Maintained/relevant primary implementation paths evaluated:

- Go: [`go-jose/go-jose`](https://github.com/go-jose/go-jose) and
  [`gowebpki/jcs`](https://github.com/gowebpki/jcs).
- TypeScript: [`panva/jose`](https://github.com/panva/jose) and the RFC 8785-listed
  [`canonicalize`](https://github.com/erdtman/canonicalize) implementation.
- Swift runtime: Apple's maintained
  [`CryptoKit.P256.Signing.ECDSASignature`](https://developer.apple.com/documentation/cryptokit/p256/signing/ecdsasignature)
  and Foundation JSONSerialization. Candidate inspection also covered
  [`jose-swift` 6.0.4](https://github.com/beatt83/jose-swift/tree/6.0.4) and
  [`JOSESwift`](https://github.com/airsidemobile/JOSESwift). JOSESwift documents compact JWS only;
  jose-swift supports JSON serialization, but its ES256 verifier accepts either raw or DER input
  ([source at inspected commit](https://github.com/beatt83/jose-swift/blob/b7d3ef55660fefd045641293bc95d4cdc07a15d8/Sources/JSONWebAlgorithms/Signatures/EC/Verifiers/ES256Verifier.swift))
  and its generic verify path has an empty-signature `none` case
  ([source](https://github.com/beatt83/jose-swift/blob/b7d3ef55660fefd045641293bc95d4cdc07a15d8/Sources/JSONWebSignature/JWS%2BVerify.swift)). These observations require a Capsule wrapper; the Swift
  third-party candidate was inspected, not linked into the runtime probe.

## Standards constraints

These are standards facts, separate from the local observations:

- [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html) requires I-JSON input, preservation of
  Unicode without normalization, ECMAScript-compatible number serialization, UTF-16 property-name
  sorting, and UTF-8 output. Its Appendix G lists Swift neither as an open-source implementation nor
  as an implementation-in-progress.
- [RFC 7515](https://www.rfc-editor.org/rfc/rfc7515.html) defines JWS JSON Serialization and requires
  understood/processed critical protected headers; overlapping JOSE header names must be rejected.
- [RFC 7518](https://www.rfc-editor.org/rfc/rfc7518.html#section-3.4) defines an ES256 JWS signature as
  exactly 64 octets: fixed-width 32-byte `R` followed by fixed-width 32-byte `S`.
- [RFC 8725](https://www.rfc-editor.org/rfc/rfc8725.html) requires callers to allowlist algorithms
  and recommends mutually exclusive validation rules, explicit types, and audience validation to
  prevent cross-JWT confusion. The same confusion controls apply to Capsule's JOSE profile.

## Prototype and commands

The retained fixtures use the public RFC 7515 Appendix A.3 test key. It is test material and must
never be used as a production key.

- `fixtures/canonicalization.json`: RFC number/Unicode cases plus duplicate, invalid-scalar,
  out-of-range number, trailing-data, and canonical-on-wire cases.
- `fixtures/jws.json`: one exact protected header/payload and valid signatures produced by Go,
  TypeScript, and Swift. ECDSA signatures are nondeterministic, so equality of signature bytes is
  neither expected nor required.
- `go/` and `typescript/`: disposable strict-profile wrappers and adversarial tests.
- `swift/`: framework-only CryptoKit/Foundation probe for the crypto and native JSON boundaries.
- `run.sh`: scoped runner. In this managed workspace, run its Swift command with the noted sandbox
  exception.

Commands used:

```sh
cd experiments/gate-a-signing-canonicalization/go
GOCACHE=/private/tmp/capsule-gatea-go-cache go test ./...

cd ../typescript
fnm exec --using=22.22.1 -- corepack pnpm install --frozen-lockfile --ignore-workspace
fnm exec --using=22.22.1 -- corepack pnpm check
fnm exec --using=22.22.1 -- corepack pnpm test

cd ../swift
CLANG_MODULE_CACHE_PATH=/private/tmp/capsule-gatea-clang-cache \
SWIFTPM_MODULECACHE_OVERRIDE=/private/tmp/capsule-gatea-swiftpm-cache \
swift run GateASwiftProbe
```

## Observed results

The following claims are direct test or source-inspection observations:

| Area | Go | TypeScript | Swift | Result |
| --- | --- | --- | --- | --- |
| RFC 8785 core, UTF-16 sort, NFC/NFD preservation | Passed with pinned JCS package and wrapper | Passed with pinned `canonicalize` and wrapper | Foundation emitted different number bytes | **Fail** |
| Duplicate keys | Rejected before ordinary decode | Rejected by spike lexical pass before `JSON.parse` | Foundation collapsed `{"a":1,"a":2}` to one key, value `1` | **Fail without a separate strict parser** |
| Invalid UTF-8/lone surrogates | Rejected | Rejected | Foundation rejected tested cases | Pass for tested vectors |
| Numeric edge policy | Safe integers pass; unsafe integers, overflow, underflow rejected by wrapper | Same | Foundation spellings differed for RFC vector | **Fail** |
| Canonical-on-wire | Alternate exponent, `-0`, fraction, whitespace, and key order rejected | Same | No conforming canonicalizer path | **Fail** |
| RFC 7515 Appendix A.3 ES256 | Verified; raw length 64 | Verified; raw length 64 | CryptoKit verified; raw length 64 | Pass |
| Cross-language ES256 production | Verified Go, TS, Swift samples | Verified Go, TS, Swift samples | Verified Go, TS, retained Swift samples and produced a new sample | Pass |
| Raw versus DER | Profile rejected DER before JOSE | `jose` and profile rejected DER | CryptoKit converted DER/raw; profile boundary rejects DER by length | Pass with wrapper |
| Low/high-S | Both complementary forms verified | Both verified | Both verified | Pass for selected accept-both policy |
| Tampering/malformed length/base64url | Rejected | Rejected | Crypto primitive cases verified; no full Swift profile parser retained | Partial |
| `none`/unknown algorithm | Exact ES256 allowlist rejected | Exact ES256 allowlist rejected | Candidate library needs an explicit wrapper | Partial |
| Unknown `crit`, `jwk`, `jku`, `x5u`, unknown/unprotected fields | Validly signed forbidden headers rejected by exact allowlist | Same | Candidate inspection shows wrapper is necessary; not runtime-tested end to end | Partial |
| Cross-object/confused deputy | Valid signatures with wrong type, purpose, audience, installation, epoch, registration, or attempt rejected | Same | No full Swift profile parser retained | Partial |

The final scoped runs passed Go tests, TypeScript type checking, and **55 TypeScript tests** with no
failures. The Swift probe reported, among other successful assertions:

```text
rfc7515RawES256=true
crossLanguageProfileJWS=true
highAndLowSAccepted=true
profileRejectsDERByLength=true
foundationCollapsesDuplicateKeys=true
foundationDuplicateValue=1
foundationJSON={"numbers":[333333333.33333331,1e+30,4.5,0.002,0.000000000000000000000000001]}
foundationMatchesRFC8785=false
foundationRejectsLoneSurrogate=true
foundationRejectsInvalidUTF8=true
```

Two library-specific cautions were also observed. `gowebpki/jcs` needed pre-validation for invalid
UTF-8 and the Capsule numeric range/underflow policy. TypeScript needed a strict pre-parser because
ordinary `JSON.parse` cannot report duplicate names. The lexical parser retained here is deliberately
small spike code, not a reviewed bounded production parser.

## Decision and policy consequences

**Gate A fails. JCS + JWS is not viable as currently planned.** JWS JSON Serialization with ES256 is
interoperable, but the gate is conjunctive: there is no tested maintained Swift RFC 8785 path, the
native Foundation serializer demonstrably produces different numeric bytes, and the complete Swift
negative profile was therefore not achieved. An external search found no credible maintained Swift
RFC 8785 library; that absence is an evidence-bounded search result, not proof that none exists.

Selected ES256 policy for any follow-up profile: accept either mathematically valid low- or high-S
form, require exactly 64 raw `R || S` bytes, and never use signature/envelope bytes as the semantic
identity or replay key. Use the plan digest, grant ID, registration, and attempt nonce instead.
RFC 7518 specifies the width but not low-S normalization, and all three tested crypto paths accepted
the complement. Requiring low-S would add producer normalization that CryptoKit/Secure Enclave has
not been shown to provide. DER may exist only at a platform API boundary and must be converted to
raw before serialization; a verifier rejects non-64-byte wire input before calling a permissive
library.

## Smallest safer fallback

The leading fallback should become a new **Gate A2**, not be declared production-ready from this
spike: deterministic CBOR payload bytes plus tagged COSE_Sign1 with ES256 for signed and registered
authority objects. Keep public proposal JSON if desired; move only objects whose exact bytes cross
trust boundaries.

[RFC 8949 section 4.2](https://www.rfc-editor.org/rfc/rfc8949.html#section-4.2) defines core
deterministic encoding: shortest preferred encodings, no indefinite-length items, and map keys sorted
by the bytewise lexical order of deterministic encodings. It also warns that attacked inputs cannot
safely use decoders that silently lose duplicate map entries
([section 5.6](https://www.rfc-editor.org/rfc/rfc8949.html#section-5.6)).
[RFC 9052](https://www.rfc-editor.org/rfc/rfc9052.html#section-4.2) defines tagged COSE_Sign1, and
[RFC 9053](https://www.rfc-editor.org/rfc/rfc9053.html#section-2.1) assigns ES256 algorithm `-7`.
The protected COSE map is carried as the exact byte string used in signature computation, avoiding
re-canonicalization of protected headers.

The v0 fallback contract should be narrower than generic CBOR:

- tagged COSE_Sign1 only; embedded payload only; ES256 only;
- deterministic CBOR with definite lengths and preferred shortest encodings;
- integer map labels, exact field set and types, no floats, no NaN/infinities, no bignum/semantic
  tags unless a future version explicitly adds them, and duplicate map keys rejected before loss;
- exact protected-header allowlist containing algorithm, Capsule content type/version, and key ID;
  no authority-bearing or key-discovery values in unprotected headers;
- purpose, audience, installation, epoch, registration, attempt, and object type/version remain
  typed payload fields with mutually exclusive schemas;
- `ExecutionPlan` identity is SHA-256 over exact deterministic CBOR payload bytes. The Supervisor
  stores those exact bytes, the Broker renders an independently decoded typed view from them, and
  execute still accepts only the registration ID;
- publish CDDL plus byte-exact positive and malformed fixtures alongside the existing public JSON
  Schemas.

Go has plausible maintained candidates in
[`veraison/go-cose`](https://github.com/veraison/go-cose) and
[`fxamacker/cbor`](https://github.com/fxamacker/cbor), whose documented options include core
deterministic encoding and configurable secure decoding. They are **candidates, not validated
results** here. No Swift/TypeScript CBOR/COSE interoperability claim is made yet.

## Concrete documentation/architecture tweaks

Do not broadly rewrite the accepted documents from this disposable spike. The smallest follow-up is:

1. Add a serialization ADR recording Gate A's failure and making the narrow deterministic-CBOR +
   COSE_Sign1 profile conditional on Gate A2.
2. In `docs/TECHNICAL_DESIGN.md`, replace the proposed JCS/JWS baseline with that conditional
   profile and retain all algorithm/header/object-binding rules.
3. In `docs/protocol/OBJECT_MODEL.md`, distinguish public JSON representations from internal signed
   canonical binary objects; replace `SignedEnvelope` with the exact COSE_Sign1 media/profile and
   add CDDL as a canonical binary contract alongside JSON Schema.
4. Keep ADR-0011 format-neutral but say the registered/digested bytes are the exact deterministic
   CBOR payload bytes and prohibit decode/re-encode after registration.
5. In ADR-0015, allow composed receipts to embed or reference COSE evidence and state that ECDSA
   signature bytes are never evidence identity because equivalent low/high-S signatures exist.
6. Link the retained Gate A evidence from the control-evidence matrix, without promoting PLAN-001 or
   EVID-001 beyond spike-observed status.

## Open risks and next smallest test

- No maintained Swift deterministic-CBOR + COSE implementation has yet been selected or tested.
- CBOR duplicate keys, non-preferred integer/length encodings, tags, indefinite lengths, map order,
  float widths/NaN, trailing bytes, and resource exhaustion can recreate parser differentials.
- COSE still needs exact algorithm/header/critical-label rules and cross-object negative tests.
- Secure Enclave production and DER/raw behavior, user presence, and hardware-backed keys belong to
  Gate B and were not tested.
- Freshness, time rollback, durable one-use consumption, and receipt composition were not tested.
- The public RFC test private key and every signature here are fixtures, never trust material.

Next smallest test: implement only the canonical `ApprovalGrant` payload and tagged COSE_Sign1
envelope in one maintained Go, Swift, and TypeScript candidate each. Require identical payload bytes
and verification of all three producer signatures, then reject duplicate maps, alternate encodings,
unknown/critical/unprotected headers, non-ES256 algorithms, DER/malformed raw signatures, both S
forms according to the selected policy, tampering, trailing bytes, and every confused-deputy field.
Do not change the production protocol until that Gate A2 fixture set passes all three paths.
