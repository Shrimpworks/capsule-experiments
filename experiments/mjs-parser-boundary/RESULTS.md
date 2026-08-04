# Results

## Decision summary

**GO, conditionally, on `oxc_parser`/`oxc_ast`/`oxc_semantic` `0.140.0` as the
exact engineering candidate inside a new one-shot disposable Source Validator
process. NO-GO on every tested in-process placement and on the three alternatives
as the first-release validator.**

This is not product admission. The process sandbox, artifact enrollment,
typed IPC, production package and license review, and independent runtime
no-loader evidence remain unimplemented gates.

## Correctness

`evidence/verification.json` records 33 local manifest cases and exact output hashes.
All three AST parsers were deterministic across 20 repetitions.

| Candidate | Exact tested result | Conclusion |
| --- | --- | --- |
| Oxc 0.140.0 | 0 mismatches after parser diagnostics plus semantic early-error checking | selected engineering candidate |
| deno_ast 0.53.3 | accepted 4 expected parse errors: unterminated string, empty `import()`, duplicate export, duplicate lexical binding | reject exact high-level wrapper/mode |
| tree-sitter 0.26.11 / JS 0.25.0 | accepted empty `import()` and both duplicate-declaration early errors | reject recovery-oriented grammar as policy parser |
| V8/rusty_v8 150.2.0 | compile-module found static requests; compile-only API did not expose dynamic import or `import.meta` observations | reject as structurally incomplete and disproportionate |

The mandatory outcomes are explicit:

- `const of = 9; of / import("evil") / divisor;` contains one import
  expression and refuses;
- `obj.import.meta` is ordinary property access and allows;
- `({ import() {} })` is a valid object method named `import` and allows;
- template interpolation containing `await import("./evil.mjs")` contains one
  import expression and refuses; and
- `eval("import('./evil.mjs')")` is string data to the parser and allows at this
  layer. Runtime eval/generated-code policy and unconditional no-loader behavior
  are separate enforcement obligations.

Oxc's decisive mode rejects a parser panic, any parser diagnostic, or any
`SemanticBuilder::with_check_syntax_error(true)` diagnostic before visiting the
AST. It then counts only `ImportDeclaration`, export declarations with a source,
`ImportExpression`, and the `import.meta` `MetaProperty`. The same semantic graph
counts unresolved references to the five unavailable CommonJS bindings `require`,
`module`, `exports`, `__dirname`, and `__filename`; locally shadowed bindings are
ordinary JavaScript and do not count.

### Merged M1 canonical mapping

After rebasing onto merged PR #87, `scripts/verify-m1-hold.mjs` ran the selected
Oxc mode directly over all 28 canonical
`schemas/conformance/v0/mjs-source/language-hold-*.mjs` files. The exact paths,
fixture hashes, counts, expected decisions, ownership layers, and agreement are in
`evidence/m1-hold-mapping.tsv` and `m1-hold-verification.json`.

| Canonical group | Cases | Exact result |
| --- | ---: | --- |
| module grammar plus ordinary grammar/string/comment controls | 22 | 22/22 agree |
| unresolved free CommonJS binding references | 6 | 6/6 agree |
| total | 28 | 28/28 agree; 0 mismatches |

This mapping does not replace M1's passive byte/manifest validator. The existing
byte layer remains authoritative for strict UTF-8, leading BOM, exact identity,
and cap checks; Oxc owns the later language result only. Runtime absence of
CommonJS globals and module loaders remains independently required.

## Supply and footprint

These are exact locked-graph observations from `evidence/supply-chain.json`, not
review or admission claims.

| Candidate | Locked transitive packages | Cached source bytes | release binary bytes |
| --- | ---: | ---: | ---: |
| Oxc | 65 | 24,449,903 | 1,854,528 |
| deno_ast/SWC | 116 | 71,867,462 | 3,944,144 |
| tree-sitter | 26 | 18,523,320 | 966,224 |
| V8/rusty_v8 | 95 | 432,233,432 | 55,636,864 |

The Oxc graph is larger than tree-sitter's, but the smaller control is not
correct for the required early-error policy. The exact Deno-aligned wrapper is
both larger and incorrect in its exposed recovery mode. V8 has the largest source
and binary footprint and still cannot provide the required compile-only dynamic
import/`import.meta` observation.

Primary-source checks used for interpretation:

- Oxc documents that parsing can return a semantically invalid AST with
  recoverable errors and directs callers that need valid ECMAScript to enable
  semantic syntax-error checking:
  <https://docs.rs/oxc_parser/0.140.0/oxc_parser/struct.ParserReturn.html>.
- V8 `Module::GetModuleRequests` returns the module's static requests, while the
  dynamic-import callback is a host callback for dynamic import processing:
  <https://v8.github.io/api/head/classv8_1_1Module.html> and
  <https://v8.github.io/api/head/classv8_1_1Isolate.html>.
- Tree-sitter is designed to remain useful in the presence of syntax errors and
  represents recovery with error/missing nodes:
  <https://tree-sitter.github.io/tree-sitter/using-parsers/queries/1-syntax.html>.

## Time, memory, cancellation, and crash consequence

Measurements used the 262,144-byte valid fixture on Apple arm64 macOS 26.5.2
(build 25F84), Rust 1.95.0, and release binaries. Each cold value is 20 new
processes; warm-amortized values are 10 processes parsing 20 inputs each. Values
are observations, not service-level objectives.

| Candidate | cold median / p95 ms | warm median / p95 ms | max RSS bytes |
| --- | ---: | ---: | ---: |
| Oxc | 4.209 / 5.258 | 1.030 / 1.134 | 2,195,456 |
| deno_ast | 3.131 / 5.868 | 0.272 / 0.340 | 2,752,512 |
| tree-sitter | 6.663 / 9.631 | 3.632 / 3.781 | 2,048,000 |
| V8 | 6.687 / 10.138 | 0.422 / 0.448 | 10,567,680 |

Every probe's fixed hang fault was killed by the parent at the 100 ms test
deadline (observed 101.5–102.8 ms), and every abort fault terminated only that
process with `SIGABRT`. The harness demonstrates ordinary process cancellation
and crash containment, not the future OS sandbox, resource ceilings, or absence
of parser vulnerabilities.

## Placement comparison

| Placement | Decision | Reason |
| --- | --- | --- |
| daemon in-process | reject | exposes a 65-package hostile-input parser in the public process; a compromised daemon can skip its own precheck anyway |
| Supervisor in-process | reject | violates the rich-parser restriction and adds a new responsibility to the sole execution-authority owner |
| Approval Broker in-process | reject | places parser memory corruption in the Approval/content-key process |
| disposable Source Validator child | select, Proposed | stateless typed method, copied bounded input/output, fixed artifact, no store/keys/network; crash/hang/malformed result can refuse without corrupting an authority process |
| governed V8 compile-only | reject | dynamic import and `import.meta` are not compile-only module-request observations, and the TCB is disproportionate |

The selected process remains part of the approval-correctness dependency chain,
not the runtime security boundary. Its compromise could lie about source facts or
cause denial of service. It must not possess signing authority or launch
authority, and runtime no-loader enforcement must still refuse all constructed
module requests even if every pre-approval parser check is skipped or wrong.
