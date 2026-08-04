# Gate C P0-0 Bun runtime-authority results

Date: 2026-08-02

Decision: **fail for stock Bun 1.3.14; `RUNTIME-001` remains unsupported and execution requiring
the v0 prohibited-power contract must refuse. Continue only with a governed Bun profile patch plus
an exact external enforcement mechanism; if that branch fails, select an alternate runtime and
update ADR-0003.**

This result does not admit a runtime, authorize libkrun to handle user bytes, or change Capsule's
development posture. It preserves the no-subprocess/no-FFI/native-addon/inspector/macro/
environment-file/package-install contract.

## Hypothesis and boundary

Hypothesis: the exact pinned stock Bun/launcher profile can structurally refuse every prohibited
runtime power, including aliases, Workers, loader paths, and deliberately restored primitives.

The hypothesis failed early. Source construction exposes independent subprocess, executable-
replacement, FFI, native-loading, and inspector paths with no `--no-spawn` or `--no-ffi` control.
The exact binary then exercised those paths despite all available relevant deny flags.

All fixtures are repository-owned experiment bytes. No user content was connected. Docker was an
offline oracle for the exact Linux binary, not a substitute for libkrun or evidence of containment.
Positive capability observations invalidate stock authority closure even though the oracle kernel
differs from the planned guest kernel. Docker denials would not have established a pass.

## Exact inputs and environment

| Item | Observed value |
| --- | --- |
| Capsule base | `32b40fa828c2eb5055d7de6725506c94aae52cdc` (`main` at task start) |
| Bun source | tag `bun-v1.3.14`, commit `0d9b296af33f2b851fcbf4df3e9ec89751734ba4` |
| OCI index | `oven/bun@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04` |
| Local selected image | Linux/arm64, ID `sha256:bc9f668f713165b415f680bdffb9077f3355886fc1aa8a087f2fe258da0c7a58` |
| Bun binary | `/usr/local/bin/bun`, SHA-256 `37141662ebed915a2ab89313156e455e2a1374395f5f6760d06407f49406f086` |
| Runtime report | `1.3.14+0d9b296af` / full revision `0d9b296af33f2b851fcbf4df3e9ec89751734ba4` |
| Runtime identity | UID/GID 65534, no supplementary privileged group |
| Oracle kernel | LinuxKit `6.12.76`; planned libkrun evidence pins Linux `6.12.91`, so kernel-dependent denials were not claimed |
| Host | Apple M1 Max, macOS 26.5.2 (25F84), Darwin 25.5.0 |
| Docker | client 29.6.1; local daemon image-ID readback succeeded |

The execution envelope used `--pull=never`, `--network none`, a read-only root, dropped Linux
capabilities, `no-new-privileges`, UID/GID 65534, PID limit 64, 256 MiB, one CPU, a read-only fixture
mount, and a 16 MiB no-exec tmpfs work directory. The launcher shell then used `env -i`, fixed
`PATH`, and intentionally inherited read-only FD 3 for the descriptor test.

## Commands

The exact source was obtained and verified with:

```sh
git clone --depth 1 --branch bun-v1.3.14 https://github.com/oven-sh/bun.git \
  /private/tmp/capsule-gate-c-p0-0-bun-src-network
./experiments/gate-c-bun-runtime-authority/source-inventory.sh \
  /private/tmp/capsule-gate-c-p0-0-bun-src-network
```

The exact runtime corpus was:

```sh
./experiments/gate-c-bun-runtime-authority/run.sh
```

`run.sh` records the fully expanded Docker arguments and case argv in retained source. The final
reviewed run was `20260802T150457Z-87021`; selected output is retained under
`evidence/2026-08-02/`.

## Observed results

The nominal workload received these relevant fixed Bun arguments:

```text
--no-addons --no-macros --no-env-file --no-install --config=/dev/null
```

| Case | Exact observation | Disposition |
| --- | --- | --- |
| Direct/aliased Bun subprocess | `Bun.spawn` and an aliased `Bun.spawnSync` each executed `/bin/echo`, exit 0 | Prohibited power available |
| Direct/aliased Node subprocess | `execFileSync` and aliased `spawnSync` each executed `/bin/echo`, exit 0 | Prohibited power available |
| Bun shell | `$` executed `/bin/echo`, exit 0 | Prohibited power available |
| Executable replacement | `process.execve` replaced Bun with `/bin/echo`, exit 0 | Prohibited power available |
| Direct/aliased FFI | `bun:ffi.dlopen` and an aliased loader called libc `getpid`/`getppid` | Prohibited power available despite `--no-addons` |
| TinyCC FFI | `bun:ffi.cc` reached TinyCC but failed because the slim image lacks the static C development library | Environment blocker, not a runtime denial |
| Node addon path | `--no-addons` refused `process.dlopen`; removing the flag changed the same fixture to ELF loader error `file too short` | Denial and restoration oracle both sensitive; no valid addon binary was built |
| SQLite native loader | `Database.loadExtension("libc.so.6")` reached the loader and failed at the expected missing SQLite entry symbol | Independent native-loading path available despite `--no-addons` |
| Workload inspector | `bun:jsc.startRemoteDebugger` started `127.0.0.1:39230` from source | Prohibited power available without inspector argv |
| Inspector argv/env | `--inspect` printed a listening WebSocket URL; `BUN_INSPECT` was consumed when deliberately restored | Activation controls sensitive |
| Macro | `--no-macros` refused the macro; removing it produced `macro-executed` | Denial and restoration oracle both sensitive |
| Environment/config | Fixed env + `--no-env-file --config=/dev/null` produced three nulls; removing controls loaded `.env`, inherited env, and bunfig preload | Denial and restoration oracle both sensitive |
| Dynamic local package | A local package imported successfully under `--no-install` | Flag blocks auto-install, not local package loading |
| Missing package | `left-pad` failed under both `--no-install` and restored `--install=fallback` in this offline fixture | Restoration was inconclusive; source still contains `resolveAndAutoInstall` |
| Worker | A Worker executed `Bun.spawnSync`, called libc through `bun:ffi`, and read FD 3 | Powers and descriptor authority reach Workers |
| Descriptor | Main VM and Worker both read `descriptor-inherited` through `/proc/self/fd/3` | Exact launcher/child FD allowlist is mandatory |

