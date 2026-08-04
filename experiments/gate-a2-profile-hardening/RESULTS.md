# Gate A2 profile-hardening results

## Decision record

- **Spike:** deterministic CBOR/COSE object-profile hardening
- **Date:** 2026-07-31
- **Decision:** conditional pass for the tested profile mechanics
- **Contract consequence:** no format pivot is indicated; ADR-0019 must remain Proposed
- **Prototype disposition:** retain as evidence and seed corpus; never import into product code

## Environment and dependency provenance

| Path | Observed version | Pin/integrity | License |
| --- | --- | --- | --- |
| Go | Go 1.23.4, `fxamacker/cbor` 2.9.1 | exact `go.mod` plus `go.sum` | MIT |
| TypeScript | Node 22.22.1, pnpm 10.28.2, `cbor2` 2.3.0 | exact lockfile integrity | MIT |
| TypeScript transitive | `@cto.af/wtf8` 0.0.5 | exact lockfile integrity | MIT |
| Swift | Apple Swift 6.3.3, CryptoKit, `thecoolwinter/CBOR` 1.1.2 | exact version and revision `f0c4cb2` | MIT |
| Host | macOS 26.5.2 (25F84), Apple silicon arm64 | local observation | n/a |

These are experiment pins, not an approved production supply-chain policy. No generic COSE
dependency was used: the narrow Sign1 envelope and Sig_structure wrappers remain hand-written
spike code while ECDSA itself is delegated to the platform crypto APIs.

## Observed result

The retained corpus contains 90 exact envelopes: four positive cases and 86 required rejection
cases. Go, TypeScript, and Swift each accepted all four positives and rejected all 86 negatives.

Fresh producer/verifier exchange also passed for both `ApprovalGrant` and the spike-only
`EnforcementTranscript`:

| Producer | Go verifier | TypeScript verifier | Swift verifier |
| --- | --- | --- | --- |
| Go | Passed both profiles | Passed both profiles | Passed both profiles |
| TypeScript | Passed both profiles | Passed both profiles | Passed both profiles |
| Swift | Passed both profiles | Passed both profiles | Passed both profiles |

All three accepted the mathematically complementary valid ECDSA S value, while rejecting wrong
lengths, DER-shaped bytes, tampering, zero scalars, and scalars greater than or equal to the P-256
order. This supports the existing accept-both-S policy and reinforces that signature bytes cannot
be an object or replay identity.

The exact retained corpus SHA-256 at the recorded run was:

```text
cd47025201b718d1831794d40afedf6adf39c33f5081846de779154b34672113
```

Fresh corpus generation uses safe nondeterministic ECDSA and therefore does not reproduce the
signature bytes. Mutation definitions, names, categories, bindings, and expected outcomes are
fixed in `go/corpus.go`; `fixtures/corpus.json` retains the exact signed snapshot used here.

## Dependency and wrapper findings

1. **A generic decoder is not the security profile.** All three paths required an outer raw-byte
   ceiling, exact tag/body checks, canonical re-encoding comparison, closed typed maps, exact
   protected headers, empty unprotected headers, semantic binding validation, and raw signature
   checks around their CBOR libraries.
2. **The Swift byte-string hazard remains real.** `thecoolwinter/CBOR` 1.1.2's keyed and unkeyed
   generic Codable paths can route `Data` through Foundation's array representation. Explicit
   single-value byte-string wrappers were required for payload fields, protected headers, and the
   COSE body.
3. **Swift Codable ignores unknown keys by default.** The typed decode alone is insufficient.
   Canonical typed re-encoding differed from the received bytes and therefore rejected the tested
   unknown/duplicate forms. Production code should make this invariant explicit and independently
   reviewed rather than rely on ordinary Codable expectations.
4. **Resource controls differ by dependency.** Go exposes map/array/depth limits. TypeScript exposes
   a depth limit but needs the wrapper's raw and inner-byte limits to bound collection work. The
   Swift decoder exposes recursion depth but no equivalent object-count setting. The pre-decode
   envelope ceiling is therefore mandatory, not optional defense in depth.
