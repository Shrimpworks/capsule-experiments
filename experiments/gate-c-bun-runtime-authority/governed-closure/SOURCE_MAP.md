# Bun 1.3.14 governed-closure source map

This map is read-only source evidence for Bun tag `bun-v1.3.14`, commit
`0d9b296af33f2b851fcbf4df3e9ec89751734ba4`. It extends the retained parent
[`SOURCE_INVENTORY.md`](../SOURCE_INVENTORY.md) only far enough to identify the construction seams
that a governed profile would have to close. It is not a reviewed patch or proof of absence. The
subsequent [exact construction review](CONSTRUCTION_REVIEW.md) expanded this initial map to a
40-hand-authored-file plus 10-generated-output conservative lower bound and triggered NO-GO.

## Registry construction

The generated internal-module registry is assembled by
`src/codegen/internal-module-registry-scanner.ts`. It recursively assigns IDs to JavaScript modules
under `src/js/{bun,node,thirdparty,internal}` and appends native modules parsed from
`src/jsc/modules/_NativeModule.h`. `_NativeModule.h:27-45` includes the native `bun:jsc` and `bun`
object registrations. `src/jsc/bindings/ExposeNodeModuleGlobals.cpp:19-61` exposes registry aliases
including `ffi`, `child_process`, `cluster`, `inspector`, `sqlite`, `worker_threads`, and `jsc`.
`src/jsc/bindings/BunObject.cpp:947-1040` independently constructs the Bun shell and exposes FFI,
macro registration, spawn, and spawnSync on the global Bun object.

The registry is generated and lazy, but it is not profile-filtered. Closing only one JavaScript
alias leaves native object properties and other native modules reachable.

## Prohibited authority routes

| Authority | Workload-visible entry routes | Native or OS sink | Required construction consequence |
| --- | --- | --- | --- |
| Subprocess and executable replacement | `Bun.spawn`, `Bun.spawnSync`, Bun shell `$`, `node:child_process`, cluster fork, `process.execve` | `src/runtime/api/bun/spawn.zig:297-496` selects Bun/system spawn; `src/jsc/bindings/bun-spawn.cpp` reaches `vfork`/`fork` and `execve`; `src/jsc/bindings/BunProcess.cpp:1632-1815,4296-4301` exposes replacement-image execution | Omit every registry/global/compatibility route and add a post-initialization kernel process/exec seal before workload evaluation. |
| FFI and addons | `Bun.FFI`, `bun:ffi` `dlopen`/`cc`, CommonJS `.node`, `process.dlopen`, N-API-backed native plugin callbacks | `src/js/bun/ffi.ts:76,418-479`; `src/js/builtins/CommonJS.ts:164`; `src/jsc/bindings/BunProcess.cpp:390-535,4296`; `src/js/builtins/BundlerPlugin.ts:168-296`; `src/jsc/bindings/JSBundlerPlugin.cpp:251-327` | Remove the native and JS exports plus `.node`/N-API/native-plugin loader routes; stage no attacker-controlled executable library bytes. |
| SQLite extensions | `bun:sqlite` `Database.loadExtension` | `src/js/bun/sqlite.ts:446-447`; `src/jsc/bindings/sqlite/JSSQLStatement.cpp:1330,1851` calls `sqlite3_load_extension` | Remove the workload method or omit the module; addon denial does not cover it. |
| Inspector | `bun:jsc.startRemoteDebugger`, `node:inspector`, CLI inspector options, `BUN_INSPECT*` | `src/jsc/modules/BunJSCModule.h:69-137,987,1027`; `src/jsc/VirtualMachine.zig:1340-1368` | Omit inspector modules/functions and environment/argv activation paths at build time. |
| Worker | global `Worker` and `node:worker_threads` | `src/jsc/web_worker.zig:279-328,472-474,514-616`; worker VMs load their own entry point and propagate only the addon restriction | Omit Worker construction and compatibility exports; otherwise every profile restriction must be independently propagated to each Worker VM. |
| Macro | `Bun.registerMacro`, macro imports, bunfig macro mapping | `src/jsc/bindings/BunObject.cpp:1025`; `src/cli/bunfig.zig:1151-1159`; bundler macro transform paths | Omit registration and macro transform construction; `--no-macros` alone is a runtime flag. |
| Preload, config, and environment files | bunfig `preload`, CLI preload/config, `.env`, inherited `BUN_INSPECT*` | `src/cli/bunfig.zig:124-181,238-261`; `src/cli/Arguments.zig` sets `disable_default_env_files`; `src/jsc/VirtualMachine.zig` consumes inspection environment | Fixed empty environment/cwd and fixed argv remain required, but a closed profile also omits or rejects discovery/preload inputs before workload evaluation. |
| Package install and dynamic package resolution | ordinary package resolution, local `node_modules`, `resolveAndAutoInstall`, fallback install | `src/resolver/resolver.zig:661-987`; CLI global-cache modes in `src/cli/Arguments.zig` | Use a profile-specific resolver that admits only the exact entry source and an explicit safe built-in set; `--no-install` disables automatic installation but not local package loading. |

