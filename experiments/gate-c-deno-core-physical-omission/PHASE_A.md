# Phase A: `deno_core` physical-omission review

Date: 2026-08-02

Status: pre-mutation review record. This file defines the stop rule before any governed
`deno_core` source patch is authored or applied.

## Defensive question and boundary

Can exact `deno_core` 0.409.0 from Deno v2.9.4 physically omit every nonessential built-in op
before `OpDecl`, `OpCtx`, V8 external-reference, JavaScript binding, or snapshot registration,
while the fixed dependency-free Capsule JavaScript fixture still executes?

The authorized environment is this repository, the exact retained public source identities, fixed
Capsule fixtures, controlled local processes, and the owned isolated Linux/arm64 development
container. No user or arbitrary workload, backend, guest, deployment, identity, credential, or
unrelated data is in scope.

Middleware disabling, permission checks, hiding names, and post-bootstrap deletion do not count.
The prohibited-power contract remains unchanged: no subprocess/exec replacement, native addon,
FFI/native loading, inspector, Worker, macro/config/environment-file, or package installation or
dynamic package resolution.

## Exact inputs

- Deno release: v2.9.4, tag commit `14eea3160ae5834476aa3b9d317b8d41d991b982`.
- Deno source archive SHA-256:
  `95f9d8361809f2d2f3ee2d8a6955951dcf96c2f4bbeb540c2d6fdd9363e6dc94`.
- `deno_core` 0.409.0 crate SHA-256:
  `16b44f6f84139c39ec2f8d1b838412eb84ecaa9837103f7b12169896fd8778b4`.
- `v8` 150.2.0 crate SHA-256:
  `c7f4e905df70d6c00b95e69c5f0831fd5eb5889b0116ae2b30293578c19cd1bc`.
- Linux/arm64 rusty_v8 archive SHA-256:
  `8d91df74c8a671c23f880e64038023f49e07ca85c96e15d76a87e2aac9b20595`.
- Owned container image ID:
  `sha256:b8483b5baafc8f085feb4a48ef34993b182de50d86ed03fd13b98b166e7a0ad6`.

The published crate and Deno-tag `libs/core` source are byte-identical for the relevant source;
the published crate adds only packaging metadata while the tag adds the snapshot example.

## Registration and generated-output inventory

The exact construction has one central built-in registry:

1. `ops_builtin.rs` defines the `builtin_ops!` macro and the single `BUILTIN_OPS` slice.
2. `runtime/jsruntime.rs` passes that slice to `extension_set::init_ops` before creating an isolate.
3. `extension_set.rs` converts each retained declaration into an `OpCtx`; extension middleware is
   applied here, which is why the earlier 96-op disabled construction did not count.
4. `runtime/bindings.rs` derives V8 external references from the resulting `OpCtx` list and creates
   only those JavaScript bindings.
5. Snapshot sidecar `op_count` and external-reference ordering derive from the same final list.

The 99 `#[op2]` declarations generate Rust bindings at compile time in `ops_builtin.rs`,
`ops_builtin_types.rs`, and `ops_builtin_v8.rs`. They are not a second registry. A registry-only
patch need not edit generated files. Final-link evidence is nevertheless mandatory because source
declarations remaining in the crate are not enough to prove that omitted native handlers were
discarded from the executable.

The fresh bootstrap executes `00_primordials.js`, `00_infra.js`, `02_timers.js`, and `01_core.js`.
The earlier exact prototype demonstrated that only these three built-ins must remain enabled for
the fixed fixture:

- `op_get_extras_binding_object`
- `op_get_ext_import_meta_proto`
- `op_set_captured_bootstrap`

The prototype passed only by middleware-disabling the other 96. Phase B must remove that
middleware entirely and show that the final native registry itself contains exactly the three
reviewed entries.

## Other authority and restoration routes

- Bootstrap JavaScript still contains closures referring to many omitted op names. Missing
  bindings become `undefined`; those closures are not a restoration route because there is no
  retained native `OpCtx` or external reference behind them. The fixed fixture and negative probes
  must confirm no omitted binding becomes callable.
- `RuntimeOptions.extensions` is a separate registration route and must remain empty.
- The module loader is a separate authority route and must remain `None`/`NoopModuleLoader`.
- Inspector implementation remains linked in `deno_core`, but `RuntimeOptions.inspector` must remain
  `false` and mutation tests must refuse activation.
- V8 remains the ECMAScript engine. `--jitless` must remain mandatory; WebAssembly and executable
  code generation must stay unavailable to the fixture.
- No startup snapshot exists in the prior construction. Snapshot evidence is applicable only after
  the physical registry passes; it must bind the same three-op order and reproduce byte-for-byte
  in two clean build directories.
- The trusted wrapper reads only bounded regular UTF-8 source/input files before runtime creation.
  It must close nonessential descriptors before workload evaluation and retain an exact descriptor
  inventory.
- The post-loader seal candidate must deny process creation, executable replacement, sockets, and
  new executable mappings under Linux/arm64. Feasibility requires an observed clean sealed run and
  deliberate fixed restoration syscalls that fail closed; it is not inferred from API absence.

## Predeclared reviewability threshold

Phase A is GO only if all of the following are true before source mutation:

- the physical omission is controlled by one central pre-registration allowlist;
- the governed upstream patch changes no more than 3 hand-authored upstream files;
- no generated source output, V8 source, dependency version, loader, inspector, snapshot format,
  or public/product code must change;
- the upstream patch is no more than 200 changed non-comment lines and is mechanically auditable as
  an allowlist reduction;
- bootstrap, external-reference, and snapshot counts derive from the retained list without a
  parallel hand-maintained registry; and
- the fixed JS fixture can be tested without adding a product op or weakening the prohibited-power
  contract.

Any need to edit `01_core.js` merely to hide names is a NO-GO. Any need to keep disabled/stubbed ops,
register then delete them, add a permission layer, or modify full Deno is a NO-GO. Failing the
threshold stops the experiment before a partial denial patch or binary.

## Phase A decision

**GO to the smallest governed patch.** The conservative lower bound is one hand-authored upstream
file (`ops_builtin.rs`), zero generated outputs, and a pure reduction of the sole built-in
pre-registration slice from 99 declarations to 3. `OpCtx`, external-reference, binding, and
snapshot counts all derive from that slice. No bootstrap, V8, dependency, loader, inspector, or
product change is required to attempt the fixed fixture.

This GO authorizes only Phase B validation. It does not establish that the three-op construction
builds, snapshots deterministically, sheds omitted handlers from the final link, admits a runtime,
or closes `RUNTIME-001`.

## Phase B snapshot-order discovery

Phase A's one-file lower bound was exact for physical omission. When the now-applicable snapshot
was built twice, Phase B found a second hand-authored source dependency:
`modules/module_map_data.rs` drained a randomized map directly into the existing sidecar vector.
Canonical sorting requires three added lines in that file and does not change the snapshot format,
op count, external-reference order, or loader. The combined two-file, 104-text-line patch remains
inside the predeclared three-file/200-line threshold. This later discovery is recorded here rather
than retroactively represented as part of the pre-mutation lower bound.
