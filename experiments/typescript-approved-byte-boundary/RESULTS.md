# TypeScript approved-byte boundary result

Date: 2026-08-03

Outcome: **BOUNDARY-PASS; PROPOSED DESIGN ONLY; NO RUNTIME ADMISSION**

Admission effect: none. `RUNTIME-001` remains unsupported and execution requiring it must refuse.

## Observed result

The exact Node 22.22.1/Amaro 1.1.5 strip-only construction emitted identical bytes in 20 repeated
same-process transformations and three independent child processes. The 391-byte ordinary
TypeScript fixture remained 391 emitted bytes with SHA-256
`f91911dd606409fed94c214381533f5ece3e2ae23ea861a3a55192cefad884cd`.
The transformation record was identical across the three child processes.

The retained tests additionally observed:

- composed/decomposed Unicode and LF/CRLF bytes remained unnormalized and byte-distinct;
- strict invalid UTF-8 and a leading UTF-8 BOM refused;
- exact 262,144-byte source and emitted files and exact 1,048,576-byte aggregates passed;
- source, emitted, aggregate, and file-count cap-plus-one cases refused;
- malformed TypeScript and an enum requiring transformation refused with no success record;
- unknown options and a changed transformer profile refused;
- source, emitted output, options, transformer, source-map disposition, and diagnostic-count
  mutations refused; and
- the independent Go verifier recomputed the original/emitted SHA-256 identities and accepted the
  same closed record.

The exact `deno_ast` 0.53.3 comparison emitted deterministic but different ordinary bytes: 221
bytes with SHA-256 `14ccde8f1e962631d9450bf4328d27875548165188ceed4ce05bc59749803363`.
It also transformed the fixed enum to 187 JavaScript bytes, SHA-256
`b2abde87b7639060a567be7ff1bfe419777f8279bf5348b77a79785dd8dd89db`, demonstrating a broader
accepted language and emitter surface than the selected strip-only boundary.

## Boundary decision

Transformation must complete after strict proposal/source decoding and semantic resolution but
before executable-source manifest construction, `ExecutionPlan` construction, plan registration,
or Broker rendering. The exact emitted JavaScript bytes become the only bytes eligible for later
runtime delivery. Transformation may never occur after approval from only an original TypeScript
digest.

The plan should bind two role-separated source identities plus one transformation identity:

1. an original-authoring source manifest over exact TypeScript/JavaScript input bytes;
2. an executable source manifest over exact emitted/pass-through JavaScript bytes; and
3. for every transformed file, a closed record binding original digest/length/media type,
   emitted digest/length/media type, transformer profile digest and exact toolchain identities,
   normalized options digest, source-map disposition `absent`, and diagnostic policy/count
   `reject-any`/zero.

The existing `ApprovalGrant` should not duplicate those fields. It continues to bind the exact
registered plan digest and registration. The Broker fetches and validates that registered plan and
renders both authoring and executable identities plus the exact transformer profile. The
Supervisor stores the exact plan and source/transformation objects. Duplicating the fields in the
grant would create another cross-object consistency surface without adding byte authority.

The experiment proves that exact emitted-byte binding is feasible. It does not prove that a
compromised planner produced JavaScript semantically equivalent to the TypeScript, that a human
understood either form, or that the Node API will remain stable. The approved object therefore
binds the exact executable bytes rather than a claim of semantic equivalence.

## Coordinated later migration

No current product schema/type/public contract changes in this spike. A later coordinated slice
must atomically:

1. define closed original/executable source manifests and a transformation record in CDDL/types;
2. add their role-specific digests to the minimum `ExecutionPlan` candidate and Broker rendering;
3. retain exact immutable original and emitted bytes in their owning source store;
4. update Go/TypeScript/Swift decoded views, role bindings, plan builder, registration wrapper,
   approval renderer, attempt projection, lifecycle copied bindings, and receipts;
5. add byte-exact accept, boundary, cap-plus-one, wrong-domain, mutation, diagnostic, media-type,
   and source-map-absence fixtures; and
6. change the fixed 530-byte plan known answer and all downstream fixtures in one reviewed
   versioned migration, never by extending the deprecated mixed `Job` model.

The transformation process topology remains unresolved. AGENTS.md prohibits adding a
daemon-to-helper shortcut, and the experiment does not add a new Supervisor responsibility or
privileged helper. The accepted implementation must choose an owner consistent with the final
Supervisor-language/privilege topology and record that consequential choice before consumer
activation.

## Limitations and open questions

- Node marks `stripTypeScriptTypes` Active Development and warns that output is not stable across
  Node versions. Exact version/executable/output binding contains substitution but does not make
  the API stable.
- The exact local executable is macOS arm64. Other platforms require a separately pinned
  distribution/executable identity and byte-equivalence evidence before sharing one profile.
- The official source/distribution hashes were checked against Node's release SHASUMS. This was not
  a from-source rebuild, independent-builder proof, source audit, or signed-SHASUM verification.
- The Go verifier independently owns byte hashing and closed-record validation; it does not
  independently implement TypeScript erasure.
- Only fixed benign fixtures were exercised. No arbitrary workload, runtime, backend, guest,
  Broker, Supervisor, daemon, or approval implementation was connected.
- ESM module loading for a future governed `deno_core` profile, packaging/provenance, external
  isolation, and full runtime admission remain separate blockers.

## Decision

The narrow exact-byte question passes and supports Proposed ADR-0026. The selected candidate is
strip-only Node 22.22.1/Amaro 1.1.5 before plan construction with explicit emitted-byte authority
and source-map absence. This does not select or admit governed `deno_core`; ADR-0003 remains
unsuperseded and `RUNTIME-001` continues to refuse.
