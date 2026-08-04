# Governed `deno_core` physical-omission result

Date: 2026-08-02

Outcome: **PHYSICAL-OMISSION-PASS; NO RUNTIME ADMISSION**

Admission effect: none. `RUNTIME-001` remains unsupported and execution requiring it must refuse.

## Question and fail-fast result

Can an exact governed `deno_core` 0.409.0 construction physically omit nonessential built-in ops
before registration through a small reviewable patch, preserve the fixed dependency-free JS
fixture, and leave Capsule's prohibited-power contract unchanged?

Phase A set the stop threshold before mutation: at most three upstream hand-authored files, at
most 200 changed non-comment lines, one central pre-registration allowlist, and no generated,
V8, dependency, loader, inspector, snapshot-format, or product changes. Inventory found one
central registry in `libs/core/ops_builtin.rs`, 99 original entries, no generated registry output,
and three bootstrap-required ops. External references and snapshot op counts derive from the final
`OpCtx` list. The conservative lower bound was one upstream file, so Phase A returned GO.

## Physical omission

The physical-omission patch changes one upstream hand-authored file: 99 deletions and two additions in the
textual diff, representing 96 removed registry entries, one removed unused module import, and the
three-entry replacement allowlist. It changes no generated output and stays below the predeclared
threshold.

The exact final registry contains only:

1. `op_get_ext_import_meta_proto`
2. `op_get_extras_binding_object`
3. `op_set_captured_bootstrap`

This is pre-registration physical omission, not middleware, permissions, name hiding, or
post-bootstrap deletion. The `#[op2]` definitions remain in upstream source, but release linking
does not retain the unreferenced built-in implementations. Runtime registry and metadata checks
observe exactly the three allowed names; ten sampled omitted names have no metadata. `nm -C
--defined-only` on the final binary reports exactly the three corresponding
`deno_core::ops_builtin_v8` symbols and no other built-in op symbol.

## Deterministic snapshot and build

The custom snapshot is created with the three-op patched `deno_core`, no extensions, no prior
snapshot, no extension transpiler, and no runtime callback. Runtime construction consumes that
snapshot with op re-registration skipped, no extensions, no module loader, inspector false, and
V8 `--jitless --random-seed=42`.

Clean builds exposed randomized ordering of the two built-in module-map entries in the snapshot
sidecar. A second three-line upstream patch sorts the existing `by_name` vector before bincode
serialization. This does not change the snapshot format and brings the total upstream surface to
two hand-authored files and 104 textual changed lines, still below Phase A's predeclared limit.
After that patch, fixing locale/time inputs, disabling build-process ASLR with `setarch aarch64
-R`, running locked/offline with `-j1`, and keeping all other identities fixed, two independent
clean builds were byte-identical:

- 699,980-byte snapshot SHA-256
  `ef5f1e7883bbf62a6422957ff0eea51a06d4b35cad1f47dc9c9ae137ab8dfa0b`.
- 68,497,544-byte binary SHA-256
  `597baba6b9f50fc619ce667a352e19686f8c73efc6819d137b3c4081450fd6f5`.

The ASLR-disabled profile required Docker's build-time seccomp profile to allow `personality(2)`.
Network remained absent, the container root stayed read-only, capabilities were dropped, and the
runtime probes used the ordinary restrictive container profile. This is exact same-image
reproducibility, not two-builder provenance. One earlier parallel Rust 1.95 archive build aborted
inside the compiler; the two retained single-job clean builds completed.

## Fixture and prohibited-power result

The exact prior fixture returned unchanged output:

```json
{"count":3,"label":"capsule-owned","sum":6}
```

The wrapper still rejects static imports because no module loader exists, dynamic import fails,
and raw TypeScript fails V8 parsing. The sealed-global fixture reports `undefined` for Deno,
bootstrap, console, process, Worker, WebAssembly, SharedArrayBuffer, Atomics, Date, and Temporal.
The wrapper embeds those exact benign source/input fixtures and refuses all other bytes, so the
development probe is not a general-purpose workload runner.
No TypeScript transformer, schema/object-model change, runtime/backend admission, guest, or
arbitrary workload was added.

## Point-in-time host seal and restoration mutations

After fixed trusted ingestion, runtime bootstrap, registry inspection, and global sealing, the
Linux/arm64 prototype requires inherited descriptors `[0, 1, 2]`, sets `RLIMIT_NOFILE` to three,
sets no-new-privileges, and installs a TSYNC seccomp filter. The filter denies socket/socketpair,
clone/clone3, execve/execveat, and executable mmap/mprotect. The fixed fixture then completes.

The nominal trace confirms the seal is installed before fixture evaluation. After the active
marker, no process, socket, or executable-mapping syscall occurs. A pre-existing V8 worker makes
two post-seal `openat` attempts; both fail with `EMFILE`. Non-executable `PROT_NONE` cleanup
mappings remain allowed.

Deliberate restoration tests all fail closed:

- direct socket, clone, execve, and executable-mmap probes return `EPERM` after the seal;
- inheriting descriptor 3 is rejected before the seal and fixture;
- restoring `op_print` to the registry produces a four-op snapshot/binary, which the exact
  registry assertion rejects before the fixture runs.

This demonstrates feasibility of a point-in-time seal for this construction, not completeness,
continuous integrity, or a hostile-code boundary. The filter is intentionally narrow, a V8 worker
already exists, descriptor exhaustion is blunt, and no separate Supervisor/guest enforcement was
tested.

## Decision

The narrow question passes: a governed patched `deno_core` construction can physically omit the 96
nonessential built-in ops before registration with a one-file reviewable patch while preserving the
fixed JS fixture and prohibited-power observations.

The earlier `DENO-FAMILY-NO-GO` remains the disposition of full Deno and the unpatched/middleware
construction. This result removes one blocker for a governed `deno_core` architecture; it does not
select or admit that architecture. ADR-0003 is not superseded, and `RUNTIME-001` remains
unsupported pending a separately governed decision covering at least exact runtime packaging and
provenance, complete restoration/backstop review, approved-byte TypeScript disposition, external
isolation composition, and runtime-profile admission.

## Limitations

- The local owned image is identified only by its image ID and has no repository digest. The
  result is reproducible inside that retained environment but not independently reconstructible.
- Binary-symbol absence plus runtime registry/metadata absence is strong bounded evidence, not a
  proof that every unreachable upstream helper is absent from every machine-code byte.
- The custom snapshot needs the retained canonical-order source patch and recorded ASLR-disabled
  build profile; the pre-patch clean builds were not deterministic.
- The syscall corpus is exact and deliberately small. It does not prove closure against arbitrary
  native mutations, races, debugger/task-port routes, signals, or kernel defects.
- V8 creates a worker thread before the seal. TSYNC governs it after installation, but the
  experiment did not eliminate the thread or prove an all-syscall allowlist.
- The source definitions for omitted ops remain in the fork and generate dead-code warnings. The
  registry and final link omit them, but a future source-level reduction would further narrow the
  review surface.
- No performance, cold-start, memory, supply-chain admission, notarization, guest, backend, or
  product integration claim is made.