The source-level registry and syscall/module-loading map is in [SOURCE_INVENTORY.md](SOURCE_INVENTORY.md).
The strongest independent-path findings are:

- `--no-addons` governs `process.dlopen`/addon conditions but not `bun:ffi` or SQLite extensions;
- fixed argv does not prevent workload source from calling `bun:jsc.startRemoteDebugger`;
- `--no-install` does not remove local package loading and cannot prevent explicit installation
  while stock subprocess/`execve` paths remain; and
- Workers retain the stock process/FFI surface and share inherited process descriptors.

## Construction decision

Stock Bun cannot close the advertised authority contract. The available flags are useful negative
controls for addons, macros, environment files, and auto-install, but they do not form a closed
profile and cannot deny spawn, FFI, direct inspector activation, SQLite extensions, or restored
aliases.

The remaining Bun branch is a **governed patch plus external mechanism**, not another stock-flag
combination:

1. Add a build-time closed Capsule profile that omits `Bun.spawn`/`spawnSync`, Bun shell process
   execution, `node:child_process`, cluster child creation, `process.execve`, `Bun.FFI`, `bun:ffi`,
   `process.dlopen`, `.node`/N-API and native plugin loading, SQLite extension loading,
   `bun:jsc.startRemoteDebugger`, and macro execution/registration.
2. Keep fixed launcher argv/environment/cwd, isolated source/input bytes, no package tree, no-exec
   source/input storage, and exact parent/child FD manifests. Treat existing flags as defense in
   depth only.
3. Install a kernel-enforced child-exec/process-creation denial after Bun engine initialization but
   before user source evaluation. It must preserve only explicitly admitted Worker threads and
   mutation-deny a deliberately restored spawn and `process.execve` primitive. No exact compatible
   seccomp/LSM implementation was built here.
4. Review the governed diff and build inputs, rerun the complete direct/alias/Worker/native/config/
   descriptor corpus, and restore each prohibited primitive one at a time. Any source or runtime
   update invalidates the result.

A generic native-load syscall filter was not demonstrated and may conflict with Bun's JIT and
runtime library loading. Native closure therefore depends on both construction-level removal and a
no-exec/no-attacker-library staging design. This must be proved on final installed libkrun bytes;
it is not inferred from Docker.

If that governed branch cannot preserve the required JIT/Worker behavior while surviving restored-
primitive mutations, Capsule must stop Bun-first implementation, evaluate an alternate runtime,
and revise ADR-0003. The product contract must not be weakened implicitly.

## Limitations and precise blockers

- Docker used the exact Bun Linux binary but not the libkrun/HVF backend or pinned guest kernel.
  This is sufficient to fail stock exposed powers, not to pass any future denial mechanism.
- No governed Bun patch was authored or built, so no source-diff, patched-binary, external seccomp/
  LSM, or restored-primitive enforcement result exists.
- `bun:ffi.cc` reached TinyCC but lacked the slim image's C development library. Direct and aliased
  libc FFI already proved callable native authority; the failed compile is not counted as denial.
- The addon mutation used an intentionally invalid `.node` file. It proved the loader gate changed
  from explicit denial to ELF processing, not successful N-API execution.
- Auto-install restoration did not differ in the offline fixture. Source proves the route exists,
  but this run does not claim a successful package download or installation. Network remained
  disabled throughout.
- A finite corpus cannot prove absence. A future pass requires generated registry completeness,
  syscall/module-path closure, governed diff review, and deliberate restoration mutations.

## Contract and ADR consequence

- `RUNTIME-001` remains `unsupported`; execution requiring it refuses.
- ADR-0003 remains accepted only in its already conditional sense: stock Bun is rejected, and Bun
  can remain first only through a governed patched/external profile that later passes P0-0.
- ADR-0022 and libkrun remain blocked from user bytes. This experiment makes no backend claim.
- No new product responsibility, privilege, schema, runtime profile, or posture was introduced.

## Retained artifacts

- `run.sh`: exact offline execution envelope and mutation cases;
- `source-inventory.sh`: exact-commit source manifest and selected construction inventory;
- `probes/`: direct, aliased, Worker, descriptor, macro, config, inspector, package, FFI, and addon
  fixtures;
- `SOURCE_INVENTORY.md`: reviewed registry/syscall/module-loading synthesis;
- `evidence/2026-08-02/`: selected exact runtime identity, nominal JSON, mutation output, and source
  manifest.

Ignored `.runs/` directories are disposable raw reruns. Retained source and selected evidence remain
non-production and must not be imported by product packages.
