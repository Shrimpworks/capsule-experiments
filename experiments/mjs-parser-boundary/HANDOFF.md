# Research handoff

## Question and scope

Defensively determine the smallest correct parser and process boundary for
ADR-0034's static single-file `.mjs` policy, using only fixed local parse-only or
compile-only fixtures and pinned public sources. No fixture JavaScript was
executed, and no runtime, backend, guest, external identity, credential, or data
was accessed.

## Method and result

Four exact Rust probes enforced the inclusive 262,144-byte cap and strict UTF-8,
then classified a 33-case local corpus. Oxc, deno_ast/SWC, and tree-sitter were repeated
20 times; V8 was used only as a compile-module control. Supply graph, binary/source
footprint, latency, memory, deadline, crash, diagnostics, and deterministic output
were retained under `evidence/`.

Oxc 0.140.0 with parser diagnostics, semantic early-error checking, a narrow AST
visitor, and unresolved free-CommonJS-reference accounting is the only tested
candidate with zero mismatches. It additionally agreed with all 28 canonical
merged M1 HOLD outcomes (22 grammar/ordinary cases and six CommonJS-reference
cases) without copying those fixtures. The exact
deno_ast wrapper recovered from four invalid programs; tree-sitter accepted three
invalid programs; V8 compile-only cannot observe the two required dynamic node
categories.

## GO / NO-GO

GO to implementation planning for a one-shot, stateless, disposable Source
Validator process using the exact pinned Oxc mode. NO-GO to a product validator,
endpoint, helper, service, runtime profile, or boundary admission from this
experiment alone.

The Proposed ADR requires both the daemon's planner and the Approval Broker to
invoke the validator over their exact copied bytes. The Supervisor retains and
rehashes bytes but does not parse. Validator failure, timeout, crash, malformed
output, version mismatch, or any diagnostic refuses. Runtime no-loader enforcement
remains independent and mandatory.

## Retained artifacts

- `Cargo.toml` / `Cargo.lock`: exact dependency graph;
- `fixtures/manifest.tsv` and `fixtures/cases/`: expected corpus, exact boundary,
  scanner-stop, recovery, grammar, and restoration cases;
- `scripts/`: boundary generation, deterministic verification, supply inventory,
  and measurements;
- `evidence/verification.json`, M1 HOLD mapping, and classification TSVs: exact outcomes and hashes;
- `evidence/supply-chain.json`: package/checksum/license/source/binary inventory;
- `evidence/measurements.json`: host observations and fixed fault outcomes; and
- `PROVENANCE.md`: Test262, Cargo, and rusty_v8 identities.

## Confidence, limitations, and next exact gates

Confidence is high for the bounded candidate comparison, merged-M1 mapping, and placement rejection,
and deliberately low for product admission. Thirty-two cases are not semantic
equivalence, type correctness, an arbitrary-hostile-input proof, a complete
license audit, or an admitted OS confinement profile.

The next exact work is the implementation/conformance/fault plan in
`docs/MJS_SOURCE_VALIDATOR_IMPLEMENTATION_PLAN.md`. Before retaining Oxc in a
product artifact, complete dependency/license/source review, reproducible artifact
enrollment, typed IPC and copy-binding tests, platform sandbox proof, independent
Broker invocation, and runtime no-loader adversarial evidence. If Oxc becomes
unavailable, the next parser test is a minimal direct `swc_ecma_parser` build that
drains all recoverable errors and adds an explicit early-error pass; do not reuse
the rejected high-level wrapper mode.