5. **Canonical-on-wire checking closed representation gaps.** This rejected non-preferred tag,
   integer, map-length and byte-string-length encodings, indefinite containers, duplicate keys,
   arbitrary tags, and trailing inner or outer data even where a typed decoder might otherwise
   normalize or discard information.
6. **Object-specific wrappers prevented cross-object reuse.** A valid signature and key were not
   enough: content type, exact field schema, object type, purpose, audience, and expected bindings
   all had to match the selected wrapper.
7. **Parsing precedes cryptographic verification only inside hard raw bounds.** The wrappers must
   decode enough envelope structure to build the signature input. No parsed value may trigger a
   state transition, lookup with side effects, allocation outside the declared ceilings, UI action,
   or authorization decision until signature and local key authorization both succeed.

## Counterevidence and limitations

- This is one retained run and a seed-only Go fuzz invocation, not sustained coverage-guided fuzzing
  of Go, Node native code, Swift, or the dependency parsers.
- The additional transcript is a representative mutually exclusive shape, not its final CDDL.
- The fixture verifier compares against one expected binding context. It does not test production
  key lookup, revocation, trust epochs, freshness, clock rollback, durable grant consumption, or
  storage.
- It does not test Secure Enclave signing, user presence, installed component identity, or Apple
  distribution. Those belong to other gates.
- The hand-written COSE wrappers have not received independent line-by-line security review.
- The corpus bounds small attacker inputs, but memory/CPU ceilings have not been benchmarked under
  sustained maximum-size adversarial traffic.
- CDDL tooling was not used to prove that runtime wrappers and candidate schemas are mechanically
  equivalent.

## Conditions required before profile freeze

ADR-0019 should remain Proposed until at least these conditions are met:

1. Freeze exact object-specific raw, header, payload, nesting, collection, text, byte-string, and
   integer bounds in both CDDL and wrapper tests; do not use one global generous bound by default.
2. Define a closed CDDL contract and mutually exclusive content type, purpose, and audience for
   every registered or signed v0 object, then validate byte-exact positive and negative fixtures
   against those contracts.
3. Replace spike equality-to-one-fixture checks with explicit caller-supplied expected bindings and
   prove wrong installation, epoch, registration, plan, attempt, signer purpose, and audience fail
   for every relevant object.
4. Independently review the Go, TypeScript, and Swift wrappers, especially Swift byte-string and
   unknown-key behavior and construction of the exact COSE Sig_structure.
5. Run sustained coverage-guided fuzzing with the retained 90 cases as seeds in every language,
   retain crashing/timeout inputs, and establish measured maximum CPU/memory behavior at each raw
   ceiling.
6. Pin production dependencies with provenance, license inventory, vulnerability/update policy,
   reproducible fetches, and an explicit review trigger for decoder or transitive-dependency
   updates.
7. Demonstrate that Supervisor registration and Broker rendering retain and hash the same received
   canonical payload bytes without substituting decode/re-encode output.
8. Integrate local key authorization, object purpose, epoch, freshness, and one-use state checks;
   a valid cryptographic signature or key ID alone must never grant authority.
9. Keep arbitrary tags, embedded keys/certificates, URLs, DIDs, dynamic resolvers, detached
   payloads, external AAD, unprotected headers, and unknown critical behavior outside the v0
   allowlist.
10. Retain the accept-both-S policy only while payload/binding identity—not signature bytes—drives
    replay and storage identity, and continue rejecting all non-64-byte wire signatures before the
    crypto API.

## Conclusion

No pivot away from bounded deterministic CBOR plus object-specific COSE_Sign1 is warranted by this
spike. The direction generalized to a second signed object and survived a materially broader shared
corpus. The correct next move is production-profile engineering and independent wrapper review,
not declaring the current experiment or ADR production-ready.
