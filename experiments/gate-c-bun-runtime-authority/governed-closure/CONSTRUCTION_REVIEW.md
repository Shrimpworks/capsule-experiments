# Bun 1.3.14 governed-construction review

Date: 2026-08-02

Decision: **NO-GO under the P0-0 fail-fast reviewability rule.** Capsule must investigate an
alternate runtime and reconsider or supersede ADR-0003. The prohibited-power contract remains
unchanged and `RUNTIME-001` remains unsupported.

## Question and defensive scope

This local-only review asked whether exact Bun tag `bun-v1.3.14`, commit
`0d9b296af33f2b851fcbf4df3e9ec89751734ba4`, could support a small, reviewable mandatory Capsule
construction profile that removed every workload route to subprocess/exec replacement, native
loading, inspector, Worker, macro/preload/config/environment-file discovery, and package
installation or dynamic resolution. It used only the clean retained checkout, the repository's
fixed fixtures, and the already retained builder identity. It did not access a backend, create a
guest, run user code, or weaken a repository safeguard.

## Fail-fast observation

The prior source map's 21-file estimate was explicitly a lower bound. Exact review expanded the
minimum honest construction surface to **40 hand-authored source files plus 10 generated outputs**.
Changes to the duplicated process/native binding tables would likely add two more generated LUTs.
Package-manager and native-loader internals may increase the count further.

This is not a line-count objection. The affected units independently construct or duplicate
authority:

- build-profile identity and propagation;
- generated internal-module registries and native-module enums;
- duplicate builtin/source/alias registries;
- ESM, CommonJS, `process.binding("natives")`, `process.getBuiltinModule`, and global getters;
- `Bun`, `process`, Worker, addon, N-API/plugin, and SQLite-extension sinks;
- inspector, macro, preload, bunfig, environment-file, and resolver/install lifecycle paths; and
- profile-specific negative assertions and generated-output review.

A central import deny list would reduce policy duplication but would not omit or mutation-protect
the native sinks and alternate loaders. Removing only API tables would demonstrate finite API
denial, not construction closure. Each restoration class therefore needs its own sink guard or an
independent external denial. That is the source of the maintenance surface, not optional test
polish.

The reproducible read-only inventory is [`review-construction-surface.sh`](review-construction-surface.sh).
Its retained output is [`evidence/2026-08-02/construction-review.txt`](evidence/2026-08-02/construction-review.txt).

## External process/exec seal finding

A narrow Linux/arm64 self-seal appears conditionally feasible for process creation and executable
replacement only. The precise seam is `src/bun.js.zig` immediately before `vm.loadEntryPoint()`:
JSC and the main VM exist, while registered source has not been evaluated.

The candidate would require `no_new_privs` and a TSYNC seccomp filter that denies `execve` and
`execveat`, denies process-shaped legacy `clone`, and treats `clone3` as unavailable because classic
seccomp cannot inspect its pointed-to arguments. It cannot deny every `clone`: Bun's runtime
transpiler creates lazy work-pool threads after this seam, and JSC enables concurrent JIT. Exact
thread flags and `clone3` fallback therefore require tracing the exact release binary.

This seal cannot distinguish an indispensable runtime thread from a deliberately restored Worker,
and there is no generic `dlopen` syscall filter that is assumed compatible with JSC JIT and
runtime-owned libraries. Worker and native loading still require the broad construction closure
above. A self-seal prototype cannot rescue the reviewability failure or justify a partial pass.

## Decision rule application

The task required an immediate retained NO-GO when the patch became broad or unreviewable. That
condition occurred during exact source review, before a candidate diff existed. Therefore:

- no Bun source was changed;
- no governed binary was built;
- no governed binary digest or retained binary exists;
- no runtime/JIT, syscall, descriptor, or restoration-mutation run was started; and
- the previously retained stock release build remains a prerequisite identity only, never runtime
  admission.

The empty candidate diff has SHA-256
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. Stopping at the first
mandatory fail-fast condition avoids producing probe results that could be misread as closure.

## Exact lower-bound maintenance surface

### Build/profile identity

1. `scripts/build/profiles.ts`
2. `scripts/build/config.ts`
3. `scripts/build/flags.ts`
4. `build.zig`
5. `scripts/build/zig.ts`
6. `src/bun_core/env.zig`

