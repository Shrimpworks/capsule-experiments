# ADR-0034: Freeze a single-file `.mjs` first-release contract

- Status: Accepted
- Date: 2026-08-03
- Implementation hold recorded: 2026-08-04
- Refines: ADR-0011, ADR-0017, ADR-0023, ADR-0028, and ADR-0029
- Defers for a conditional later release: ADR-0026, ADR-0030, and ADR-0032

## Context

Capsule's first executable slice needs an exact source contract before passive authenticated-IPC
and plan work can continue. The retained TypeScript experiment proved only that one fixed
Node/Amaro transformation can produce deterministic bytes. Proposed ADR-0030 therefore introduced
three future plan source roles, and Proposed ADR-0032 selected a separate Source Preparer, but its
P0 review correctly stopped before P1 contracts because protected-store, worker-confinement,
genesis/update, retention, recursive field-authority, and lifecycle evidence remain open.

The accepted product decision is narrower: the first usable release may be JavaScript-only and
accepts only modern ESM `.mjs`. It does not accept CommonJS, TypeScript, package resolution, the
legacy Node module surface, or a wider governed-runtime contract. TypeScript remains a conditional
later feature and must not block the first-release critical path.

The current passive `ExecutionPlan` v0 already has one `sourceManifestDigest`, one source
entrypoint, and one aggregate source byte length. The current proposed `RegisterPlanV0` complete
role projection likewise has one source-manifest role. A pass-through JavaScript source has only
one authoring/executable byte identity, so adding original/emitted/record-set roles would create
unnecessary authority and force a plan-v1 cutover for a transformation that does not occur.

This decision freezes semantics and dependency order only. It does not change the current passive
schema/CDDL or fixtures in this ADR, activate a consumer or endpoint, implement authenticated IPC,
admit governed `deno_core` or a backend, create a guest, or authorize execution.

## Decision

### Exact source profile

The first-release source profile is `capsule.mjs-source/v0` with these exact rules:

| Property | Exact value |
| --- | --- |
| Public proposal media type | `application/capsule.job-proposal+json;v=0` |
| Source-member media type | `application/capsule.javascript-source;v=0;module=esm` |
| Source-manifest media type | `application/capsule.source-manifest+cbor;v=0` |
| File count | exactly 1 |
| Logical path | exactly `main.mjs` |
| Entrypoint | exactly `main.mjs` |
| Per-file bytes | 0 through 262,144 inclusive |
| Aggregate source bytes | equal to the one file length; at most 262,144 |
| Transformation | none; byte-exact pass-through only |
| Source maps/source URLs | absent; none are generated or appended |

The proposal's decoded `source.files["main.mjs"]` Unicode scalar sequence is encoded once as
strict UTF-8. Those bytes are the sole authoring and executable bytes. JSON escape spelling is not
source identity. Invalid UTF-8, unpaired surrogate escapes, and a UTF-8 BOM at the start of the
decoded file refuse. Unicode scalars otherwise remain byte identity: Capsule performs no Unicode
normalization, case folding, newline conversion, control-character rewriting, or trailing-newline
insertion/removal. LF, CRLF, lone CR, U+2028/U+2029, composed/decomposed text, embedded U+FEFF, and
trailing-newline differences therefore produce different content and manifest digests. Later
ECMAScript parsing may reject a byte sequence; it may not rewrite it.

The single fixed member deliberately removes path aliasing, member ordering, extension inference,
and multi-module graph ambiguity from the first release. The manifest member array has exactly one
entry and is therefore already in the required unsigned-ASCII logical-path order. Empty source is
structurally permitted; runtime/profile parsing and workload behavior remain separate questions.

### Closed module-loading policy

The first-release source contains no module dependency request.

- Static `import` declarations, side-effect imports, and `export ... from` declarations refuse.
- Dynamic `import()` and `import.meta` refuse, including literal relative requests.
- Import attributes/assertions, import maps, package manifests, extension or index inference, and
  runtime-generated loader configuration do not exist.
- Relative, absolute, bare/package, `node:`, `npm:`, `http:`, `https:`, `data:`, `blob:`, `file:`,
  and Capsule-internal specifiers are all unavailable. No specifier spelling is accepted.
- Ordinary local `export` declarations without a `from` clause remain ESM syntax and do not load a
  dependency.

