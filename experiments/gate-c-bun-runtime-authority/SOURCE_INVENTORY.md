# Bun 1.3.14 construction inventory

This inventory is source evidence for Bun tag `bun-v1.3.14`, commit
`0d9b296af33f2b851fcbf4df3e9ec89751734ba4`. It is not a claim about later Bun revisions. Exact
file digests are retained in `evidence/2026-08-02/source-manifest.txt`; `source-inventory.sh`
regenerates the selected line inventory from an exact checkout.

## Registry construction

`src/codegen/internal-module-registry-scanner.ts` recursively assigns internal module IDs from
`src/js/{bun,node,thirdparty,internal}` and then appends the native module list parsed from
`src/jsc/modules/_NativeModule.h`. The latter registers `bun:jsc` and the native Bun object. The
generated registry is lazy, not authority-filtered per profile.

The exposed native/global surface includes:

| Surface | Source seam at the pinned commit | Authority consequence |
| --- | --- | --- |
| `Bun.FFI` | `src/jsc/bindings/BunObject.cpp:953` | Native FFI backend is on the global Bun object. |
| `Bun.registerMacro` | `src/jsc/bindings/BunObject.cpp:1025` | Macro registration remains present even when macro imports are denied by a CLI flag. |
| `Bun.spawn`, `Bun.spawnSync` | `src/jsc/bindings/BunObject.cpp:1039-1040` | Direct child-process primitives are native Bun object functions. |
| `bun:ffi` | `src/jsc/bindings/ExposeNodeModuleGlobals.cpp:21` and `src/js/bun/ffi.ts` | Exposes `dlopen`, symbol linking, callbacks, and TinyCC `cc`. |
| `node:child_process` | `src/jsc/bindings/ExposeNodeModuleGlobals.cpp:24` | JS compatibility layer delegates to Bun spawn. |
| `node:inspector`, `bun:jsc` | `src/jsc/bindings/ExposeNodeModuleGlobals.cpp:35,60` | `bun:jsc.startRemoteDebugger` can start a listener from workload source. |
| `node:worker_threads` | `src/jsc/bindings/ExposeNodeModuleGlobals.cpp:55` | Worker VMs retain the tested process/FFI surface and share process descriptors. |

## Process creation and executable replacement

- `src/js/node/child_process.ts:133,487,532,1333` implements `spawn`/`spawnSync` with
  `Bun.spawn`/`Bun.spawnSync`.
- `src/js/internal/cluster/primary.ts:91` implements cluster worker creation through
  `child_process.fork`.
- `src/jsc/bindings/BunObject.cpp` also exposes the Bun shell used by the tested `$` path.
- `src/jsc/bindings/BunProcess.cpp:1632,1815,4301` exposes `process.execve` and reaches the OS
  `execve` path on Linux.
- `src/runtime/api/bun/spawn.zig` selects system `posix_spawn` or `posix_spawn_bun`;
  `src/jsc/bindings/bun-spawn.cpp:156,160,303` contains Linux `vfork`, Darwin `fork`, and the
  eventual `execve`.

There is no `--no-spawn` match under `src/` at this revision. Removing one JS alias would not close
the other native/global/module routes or `process.execve`.

## Native loading

- `src/js/bun/ffi.ts:76,446,479` exposes native `dlopen` and TinyCC compilation independently of
  Node addons.
- `src/jsc/bindings/BunProcess.cpp:390,535,4296` implements `process.dlopen` with platform
  `dlopen`; CommonJS `.node` loading reaches it.
- `src/jsc/bindings/sqlite/JSSQLStatement.cpp:1330,1851` independently exposes
  `sqlite3_load_extension` through `bun:sqlite`.
- The `.node`/N-API loader and native plugin path are governed by `allow_addons`, but that switch
  does not govern `bun:ffi` or SQLite extension loading.

There is no `--no-ffi` match under `src/` at this revision. A native-addon-only patch would leave
independent native code paths.

## Inspector, macro, environment, config, and packages

- `src/jsc/modules/BunJSCModule.h:69-137,987,1027` implements and exports
  `startRemoteDebugger`; it is callable from workload source without a CLI inspector flag.
- `src/jsc/VirtualMachine.zig:1340-1368` also activates the debugger from `BUN_INSPECT` or
  `BUN_INSPECT_CONNECT_TO`.
- `--no-macros` sets `ctx.debug.macros` to disabled, and the exact mutation probe observed the
  expected denial. It is a useful defense-in-depth control, not removal of the macro registry.
- `--no-env-file` sets `disable_default_env_files`; `--config=/dev/null`, a fixed empty environment,
  and an isolated cwd are separately required to prevent bunfig and inherited-environment
  discovery. The mutation probe distinguished all three sources.
- `--no-install` sets the resolver global cache to disabled. The resolver still supports
  `resolveAndAutoInstall`, and local packages remain importable under `--no-install`. Manual package
  installation would also remain reachable through the stock process primitives.
- `src/jsc/web_worker.zig:472-474` explicitly propagates only `--no-addons` into the worker
  transform options and notes that limitation. No spawn/FFI deny option exists to propagate.

## Construction consequence

The exact stock registry has no profile-level allowlist that can omit the prohibited surfaces.
Runtime monkey-patching or deleting JS properties after startup would not be a closure argument:
aliases, native module creation, Workers, native loaders, and restored primitives remain separate
paths.

A Bun continuation therefore requires a governed build-time profile patch that removes every
claim-critical registry/export/loader path, plus an external kernel-enforced post-runtime child-
exec denial installed before user source evaluation. The latter must preserve only explicitly
admitted Worker threads and must mutation-deny a deliberately restored spawn/`execve` primitive.
No exact patch or compatible enforcement mechanism was built or validated in this experiment.

Native-loading closure additionally needs a no-exec source/input construction and removal of every
FFI/addon/SQLite/native-plugin path. No generic `dlopen` syscall filter compatible with Bun's JIT
was demonstrated. If the governed patch/external-mechanism branch cannot pass on final bytes,
Capsule must select an alternate runtime and update ADR-0003 rather than relax the v0 contract.
