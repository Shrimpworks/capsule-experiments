# Deno-family runtime-authority result

Date: 2026-08-02

Outcome: **DENO-FAMILY-NO-GO**

Admission effect: none; `RUNTIME-001` remains unsupported and execution requiring it must refuse.

## Question and contract

After the Bun P0-0 NO-GO, can hardened full Deno or a minimal Capsule-owned `deno_core` runtime
credibly preserve the unchanged dependency-free JS/TS v0 contract with a small, reviewable
construction and acceptable one-shot startup?

The answer is no for the exact constructions tested. This is a disposition of two candidate
families, not a runtime/backend admission, validated-local claim, or product implementation.

## Exact candidates

- Full Deno v2.9.4, tag commit `14eea3160ae5834476aa3b9d317b8d41d991b982`.
  Official Linux/arm64 ZIP SHA-256:
  `111da5c05c240cfdc4340f234a0e3539d39dbcb6755221f19dcd60bacc8be5aa`.
  Unpacked binary SHA-256:
  `7d87b8a5225485ddea1786024f875b2b3422c31100ba11cb2e36b6125959e218`.
  Official source archive SHA-256:
  `95f9d8361809f2d2f3ee2d8a6955951dcf96c2f4bbeb540c2d6fdd9363e6dc94`.
- `deno_core` 0.409.0, crates.io checksum
  `16b44f6f84139c39ec2f8d1b838412eb84ecaa9837103f7b12169896fd8778b4`, from the
  same Deno tag. The locked graph uses `v8` 150.2.0, checksum
  `c7f4e905df70d6c00b95e69c5f0831fd5eb5889b0116ae2b30293578c19cd1bc`.
  The independently hashed official Linux/arm64 V8 archive is
  `8d91df74c8a671c23f880e64038023f49e07ca85c96e15d76a87e2aac9b20595`.

[TOOLCHAIN.md](TOOLCHAIN.md) and [SOURCE_INVENTORY.md](SOURCE_INVENTORY.md) retain the
source/build identities, official references, licenses, and review surface.

## Full Deno result

The exact profile used `env -i` followed by fixed `HOME`, `DENO_DIR`, cache/KV modes,
package/config discovery, prompt/update, and color values; a fixed non-writable cwd; no TTY; and
explicit no-config, no-lock, no-npm, no-remote, no-node-modules, no-code-cache, cached-only, and deny
flags for read, write, network/import, environment, system information, subprocess/signals, and FFI.
Cache and KV databases were in-memory; V8 code caching was off; all remaining `DENO_DIR` state was
confined to a new tmpfs destroyed with the container; and package.json auto-resolution, prompts,
and update checks were disabled. The external Docker layer removed external/container networking
(loopback remained), used a read-only root, dropped capabilities, set no-new-privileges, bounded
PIDs/RAM/CPU, selected a non-root UID, and fixed descriptors.

That profile did not close the authority surface:

- An entry module's static `./secondary.js` import succeeded despite `--deny-read` and
  `--deny-import`, confirming the documented initial-module-graph exemption. A dynamic `data:`
  module also loaded; HTTPS, JSR, and npm routes refused under the exact profile.
- A blob/data Worker executed under all deny flags. Node `worker_threads.Worker` remained
  constructible, and Node compatibility was still present.
- Sending SIGUSR1 to the process opened an inspector listener on `127.0.0.1:9229` without an
  inspector flag. Container `--network none` still preserves loopback.
- `localStorage` and CacheStorage remained available through runtime-internal storage paths not
  governed by ordinary read/write permissions. The exact profile confined their state to tmpfs
  destroyed on exit, so this observation does not claim cross-attempt persistence.
- Node compatibility exposed `process.binding("fs")`; direct high-level filesystem, child process,
  native loading, network, environment, and system probes were denied, but the compatibility
  machinery was not structurally absent.
- A deliberately inherited descriptor 9 could not be read through Node `fs.readSync` and returned
  `EBADF`; the exact external profile must continue to close every nonessential descriptor.
- The syscall trace used four thread IDs, an AF_UNIX socket pair, and a 256 MiB
  `PROT_READ|PROT_WRITE|PROT_EXEC` mapping. Applying a no-exec/no-thread syscall profile before
  initial `execve` would prevent the runtime itself from starting.

These are construction failures even though many individual APIs correctly returned permission
errors. A finite API corpus cannot prove closure, and the external layer cannot make unremovable
runtime features absent. Full Deno is not a candidate.

## `deno_core` result