A bounded, non-executing ECMAScript module-request validator must reject direct forbidden syntax
before plan construction. It must distinguish grammar from comments and strings rather than use a
substring denylist. This precheck is a usability and contract check, not the runtime security
boundary: an admitted runtime profile must also install no filesystem, network, package, import-map,
or fallback module loader, and every static or dynamically constructed module request must fail
closed. Parser selection and runtime enforcement remain unimplemented blockers. An independent
defensive review of the validation boundary itself, including concrete false-accept/false-refusal
counterexamples and a parser-selection recommendation, is retained in
[`.mjs` module-request validation boundary review](../MJS_VALIDATION_BOUNDARY_REVIEW.md).

#### M1 validator implementation hold

The first M1 implementation attempt independently reproduced a division-versus-regexp grammar
counterexample in which a lightweight token scanner accepted live `import()` syntax. The exact
bytes, observations, and decision are retained in the
[M1 ECMAScript module-request validator hold](../MJS_MODULE_REQUEST_VALIDATOR_HOLD.md). The scanner
is not retained, TypeScript or another broad parser is not added as an unreviewed shortcut, and the
closed no-module-request contract is unchanged.

Only the separable passive source-byte and deterministic-CBOR SourceManifest foundation may land
while this hold is active. JobProposal narrowing, semantic resolution and plan construction for
this profile, M2/S1 registration/fetch activation, custody, approval, staging, and runtime work are
blocked until a separate reviewed decision selects an exact pinned/governed bounded ECMAScript
parser/validation boundary. Syntax validation treats `eval("import(...)")` as string data and can
never substitute for the separately admitted runtime no-loader enforcement required below.

### Canonical source identity

Let `B` be the exact strict-UTF-8 `main.mjs` bytes and `H(x)` be SHA-256 over exact bytes. The
canonical deterministic-CBOR `SourceManifest` v0 is:

```text
1: "capsule.source-manifest"
2: 0
3: "main.mjs"
4: [["main.mjs", H(B), byte_length(B)]]
5: byte_length(B)
```

The map uses integer-key order and preferred RFC 8949 encodings. The exact manifest is 87 bytes
for a zero-byte file and at most 95 bytes at the 262,144-byte maximum. Its digest is
`H(exact_manifest_bytes)`. The execution plan binds that manifest digest, `main.mjs`, and the same
aggregate byte length. Manifest bytes and `B` remain separate retained objects; neither a host path
nor a digest alone is executable authority.

No second original/executable identity exists. The plan-bound source bytes, the Broker-inspected
bytes, and the later runtime-staged bytes must be byte-for-byte equal to `B`. Any decoding,
transpilation, bundling, minification, newline change, source annotation, cache substitution, or
post-registration generation requires a new contract and is forbidden by v0.

### Plan v0 is the first-release authority contract

`application/capsule.execution-plan+cbor;v=0` is deliberately retained. Its existing 24 fields and
field-authority classifications remain complete. For source, fields 6 through 8 mean exactly:

1. the digest of the canonical single-member `SourceManifest` v0 above;
2. entrypoint exactly `main.mjs`; and
3. the exact byte length of `B`, from 0 through 262,144.

All other installation, epoch, inline-input, runtime bundle/review/registry, backend validation and
configuration, trust snapshot, policy, exact wall-time, output, and expiry roles remain unchanged.
The fixed source semantics come from plan object version 0; optional media, transform, package, or
module-loader fields are not added.

An accepted runtime-profile alias does not widen this source contract. Its exact bundle, review,
registry, and backend-validation bindings may narrow syntax or refuse the source, but they may not
enable another source media type, another member, dependency resolution, or a loader.

### Atomic registration and retained source custody

The first-release `RegisterPlanV0` request is one method-specific atomic submission containing:

| Field | Origin | Independent checks and authority effect |
| --- | --- | --- |
| exact plan bytes | daemon planner | Supervisor predecodes, decodes, role-binds, hashes, and retains; changes authority only on commit |
| complete 562-byte plan-role projection | daemon-supplied identities | Supervisor resolves every nominal role from trusted local state; labels alone grant nothing |
| exact canonical source-manifest bytes | daemon-derived from agent source | Supervisor canonically decodes, hashes, checks the plan source role, and retains |
| exact `main.mjs` bytes `B` | agent-originated, daemon-copied | Supervisor checks length, strict UTF-8/BOM/profile rules, content digest, manifest membership, and pass-through identity, then retains a defensive copy |

Registration commits the exact plan, registration, complete resolved bindings, source manifest,
and `B` in one Supervisor transaction or commits none of them. A registration is not approvable
until this source custody is committed and exact readback succeeds. No caller path, descriptor,
URL, source-set identifier, transform request, package input, or replacement byte route exists.

