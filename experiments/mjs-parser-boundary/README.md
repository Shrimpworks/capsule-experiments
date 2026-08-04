# `.mjs` parser-boundary experiment

This is a bounded, non-production research harness for ADR-0034's first-release
single-file `.mjs` policy. It parses fixed repository fixtures; it never
instantiates, evaluates, or executes fixture JavaScript. The V8 control compiles a
module only and never instantiates or evaluates it.

The question is deliberately narrower than runtime admission: which exact parser
can distinguish static import declarations, export-from declarations, import
expressions, and `import.meta` from ordinary grammar, strings, comments, and
property names, and where can that parser run without enlarging an authority
process?

## Safety and bounds

- input is one strict-UTF-8 `.mjs` file;
- the inclusive input maximum is 262,144 bytes; 262,145 bytes refuses before
  parsing;
- every parse diagnostic or ECMAScript early error must refuse;
- no network, filesystem discovery, package resolution, import map, loader,
  runtime, backend, guest, key, store, or credential is used;
- `--fault=hang` and `--fault=abort` are fixed local fault hooks, not product
  behavior; and
- the probes are experiment code. Product packages must not import them.

## Exact candidates

The workspace lock file pins the complete Cargo graph.

| Probe | Direct identity | Purpose |
| --- | --- | --- |
| Oxc | `oxc_parser`, `oxc_ast`, `oxc_ast_visit`, `oxc_semantic` and supporting Oxc crates `0.140.0` | leading AST/early-error candidate |
| Deno-aligned | `deno_ast 0.53.3` with `swc_ecma_parser 27.0.7` in the lock | exact high-level Deno AST alternative |
| V8 | `v8 150.2.0` / rusty_v8 | governed compile-module control |
| tree-sitter | `tree-sitter 0.26.11`, JavaScript grammar `0.25.0` | recovery-oriented control |

`evidence/supply-chain.json` records every Cargo package identity, registry
checksum, declared license expression, cached source size, and release-binary
size. Those declarations are inventory evidence, not a completed shipping notice,
source review, or production dependency admission.

## Reproduce offline

After one authorized connected prefetch of the exact locked Cargo sources, the
Test262 archive identified in `PROVENANCE.md`, and the exact rusty_v8 archive:

```sh
cd experiments/mjs-parser-boundary
node scripts/generate-boundary-fixtures.mjs
CARGO_NET_OFFLINE=true RUSTY_V8_ARCHIVE=/private/tmp/capsule-mjs-rusty-v8-150.2.0-macos-arm64.a.gz \
  cargo +1.95.0 build --locked --offline --workspace --release
node scripts/verify.mjs
node scripts/verify-m1-hold.mjs
node scripts/inventory.mjs
node scripts/measure.mjs
```

The decisive local correctness command is `node scripts/verify.mjs`. It runs 33 cases,
repeats the three AST controls 20 times, writes exact classifications, and exits
nonzero if Oxc is nondeterministic or differs from the manifest. Measurements are
informational observations from one named host, not budgets or admission claims.
`node scripts/verify-m1-hold.mjs` separately consumes all 28 canonical merged M1
HOLD fixtures in place and records the exact grammar/free-CommonJS-reference mapping;
it does not copy or replace M1.

See [RESULTS.md](RESULTS.md) for the comparison and [HANDOFF.md](HANDOFF.md) for
the decision and follow-on gates.