## Syscall and external-enforcement route

On the intended Linux guest, the process sinks ultimately include `fork`/`vfork`/`clone` or
`clone3`, `posix_spawn`, `execve`, and `execveat`. A launcher-installed filter before executing Bun
cannot both allow Bun's initial `execve` and structurally deny every later `execve` without a
stateful broker or cooperation from the runtime. A stateful seccomp-user-notification broker would
add a high-complexity process/memory-inspection boundary and was not selected.

The narrow candidate was therefore a runtime self-seal: initialize the engine and indispensable
runtime threads, then install `no_new_privs` plus a seccomp policy immediately before evaluating
registered source. The policy would deny `fork`, `vfork`, process-forming `clone`/`clone3`,
`execve`, and `execveat`, while preserving only proven indispensable thread creation. This cannot
be specified honestly without building and tracing the exact runtime: classic seccomp cannot
dereference `clone3` arguments, and Bun/JSC may create runtime threads lazily. The construction
patch would also have to make the seal mandatory and fail closed for the Capsule profile.

No generic `dlopen` syscall filter is available. JIT code generation and runtime-owned dynamic
library loading make broad executable-memory or native-load denial a compatibility question. The
native closure argument must therefore combine construction-level removal of every attacker-facing
loader, an empty/no-exec workload staging design, and exact final-binary review.

## Initial minimum maintenance surface observed

Before generated outputs, tests, build-profile wiring, and the self-seal implementation, the map
already crosses at least these 21 source units:

1. `src/codegen/internal-module-registry-scanner.ts`
2. `src/jsc/modules/_NativeModule.h`
3. `src/jsc/bindings/ExposeNodeModuleGlobals.cpp`
4. `src/jsc/bindings/BunObject.cpp`
5. `src/jsc/bindings/BunProcess.cpp`
6. `src/jsc/modules/BunJSCModule.h`
7. `src/jsc/VirtualMachine.zig`
8. `src/jsc/web_worker.zig`
9. `src/js/node/child_process.ts`
10. `src/js/internal/cluster/primary.ts`
11. `src/runtime/api/bun/spawn.zig`
12. `src/jsc/bindings/bun-spawn.cpp`
13. `src/js/bun/ffi.ts`
14. `src/js/bun/sqlite.ts`
15. `src/jsc/bindings/sqlite/JSSQLStatement.cpp`
16. `src/js/builtins/CommonJS.ts`
17. `src/js/builtins/BundlerPlugin.ts`
18. `src/jsc/bindings/JSBundlerPlugin.cpp`
19. `src/cli/Arguments.zig`
20. `src/cli/bunfig.zig`
21. `src/resolver/resolver.zig`

This was a lower bound, not a patch-size estimate. It omitted duplicate builtin/source registries,
process-native tables, build-profile propagation, Worker/global LUTs, SQLite compile controls, and
generated outputs. [`CONSTRUCTION_REVIEW.md`](CONSTRUCTION_REVIEW.md) is the terminal maintenance-
surface decision. Any Bun update changes the generated registry, native bindings, module resolver,
JSC/runtime behavior, or syscall profile and invalidates the source evidence.
