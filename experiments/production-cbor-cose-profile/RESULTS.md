# Production CBOR/COSE profile comparison results

## Result

The experiment passes `fxamacker/cbor v2.9.2` only for deterministic object encoding and typed
field decoding behind Capsule-owned, object-specific wrappers. It does **not** pass the library as
a raw decoder, canonical-on-wire validator, resource predecoder, schema validator, authority
resolver, or replay mechanism. A later product slice may adopt the exact pin for those two narrow
responsibilities while retaining the handwritten implementation as an independent oracle through
schema freeze and restoration testing.

The experiment is **NO-GO** for `veraison/go-cose v1.3.0` as a production envelope dependency.
Its Sig_structure construction and ES256 verification agree with the retained known answers, but
Capsule must independently parse and cap the envelope, preserve and compare exact protected bytes,
refuse generic headers/features, validate the payload, receive a separately authorized key, and
own payload-based replay identity. The remaining reusable work is too small to justify the broad
COSE_Key, CWT, countersignature, multi-algorithm, generic-header, and generic-decoder surface, the
additional footprint, MPL-2.0 source-form obligations, and a security-policy page that still names
v1.0.0 as the only supported release. Keep v1.3.0 as a test oracle only. Use Go standard crypto
primitives behind a Capsule-owned narrow envelope wrapper unless a later candidate materially
changes this balance.

ADR-0019 remains Proposed. This comparison does not close the Swift production wrapper,
all-signed-object, independent-review, or Supervisor/Broker same-byte integration conditions.

## Responsibility matrix

| Responsibility | fxamacker v2.9.2 | go-cose v1.3.0 | Capsule code that remains mandatory |
| --- | --- | --- | --- |
| Deterministic object encoding | **PASS**, object-specific typed structs only | Not applicable | Object type/version, field set, bounds, safe integers, role-specific types, known answers |
| Typed object field decoding | **PASS**, only after predecode and before canonical byte comparison | Not applicable | Raw cap before copy/allocation, exact item/depth/map/array caps, closed shape, trusted field bindings |
| Raw CBOR admission and canonical-on-wire | **NO-GO alone**; relaxed modes accept every restoration probe | **NO-GO**; internal modes are package-global and do not expose Capsule caps | Handwritten scanner plus byte-for-byte canonical re-encode comparison |
| COSE_Sign1 structural parse | Can support a Capsule-owned exact outer struct | **NO-GO for production**; generic parse accepts nonempty unprotected, unknown headers, noncanonical payloads, and detached payloads | Tag/array/raw-size rules, exact protected bstr, empty unprotected map, embedded payload and exact signature width |
| Sig_structure construction | Generic CBOR encoder can encode the fixed four-item structure | **PASS functionally; TEST-ONLY selection** | Fixed `Signature1`, empty external AAD, exact received protected and payload bytes |
| ES256 verification | Not applicable | **PASS functionally; TEST-ONLY selection** | Separately authorized role/key input, exact algorithm/key-ID/content-type rules, malformed key/signature refusal |
| Purpose/audience/installation/epoch/registration/plan/nonce binding | **NO-GO** | **NO-GO** | Capsule-owned object validator using trusted caller context |
| Equivalent-signature and replay semantics | **NO-GO** | **NO-GO** | Payload-byte digest is replay identity; envelope digest is evidence only |
| Key selection or authorization | **NO-GO** | **NO-GO** | Trusted caller supplies the already-authorized role key; `kid` only has to match it |

## Semantic evidence

- The candidate wrappers and handwritten oracle agree on 17 SourceManifest cases (4 accepts), 23
  applicable ExecutionPlan/PlanRegistration exact-byte and domain-binding cases, and the 40 retained
  low-level CBOR cap/determinism cases.
- The approval wrapper agrees on all 82 applicable cases in the retained 90-case hardening corpus,
  including the valid ordinary and complementary-S envelopes. It also replays the independent
  Go/Swift/TypeScript Gate A2 known answers.
- The captured go-cose Sig_structure is byte-identical to the retained fixed four-element
  structure. Both valid S forms produce the same payload identity and distinct envelope evidence.
- Wrong authorized key, missing authorization, wrong `kid`, purpose, audience, installation,
  epoch, registration, plan, Supervisor, or nonce all refuse.
- Critical, URL, x5chain, embedded-key, countersignature, external-AAD, detached-payload, unknown
  header, nonempty-unprotected, DER-shaped signature, nonpreferred encoding, and protected-header
  ordering restorations all refuse in the wrapper. The tests demonstrate that the generic library
  paths accept representative restored features, so wrapper enforcement is not redundant.
- A deterministic 10,000-object property run round-trips byte-identically. Thirty-second bounded
  fuzz runs completed 2,793,965 execution-plan inputs and 2,887,637 approval inputs without a
  crash, acceptance instability, or failed invariant.

## Resource and maintenance evidence

On Apple M1 Max/darwin-arm64 with Go 1.23.4, the exact execution-plan path measured 39 allocations
and 3,426 bytes per accepted 519-byte object, while a 65,537-byte raw cap+1 input refused with six
allocations and 208 bytes. The approval path measured 117 allocations and 8,157-8,158 bytes per
accepted 375-byte envelope; a 513-byte cap+1 envelope refused with one allocation and 16 bytes.
The focused test process reported 12,566,528 bytes peak RSS. Full samples are retained in
[measurements](evidence/measurements.md).

The extracted source footprint is 1,204 KiB/49 files for fxamacker, 76 KiB/7 files for float16,
and 1,916 KiB/68 files for go-cose. A stripped arm64 stdlib measurement command is 1,519,010 bytes;
fxamacker plus float16 is 1,672,114 bytes (+153,104), and go-cose plus its selected fxamacker graph
is 1,822,226 bytes (+303,216 over baseline, +150,112 over fxamacker). The complete comparison
wrapper links to 1,822,210 bytes.

fxamacker can replace handwritten per-field integer/string/byte decode and deterministic encode,
but the 334-line current predecoder and the object-specific bounds/binding validators remain.
go-cose cannot remove those controls and only saves a small fixed Sig_structure assembly plus
standard ECDSA call; its maintenance and review surface is therefore additive for Capsule's v0
profile.

## Confidence and limits

Confidence is high for the tested Go responsibilities and exact retained v0 fixtures. The tests
were offline after exact prefetch and did not exercise a live key, Keychain/LocalAuthentication,
Swift production wrapper, authenticated IPC, schema cutover, consumer, store, runtime, backend, or
guest. Fuzzing was sustained but bounded to two 30-second runs, not a long-running service load or
independent audit. GitHub release records were mutable pages with no release assets or attestations;
module sums and tag commits identify the reviewed bytes but are not upstream reproducible-build
provenance. No production dependency was added to the root module.

The next exact test is a production-shaped Swift wrapper and Supervisor/Broker same-payload-byte
integration using the frozen signed-object set. If a future COSE library exposes caller-supplied
strict decode modes, a Sign1-only build surface, current supported-release policy, and a smaller
measured TCB, compare it against the same corpus before revisiting the NO-GO.
