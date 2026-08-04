# Full Deno versus `deno_core`

All runtime measurements used the owned isolated Linux/arm64 development container. Thirty
one-shot samples per case were taken with warm page cache and GNU `time` at 0.01-second resolution.
The interval includes process start, runtime initialization, TypeScript transform where applicable,
fixture execution, JSON completion, and exit.

| Construction | Source input | Time min / p50 / p95 / max / mean (s) | RSS min / p50 / p95 / max / mean (KiB) |
| --- | --- | --- | --- |
| full Deno v2.9.4 | TS | 0.040 / 0.040 / 0.050 / 0.050 / 0.044 | 40,472 / 40,712 / 40,796 / 40,848 / 40,688.4 |
| full Deno v2.9.4 | JS | 0.040 / 0.040 / 0.050 / 0.180 / 0.049 | 39,732 / 39,956 / 40,204 / 40,204 / 39,966.0 |
| `deno_core` 0.409.0 | JS | 0.020 / 0.020 / 0.030 / 0.090 / 0.025 | 20,160 / 20,348 / 20,476 / 20,476 / 20,367.1 |

Raw samples are in [performance.raw.txt](evidence/2026-08-02/performance.raw.txt).

| Dimension | Full Deno v2.9.4 | Minimal `deno_core` 0.409.0 |
| --- | --- | --- |
| Exact binary | 94,279,496 B; SHA-256 `7d87b8a5...e218` | 68,427,440 B; SHA-256 `da1e5ec5...6d0d` |
| Source/root surface | Source archive 34,010,635 B compressed, 152,300 KiB / 17,257 expanded files | `libs/core`: 126 files / 68,711 Rust+JS LOC; prototype graph: 193 packages |
| TypeScript | Native pinned pipeline (`typescript` 6.0.3, `deno_ast` 0.53.3) | Absent; raw TS fails; separate approved transform required |
| Module closure | Initial static graph and dynamic `data:` imports bypass denial; Node built-ins remain; external/package routes refuse | No loader; static import refuses; dynamic import reaches a disabled op and refuses |
| Native construction | Broad Deno CLI/runtime/extensions/Node compatibility | No ambient extensions, but 99 built-in core ops physically registered |
| Inspector/Worker | SIGUSR1 inspector and blob Worker remain reachable | Inspector false; Worker absent after minimal bootstrap |
| Storage | localStorage/CacheStorage internally available but confined to per-container tmpfs | No storage extension |
| JIT/threads | 4 observed thread IDs; 256 MiB RWX mapping | 2 observed thread IDs; `--jitless`; no RWX mapping observed |
| Descriptors/syscalls | AF_UNIX socket pair; 43 `openat`; 38 `close` | no socket syscall; 15 `openat`; 15 `close` |
| Build/update posture | Official exact release/run, but complete SBOM/notices and independent reproducibility absent | Final rebuild locked/offline after initial fetch; V8 archive independently hashed; no two-builder proof |
| Mutation coverage | API/alias/config/import/worker/inspector/storage/descriptor probes | manifest refuses op/extension/loader/inspector/JIT changes; not physical-op mutation closure |
| Decision | NO-GO | NO-GO at construction checkpoint |

The syscall traces contain only the selected syscall families and are not complete behavioral
traces: [full.strace](evidence/2026-08-02/full.strace) and
[core.strace](evidence/2026-08-02/core.strace).