The complete first-release role projection is still exactly 562 bytes: one record-version byte;
the 16-byte installation ID; epoch, source-manifest, inline-input, and runtime-bundle digests;
one review-count byte and eight fixed review-digest slots; and profile-registry, backend-validation,
backend-configuration, trust-snapshot, and policy digests. This conclusion follows from the closed
current plan-v0 field-authority projection. It does not reinterpret a TypeScript role or make the
historical 626-byte arithmetic a contract.

For the revised proposed XPC shape, the exact application-visible data maxima are:

- source manifest: 95 bytes;
- source bytes: 262,144 bytes;
- `RegisterPlanV0` request data: 328,337 bytes, comprising the existing 65,536-byte plan cap, exact
  562-byte role projection, 95-byte manifest cap, and 262,144-byte source cap; and
- `GetRegisteredPlanV0` successful reply data: 332,433 bytes after adding the existing 4,096-byte
  registration cap.

These are aggregate application data budgets, not raw Mach-message or XPC-serialization claims.
The passive fixture slice must generate them from the closed message contract and field-authority
manifest and must retain exact-boundary/cap-plus-one vectors before either value is frozen in code.
If generated canonical bytes disagree, the fixture evidence controls and this ADR must be revised;
implementations may not copy the arithmetic alone.

`PlanRegistration` remains `application/capsule.plan-registration+cbor;v=0` and continues to bind
the exact plan digest rather than duplicating source fields. `GetRegisteredPlanV0` returns defensive
copies of the exact retained plan, resolved role projection, registration, source manifest, and
`B`. `SubmitApprovalV0` and `RequestAttemptV0` retain their existing shapes and semantics.

### Approval-visible facts

Before signing, the Broker fetches only Supervisor-retained bytes and independently verifies the
plan, registration, source manifest, `B`, all nominal role bindings, and expiry/trust state. Its
bounded trusted view must render:

- installation, epoch, registration, plan digest, and expected Supervisor;
- source profile `capsule.mjs-source/v0`, exact source/member media types, pass-through disposition,
  fixed `main.mjs` entrypoint, file count 1, exact byte length, content digest, manifest digest, and
  bounded plain-text source inspection;
- no static imports, dynamic import, `import.meta`, package resolution, CommonJS, TypeScript,
  transform, source map, source URL, filesystem loader, network loader, or fallback loader;
- complete inline-input authority, runtime bundle/review/registry and backend-validation posture,
  exact wall-time/output limits and origin, observation channels, and expiry; and
- the existing warning that generated code may encode granted input through allowed output,
  metadata, state, or timing.

Control, bidi, normalization, newline, and trailing-newline distinctions must remain unambiguous.
The Broker does not claim that user presence proves source comprehension. Unrenderable or
incompletely validated source refuses before the Approval-key operation. `ApprovalGrant` continues
to bind the exact registration and plan digest; it does not duplicate source fields.

### Attempt and execution eligibility

Attempt requests remain registration/approval-reference only. After atomic grant consumption and
attempt creation, the Supervisor resolves source solely from retained registration state. It
rehashes the source manifest and `B`, checks the copied plan/attempt bindings, and stages exactly
`B` through the separately versioned bounded source transport. No caller supplies bytes, profile,
specifier, loader, path, image, mount, or backend flag at attempt or execute time.

A future admitted governed-`deno_core` profile may receive `B` only as one main ES module under a
fixed internal identity. It receives no other source member and has an unconditionally refusing
module-loader/dynamic-import path with no filesystem, URL, package, import-map, or ambient fallback.
The exact runtime/launcher/transport profile must prove those properties before admission. This
ADR does not implement that loader, admit runtime bytes, connect a backend, or create a guest.

## Field-authority closure

The first-release projection has no unowned source field:

- the agent originates untrusted `main.mjs` text and the runtime-profile selector;
- the strict proposal decoder and semantic/module-request validator own raw, source-profile, and
  byte-budget refusal before plan construction;
- the daemon planner derives content/manifest digests and plan bytes but cannot make its labels or
  source copies trusted;
- the Supervisor independently resolves all plan roles, validates and retains exact source bytes,
  issues registration state, and later permits only registered-source readback;
- the Broker independently validates and renders the Supervisor-retained bytes and originates only
  the signed approval binding; and
- the attempt/runtime path may read only the Supervisor-retained executable source associated with
  the committed registration and attempt.

The passive field-authority manifest must add canonical targets for the single-member source
manifest and the revised method-specific registration/fetch projections in the same change as
their candidate definitions. Nested member path/digest/length and every independent validator must
be classified. No parallel manifest or prose exception is allowed.