### Registries, code generation, and duplicate aliases

7. `src/codegen/internal-module-registry-scanner.ts`
8. `src/codegen/bundle-modules.ts`
9. `scripts/build/codegen.ts`
10. `src/jsc/modules/_NativeModule.h`
11. `src/jsc/bindings/InternalModuleRegistry.h`
12. `src/jsc/bindings/InternalModuleRegistry.cpp`
13. `src/resolve_builtins/HardcodedModule.zig`
14. `src/jsc/bindings/isBuiltinModule.cpp`
15. `src/jsc/modules/NodeModuleModule.cpp`
16. `src/jsc/bindings/ProcessBindingNatives.cpp`

### Dispatch, globals, and process authority

17. `src/jsc/bindings/ModuleLoader.cpp`
18. `src/jsc/ModuleLoader.zig`
19. `src/jsc/bindings/ExposeNodeModuleGlobals.cpp`
20. `src/jsc/bindings/BunObject.cpp`
21. `src/runtime/api/BunObject.zig`
22. `src/jsc/bindings/BunObject+exports.h`
23. `src/jsc/bindings/BunProcess.cpp`

### Native sinks and restoration backstops

24. `src/runtime/api/bun/spawn.zig`
25. `src/jsc/bindings/bun-spawn.cpp`
26. `src/jsc/bindings/ZigGlobalObject.lut.txt`
27. `src/jsc/bindings/webcore/JSWorker.cpp`
28. `src/jsc/bindings/webcore/Worker.cpp`
29. `src/js/builtins/CommonJS.ts`
30. `src/bundler/options.zig`
31. `src/jsc/bindings/JSBundlerPlugin.cpp`
32. `src/jsc/bindings/sqlite/JSSQLStatement.cpp`
33. `scripts/build/deps/sqlite.ts`
34. `src/jsc/modules/BunJSCModule.h`

### Configuration, preload, macro, resolution, and lifecycle

35. `src/cli/Arguments.zig`
36. `src/cli/bunfig.zig`
37. `src/cli/run_command.zig`
38. `src/jsc/VirtualMachine.zig`
39. `src/resolver/resolver.zig`
40. `src/bun_core/feature_flags.zig`

### Mandatory generated outputs

1. `InternalModuleRegistry+numberOfModules.h`
2. `InternalModuleRegistry+enum.h`
3. `InternalModuleRegistry+createInternalModuleById.h`
4. `InternalModuleRegistryConstants.h`
5. `ResolvedSourceTag.zig`
6. `SyntheticModuleType.h`
7. `NativeModuleImpl.h`
8. `BunObject.lut.h`
9. `ZigGlobalObject.lut.h`
10. `BunProcess.lut.h`

`ProcessBindingNatives.lut.h` and `NodeModuleModule.lut.h` are conditional additions if their
duplicated tables are changed rather than guarded elsewhere.

## Retained identities and limitations

- Exact source: `bun-v1.3.14`, commit
  `0d9b296af33f2b851fcbf4df3e9ec89751734ba4`.
- Prior exact stock release builder: image ID
  `sha256:47b2d086f6f131b2ed4a30e43dc409bd87c5dd4cc15900bc8888819e237c86e5`.
- Prior stock release binary: 94,907,656 bytes, SHA-256
  `c06708363d3903ee3e2fd11622ca14175784acaf4006b5d372bbb5588b31d52b`.
- The stock binary identity is inherited prerequisite evidence from the merged toolchain follow-up;
  it was not rebuilt or treated as governed evidence here.
- The prior debug allocator assertion remains a limitation. No assertions were disabled and no
  debug pass is claimed.
- The 40+10 count is a conservative lower bound, not proof that a safe patch can never exist.
- No finite source inventory proves absence. It is sufficient here only to apply the task's
  reviewability stop condition.
- This result does not select or validate an alternate runtime.

## Required next action

Investigate alternate runtimes against the same dependency-free JS/TS, JIT/runtime, native-loader,
process/exec, configuration, and dynamic-resolution construction criteria. Record the selection in
a new ADR that supersedes ADR-0003's Bun-first implementation choice while retaining its
runtime-neutral protocol decision. Do not relax Capsule's authority contract to keep Bun.
