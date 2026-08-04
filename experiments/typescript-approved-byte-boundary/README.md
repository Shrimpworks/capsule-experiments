# TypeScript approved-byte boundary experiment

Status: **BOUNDARY-PASS; PROPOSED DESIGN ONLY; NO RUNTIME ADMISSION** on 2026-08-03.

This development-only experiment defensively validates the narrow pre-approval TypeScript
boundary left open by the governed `deno_core` physical-omission result. It uses only exact public
toolchain inputs, fixed benign Capsule fixtures, controlled local processes, and this owned
development environment. It does not run arbitrary workloads, add a daemon/Supervisor/Broker
consumer, wire `deno_core`, create a guest, or admit `RUNTIME-001`.

## Question

What is the narrowest deterministic TypeScript-to-JavaScript boundary that makes the exact bytes
later supplied to a governed `deno_core` profile part of the registered plan before approval,
without adding a transformer dependency graph to the live execution runtime?

The selected experimental construction is exact Node.js 22.22.1
`node:module.stripTypeScriptTypes` with bundled Amaro 1.1.5, `mode: "strip"`, no source URL, and no
source map. It accepts only erasable TypeScript syntax. Syntax requiring JavaScript generation,
including an enum, refuses. The function is an Active Development Node API and Node explicitly
does not promise output stability across versions; this boundary therefore binds the exact Node,
Amaro, source archive, distribution, executable, options, original bytes, and emitted bytes.
Changing any identity requires a new transformation and plan.

## Exact selected profile

- Node.js version: `22.22.1`.
- Bundled Amaro version: `1.1.5`.
- Official Node source archive SHA-256:
  `87104b07e7acee748bcc5391e1bc69cf3571caa0fdfb8b1d6b5fd3f9599b7849`.
- Official macOS arm64 distribution archive SHA-256:
  `261da057fb25ff2912dd6abb7842fc915ddf7947a2cb3c8cce90875d2b9bb667`.
- Exact observed `node` executable SHA-256:
  `245e0321af97d3c21dd4e7104457334dfe3c3ba7982d0db75363e354565f8cbb`.
- Transformer profile SHA-256:
  `3bc25a01c3059776070a5354e7c6560d06f031ef0336c6a96d34c41f5577aec5`.
- Normalized options/media profile SHA-256:
  `cbd7337986e8145ff812da60b79703c7b7a31929d5c9212fae48e4568249de7b`.
- Input media type: `application/capsule.typescript-source;v=0;module=esm`.
- Output media type: `application/capsule.javascript-source;v=0;module=esm`.
- Diagnostics: reject any parser/stripper diagnostic; a successful record has count zero.
- Source map: explicitly absent. Source URL: explicitly absent.

Only ESM `.ts`/`.mts` authoring bytes fit this candidate. `.tsx`, JSX, CommonJS-specific `.cts`,
decorators, enums, namespaces, parameter properties, and other syntax needing transformation are
unsupported. JavaScript files remain exact pass-through source objects outside this transformer.

## Exact maxima

| Dimension | Inclusive maximum |
| --- | ---: |
| Source files in one bundle | 32 |
| One original TypeScript file | 262,144 bytes |
| Original source aggregate | 1,048,576 bytes |
| One emitted JavaScript file | 262,144 bytes |
| Emitted JavaScript aggregate | 1,048,576 bytes |

The source and emitted caps are independent even though exact strip mode preserved byte length for
the retained fixtures. Every cap-plus-one case refuses rather than resizing or truncating.

## Candidate comparison

| Candidate | Exact identity | Transformation surface | Disposition |
| --- | --- | --- | --- |
| `deno_ast`/SWC | `deno_ast` 0.53.3 crate SHA-256 `6f7c1384d87fc0a6439a065312fbef8f6ac6128689dbc2831b28b3a1d4f3a4e6`, source commit `8bd7154d96b6dcb7120ad9ed38595e22411f3fd1`, Rust/Cargo 1.93.1, `default-features=false`, `transpiling`; 180 locked packages including the marker | Full TypeScript transform; the fixed enum becomes 187 JavaScript bytes | Deterministic in the fixed probe, but broader syntax and 179 resolved dependencies make it nonminimal |
| TypeScript compiler | official TypeScript 6.0.3 npm integrity `sha512-y2TvuxSZPDyQakkFRPZHKFm+KKVqIisdg9/CZwm9ftvKXLP8NRWj38/ODjNbr43SsoXqNuAisEf1GdCxqWcdBw==`, shasum `90251dc007916e972786cb94d74d15b185577d21`; the exact Deno v2.9.4 bundled compiler file SHA-256 is `c956763e7858fbbf39b85d19786ad88605f8ab366b8c6f20d60caecf8c8a6aba` | One npm package with no declared package dependencies, but a full compiler and broad option/emit surface | Strictly smaller package graph than `deno_ast`, but still broader than strip-only Node and not separately prototyped |
| Node strip-only | Node 22.22.1/Amaro 1.1.5 with the exact identities above | Zero added transformer packages; type erasure only; no map; position-preserving output; transform-requiring syntax refuses | Selected experimental boundary |

The selected Node construction is narrower in accepted syntax and added package graph. It is not a
claim that Node's total native source tree is smaller or audited, and the experimental API status
remains an activation blocker.

## Reproduce

Use the exact Node 22.22.1 macOS arm64 distribution represented by
[`transformer-profile.json`](transformer-profile.json), Rust/Cargo 1.93.1, and Go 1.23 or newer:

```sh
fnm exec --using=22.22.1 -- ./experiments/typescript-approved-byte-boundary/run.sh
```

The run performs the fixed Node tests, exact `deno_ast` comparison, same-language record check,
and independent Go digest/record verification. Cargo runs locked/offline. Generated targets and
temporary outputs are disposable and ignored.

## Scope and disposal

Product code must not import this experiment. Remove or replace it only after a coordinated
object-model/schema/type migration and accepted transformer/runtime decision retain equivalent or
stronger exact-byte evidence. See [RESULTS.md](RESULTS.md) and
[Proposed ADR-0026](../../docs/adr/0026-bind-pre-approval-typescript-erasure.md).