## TypeScript disposition and versioning

ADR-0026, Proposed ADR-0030, their passive approved-byte objects/evidence, and Proposed ADR-0032
remain historical and future-conditional. They no longer block first-release contracts, IPC,
runtime packaging, or admission work. No Source Preparer P0A/P1 task is on the first-release
critical path.

If TypeScript is later selected, its three nominal source roles still require one atomic
`ExecutionPlan` v1, `RegisterPlanV1`, registration/fetch, Broker rendering, approval/attempt,
lifecycle, transcript, receipt, source-store, and field-authority cutover. No active installation
accepts plan v0 and v1 as equivalent authority. The 562-byte v0 record is never reinterpreted, and
the old 626-byte observation remains neither a layout nor a cap.

## Follow-on passive implementation plan

The dependency change is explicit:

```text
Before
  Source Preparer P0A -> P1-P5 -> plan-v1/RegisterPlanV1 cutover
    -> authenticated-IPC S1 -> runtime module loading/admission

After
  M1 `.mjs` proposal/source/manifest
    -> S1/M2 plan-v0 registration/fetch fixtures
      -> M3 Supervisor custody -> M4 approval/attempt projection
        -> M5 separate runtime no-loader/admission evidence

  Conditional later TypeScript (off the first-release path)
    Source Preparer P0A -> P1-P5 -> atomic plan-v1/RegisterPlanV1 cutover
```

The next work is dependency-ordered and independently testable:

1. **M1 proposal/source fixtures:** after the parser-boundary hold above is resolved, atomically
   narrow the passive `JobProposal` schema and semantic resolver to one `main.mjs`, add exact
   UTF-8/BOM/newline/Unicode and zero/exact/cap-plus-one
   vectors, module-request refusals, the canonical 87/95-byte manifest boundaries, defensive
   copies, and the source-manifest field-authority target. Replace—not supplement—the old active
   `.js`/`.cjs`/`.ts`/`.mts`/`.cts` accepts.
2. **M2 plan/registration fixtures:** retain plan v0's one source role, replace source fixtures and
   known answers coherently, add the closed registration/fetch source projections, generate the
   562/328,337/332,433 maxima from complete definitions, and test every missing/extra/wrong-role,
   mutation, alias, exact-boundary, cap-plus-one, and copy-ownership case. This resumes authenticated
   IPC S1 without a product endpoint.
3. **M3 unwired Supervisor source custody:** extend only the fixed local registration/store oracle
   so plan, registration, resolved bindings, manifest, and `B` commit atomically; test every
   write/sync/commit/response-loss/reopen/corruption boundary and Broker defensive readback. It
   remains local mechanics with no XPC consumer.
4. **M4 approval/attempt projection:** prove Broker-view completeness, unchanged ApprovalGrant and
   attempt bindings, registration-only execution lookup, source mutation refusal after approval,
   and zero runtime/backend calls. Use only passive/fake fixtures.
5. **M5 runtime-profile evidence:** after a separate admission plan, prove the exact governed
   runtime receives only `B`, exposes no module-loader restoration path, and fails every direct or
   dynamically constructed dependency request. This requires explicit owned-guest authorization
   only when the later composed guest slice begins.

Every retained slice runs the complete repository verification, updates field-authority coverage
with its canonical objects, replaces incompatible known answers atomically, and preserves the
claim that no consumer, authenticated IPC, runtime/backend, or guest is implemented or admitted.

## Consequences and remaining blockers

- First-release backend-independent plan and IPC work no longer waits for Source Preparer evidence
  or a plan-v1 migration.
- The single fixed member and no-loader policy trade multi-file ergonomics for a substantially
  smaller approval, custody, parsing, IPC, and runtime surface.
- Exact source custody becomes part of registration and Broker fetch, increasing the proposed XPC
  data budget; passive generated-cap and fault evidence is required before implementation.
- The source-byte/SourceManifest foundation is passive; the bounded non-executing module-request
  validator remains on the retained grammar-counterexample hold. Supervisor source-store
  projection, independent Broker validation/rendering, source transport framing, and runtime
  no-loader evidence remain unimplemented.
- ADR-0019 wrapper acceptance, ADR-0029 installed identity/session evidence, production Supervisor
  archive/owner/store work, approval key authorization, runtime/profile admission, libkrun/launcher/
  transport composition, content/evidence paths, and every guest/backend gate remain independent
  blockers.
- No claim follows that governed `deno_core`, an isolation backend, authenticated IPC, approval,
  execution, or a hostile guest is implemented, admitted, secure, attested, or production-ready.