The prototype is materially smaller at execution time: it registers no Capsule ops, passes no
module loader, disables inspector activation, uses V8 `--jitless --random-seed=42`, ingests bounded
regular files in the trusted Rust wrapper, executes one main ESM source, and returns bounded JSON.
No filesystem, network, subprocess, FFI, Node/npm, Worker, inspector, or persistence extension is
registered. Static imports fail through `NoopModuleLoader`; dynamic import reaches a disabled core
operation and fails the event loop. Raw TypeScript fails V8 parsing.

The construction nevertheless fails the requested small explicit-op invariant. `JsRuntime`
physically registers 99 built-in core ops before extension middleware runs. The prototype allows
three bootstrap-required ops and calls `op.disable()` for the other 96. All 99 remain visible in
`Deno.core.ops` during bootstrap and remain compiled and registered. The three sampled disabled
slow calls threw `Error`, but upstream's disabled-fast-call path contains a fail-soft/no-op TODO;
middleware denial is not the same as physical omission. A post-bootstrap global scrub narrows the
workload surface, but cannot establish that omitted native authority was never registered.

The locked Linux/arm64 release binary is 68,427,440 bytes, SHA-256
`da1e5ec5bc56c6856b3972ebbf65bf4c6f62c8fef58cbd8d8ae9bfb1725a6d0d`. The upstream
`libs/core` source alone was 126 files and 68,711 Rust/JavaScript lines in the selected archive;
the locked prototype graph contains 193 packages. This is smaller than full Deno, but is not yet
the required physically closed, reviewable construction.

The explicit mutation manifest refuses attempts to enable an op, add an extension, add a module
loader, activate inspector, or remove `--jitless`. Those tests validate the prototype manifest,
not the immutable absence of built-in ops. A custom startup snapshot was deliberately not retained:
a snapshot binds extension order/names but does not repair built-in physical registration or prove
middleware semantics. `deno_core` is not a candidate at this checkpoint.

## TypeScript disposition

`deno_core` does not include full Deno's TypeScript pipeline. Two designs were evaluated:

1. **Deterministic pre-approval transformation (preferred for a future experiment).** Pin an exact
   `deno_ast`/SWC graph, media type, options, and source-map policy. Bind original TS bytes/digest,
   exact executable JS bytes/digest, source map, and transformer/toolchain identity into the typed
   registered plan before approval. The retained `deno_ast` 0.53.3 `transpiling` surface resolves
   to 179 dependency packages beyond the marker package. This preserves exact approved executable
   bytes and keeps that graph out of the execution runtime, but moves it into the trusted plan-
   construction/release review surface and requires a coordinated object-model/schema/type/ADR
   change.
2. **Trusted in-bundle transformer.** This adds the broader `deno_ast`/SWC graph to the runtime TCB.
   Approving only TS and producing JS after approval would violate the current approved-byte
   semantics unless the contract explicitly changed. At minimum it brings the same 179-package
   resolved transformation graph into the live runtime bundle and couples runtime admission to it.

No transformer was implemented because the runtime construction already failed. JS/TS scope and
approved-byte semantics were not weakened silently.

## Decision and next bounded experiment

Stop at **DENO-FAMILY-NO-GO**. No Proposed ADR superseding ADR-0003 is justified because no
candidate was selected. The runtime-neutral protocol and prohibited-power contract remain intact.

If the orchestrator authorizes another local-only experiment, fork the exact `deno_core` source and
physically omit every nonessential built-in op before registration, then rework the minimum
bootstrap until the final operation table contains only hand-reviewed entries. Only after that
passes should the experiment:

1. build a reviewed snapshot containing that exact extension table and reproduce it twice;
2. enforce a post-loader `--jitless` syscall/descriptor seal denying sockets, process creation and
   further executable mappings while preserving only observed required threads;
3. mutation-test physically restoring each prohibited op/extension/loader and require manifest or
   external-policy refusal;
4. independently evaluate deterministic pre-approval `deno_ast` 0.53.3 transformation and exact
   plan binding.

If the physical-op patch is broad or the bootstrap depends on unreviewable native surface, stop
without proceeding to the snapshot or TypeScript work.

## Limitations

- Performance samples are warm-page-cache one-shot process measurements, not cold-kernel-cache
  boot measurements.
- The official full-Deno binary's complete transitive notices/SBOM were not present in the release
  ZIP, and the selected `v8` crate excludes vendored `LICENSE*` files. Supply-chain admission is
  therefore incomplete independently of the authority result.
- The measurement image's Debian packages were obtained from live indices. It is not an
  admissible/reproducible builder.
- The experiment did not add a Supervisor, backend, guest, runtime admission, or product import.
