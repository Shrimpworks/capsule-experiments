# Gate C libkrun console and lifecycle follow-up results

Date: 2026-07-31

Decision: **conditional pass for development-only bounded console capture and exact-process forced
teardown; no production or posture promotion.**

The tested host controller bounded retained stdout/stderr bytes, continued cancellation and wall
timeout while console readers were stalled, re-verified one recorded runner identity before every
signal, and forcibly removed non-cooperative and crash-recovered runners. Graceful guest shutdown,
host CPU quotas, host CPU-time quotas, and total host-memory limits did not pass and must not appear
as supported controls. The smallest tested minimal-Alpine profile that completed its workload was
one vCPU with 64 MiB configured guest RAM. The smallest evidenced Bun profile remains one vCPU with
256 MiB from the parent spike; this follow-up did not run Bun below that value.

## Environment and exact inputs

| Item | Observed value |
| --- | --- |
| Host | MacBookPro18,4, arm64 |
| macOS | 26.5.2 (25F84) |
| Hypervisor support | `kern.hv_support=1` |
| Xcode | 26.6 (17F113) |
| Apple clang | 21.0.0 |
| Go | 1.26.5 |
| Rust | 1.93.1 |
| libkrun | 1.19.4 at `728df8125077d0db44265f6e997c72b81b65c015` with the two parent-spike patches |
| libkrunfw / kernel | 5.5.0 / Linux 6.12.91 |
| Signing | Developer ID Application, Team ID `3DDR84M4JS`, hardened runtime |
| Signed runner SHA-256 | `f494cf736def7199921f2d7e3311774b70c807904225d50d987af808b0b74162` |
| Signed libkrun SHA-256 | `4cb543327c1cee64c2e4ee799d8e18843b1d69f7a9b570c7aba2904ddfffa533` |
| Signed libkrunfw SHA-256 | `4b79c24bd1f8f022d105782102fb77b43ccc0fa83e0923a595296d7744dcd443` |
| Immutable root disk SHA-256 | `b77998ecd6f9c732f7ca487d47fece7f060b4bd319cda3ac80b7a922077470db` |
| Controller SHA-256 | `2c4b736b6c2d090638c8bcd8498ebef018add08b7299baf5ed4aa922252bc565` |
| Identity helper SHA-256 | `2546538aa55e84fc32c26a69fc2ab38ed09e6c78f0c940cfff5875a674524636` |
| Final corpus summary SHA-256 | `0fcbfa2c423fa7b09ca7b9035692cdb9cf7baff73023d1b61bd4c01bbfc72f8b` |

Signing timestamps change rebuilt Mach-O hashes. These hashes identify the final evidence-point
bytes; source identity is separately pinned by commit, patches, and scripts.

## Commands

Build and execute:

```sh
CAPSULE_SIGNING_IDENTITY='Developer ID Application: Dylan Steele (3DDR84M4JS)' ./build.sh
./run-corpus.sh
```

Targeted harness checks used during iteration and final verification:

```sh
GOCACHE=/private/tmp/capsule-libkrun-console-go-cache go test ./...
./test-controller-crashes.sh
sh -n build.sh collect-environment.sh run-corpus.sh test-controller-crashes.sh
```

The final full run reported `corpus=PASS`. The bounded retained subset is under
[`evidence/2026-07-31`](evidence/2026-07-31).

## Mechanism under test

1. The signed runner accepts a closed profile name, configures libkrun vCPU/RAM values, creates no
   network or implicit vsock, mounts the immutable raw root, and waits on the inherited
   record-before-start pipe.
2. The controller starts separate stdout and stderr pipes. Each drain uses one 32 KiB read buffer,
   retains no more than 4,096 guest bytes, discards overflow, counts observed bytes, and appends one
   fixed marker after EOF. No unbounded guest output is accumulated in memory or written to disk.
3. Cancellation and wall timers run independently of drain goroutines. The controller reads and
   stores PID, start time, UID/GID, executable path, code identifier, Team ID, CDHash, and exact
   code-requirement result before authorizing start.
4. Before `SIGTERM` or `SIGKILL`, recovery repeats those immutable identity checks. Mutable parent
   PID and process status are observed but intentionally excluded after reparenting.
5. In `graceful` mode, `SIGTERM` writes to libkrun's aarch64/macOS shutdown eventfd. In the negative
   `ignore` mode, the runner ignores `SIGTERM` so the forced path is exercised deterministically.
6. If the exact runner remains after the explicit grace, the controller re-verifies it and sends
   `SIGKILL`. Name scans, path-only checks, and unverified PID signals are not used.

## Observed evidence

### Console/output behavior

| Case | Observation | Result |
| --- | --- | --- |
| Sustained stdout/stderr flood | In 1,000 ms the controller drained 1,563,051 stdout bytes and 1,563,149 stderr bytes. It retained 4,096 bytes per stream and appended fixed markers. The exact runner was forcibly removed 235 ms after timeout action began. | Pass for bounded retained bytes and teardown |
| Pipe backpressure | Both readers stalled for 1,500 ms. Stdout stopped at 65,504 pipe-buffered bytes, yet the 700 ms deadline fired and exact forced teardown completed in 247 ms. | Pass |
| Reader stall/resume | A 350 ms stall followed by draining delivered and counted 640,000 stdout bytes, retained 4,096, marked truncation, and completed naturally in 627 ms. | Pass |
| Truncation markers | Every overflow capture ended with one fixed marker containing stream, 4,096-byte limit, and observed byte count. The largest capture file was 4,194 bytes. | Pass |
| Console close/error | Closing both host readers while flooding caused the runner to exit from `SIGPIPE` in 353 ms. The controller classified this as `console-error`, not ordinary success. | Pass, fail closed |
| Host disk use | Forty capture files used 40,021 bytes total; no capture exceeded 4,194 bytes. The complete final evidence run used 420 KiB including summaries, identities, and fixed controller logs. | Measurement; per-stream capture bound passed |
| Controller memory | Maximum controller RSS reported by `getrusage` was 5,783,552 bytes while more than 1.56 MB per stream was observed. | Accounting measurement only |

The retained-byte and capture-file limits are exact algorithmic bounds in this harness. Total
controller RSS is not OS-limited and therefore is not an exact user-owned memory control.

### Timeout, cancellation, concurrency, and teardown

| Case | Timer/action observation | Teardown observation | Result |
| --- | --- | --- | --- |
| Busy-loop wall timeout | 650 ms timer acted at 650 ms; the 200 ms grace expired; re-verified `SIGKILL` completed teardown in 234 ms. | Runner exit signal was `SIGKILL`. | Pass for external deadline initiation and forced teardown |
| Output-blocked analogue | 700 ms timer acted at 700 ms with readers stalled; teardown completed in 238 ms. | Console blockage did not block the timer or exact kill. | Pass |
| Sustained flood | 1,000 ms timer acted at 1,000 ms; teardown completed in 235 ms. | Drain load did not block teardown. | Pass |
| Cancellation | 650 ms cancellation acted at 651 ms. The eventfd grace was 3,000 ms and did not stop the guest; re-verified `SIGKILL` completed the full termination phase in 3,057 ms. | Graceful path failed; forced path passed. | Conditional |
| Concurrent attempts | Attempt A was cancelled and forcibly killed in 284 ms after action; attempt B remained independent and completed naturally with its expected output. | Cancelling A did not terminate B. | Pass |

The timer values were not clamped. Observed timer-action overshoot was zero or one millisecond in
these cases, but Go/macOS timers are not hard real-time. The exact supported semantic is “initiate
termination at the approved deadline, then apply a separately approved grace and teardown
deadline.” A single promise that the runner is absent at the wall value itself is unsupported.

### Controller crash checkpoints

| Checkpoint | Durable record | Observed runner state after controller `SIGKILL` | Reconciliation |
| --- | --- | --- | --- |
| Before record | Absent | Gone after control-pipe EOF | No VM could pass start authorization |
| After durable record, before authorization | Present | Gone after control-pipe EOF | Record remains; runner never received `G` |
| After authorization, quiet workload | Present, `started` | Alive and reparented | Immutable identity matched; `SIGTERM` grace failed; re-verified `SIGKILL` completed in 260 ms |
| After authorization, output flood | Present, `started` | Gone after console readers closed | Reconciliation observed exact recorded PID absent and classified `recovered-absent`; a reused live PID would instead require identity comparison and fail unresolved |

The quiet crash case proves exact live-runner recovery. The flood crash case proves fail-closed
console behavior, not preservation of console bytes across Supervisor death. Product recovery
still needs a durable console/evidence design or an explicit rule that controller death makes the
attempt a terminal infrastructure failure with no ordinary artifact release.

### CPU and memory profiles

| Profile | Guest observation | Host runner max RSS | Decision |
| --- | --- | --- | --- |
| Probe: 1 vCPU / 32 MiB | Kernel panicked with “System is deadlocked on memory”; no workload output; host exit status 0 | Measured in retained summary | Unsupported |
| Probe: 1 vCPU / 48 MiB | Same kernel memory panic; no workload output; host exit status 0 | Measured in retained summary | Unsupported |
| Probe: 1 vCPU / 96 MiB | Runner exited 0 after about 90 ms with no workload output and no kernel-panic text | Measured in retained summary | Unsupported; unexplained failure |
| 1 vCPU / 64 MiB | `/sys/devices/system/cpu/online` was `0`; `MemTotal` was 41,280 kB; workload completed | 103,284,736 bytes | Smallest passing minimal-fixture profile |
| 1 vCPU / 128 MiB | CPU online was `0`; `MemTotal` was 106,592 kB; workload completed | 107,085,824 bytes | Passing exact profile |
| 1 vCPU / 256 MiB | CPU online was `0`; `MemTotal` was 235,164 kB; workload completed | 108,806,144 bytes | Passing exact profile; smallest Bun profile evidenced by parent spike |
| 2 vCPU / 256 MiB | CPU online was `0-1`; `MemTotal` was 234,820 kB; workload completed | 112,246,784 bytes | Passing exact topology/configuration profile |

The exact user-owned CPU mechanism evidenced here is integer vCPU topology, not a host CPU share,
percentage, or CPU-time budget. During the one-second flood, runner accounting reported 1,019 ms
user plus 919 ms system CPU because the VMM and console work use multiple host threads; these
figures are measurements, not enforcement.

The exact memory mechanism is configured guest physical RAM for a closed, tested profile. Guest
`MemTotal` is lower because the kernel reserves memory. Host RSS is neither equal to nor bounded by
the guest RAM value: the passing 64 MiB guest used about 103 MB maximum host RSS. No exact total
host-memory limit was demonstrated.

Arbitrary numeric RAM values are not supported. The runner retains specifically named `probe-*`
profiles only for negative evidence; a normal unknown profile such as `vcpu0-mem64` was rejected
with exit 78 rather than clamped or approximated.

## Observation versus inference

Observed:

- fixed retained captures and markers remained bounded under all exercised output behavior;
- timer goroutines continued to act while console readers were blocked;
- every tested forced signal followed a matching immutable live identity check;
- one live runner per attempt disappeared after exact `SIGKILL`, including after controller
  reparenting;
- console reader closure terminated the runner with `SIGPIPE`;
- the eventfd-based graceful request did not terminate the tested guest within three seconds;
- 32/48 MiB kernel panics and the silent 96 MiB failure still produced host exit status 0;
- configured vCPU topology and guest-visible RAM differed across the closed passing profiles.

Inferred, within the parent spike's one-process/one-VM observation:

- killing the exactly verified runner removes that attempt's VM even when its guest workload is
  blocked or uncooperative;
- fixed-prefix draining can prevent guest output volume from causing unbounded controller memory
  or capture-file growth;
- the passing 64/128/256 MiB configurations are usable for this minimal Alpine workload on this
  exact host/backend build.

Not inferred:

- that libkrun, the guest kernel, or Hypervisor.framework cannot wedge in a way macOS cannot kill;
- that an absent PID proves historical clean shutdown without the durable create/start protocol;
- that exit status 0 proves the guest workload ran or the kernel stayed healthy;
- that 64 MiB is sufficient for Bun, arbitrary JS/TS, or a future production launcher;
- that vCPU count enforces a CPU rate/time ceiling or guest RAM bounds total host memory;
- that the console implementation preserves evidence across Supervisor crash;
- that these timings are portable, real-time guarantees, or production validation.

## Exact, accounting-only, and unsupported controls

| Dimension | Classification from this spike | Contract consequence |
| --- | --- | --- |
| stdout/stderr retained bytes | Exact fixed prefix plus bounded marker | A plan may select only a reviewed fixed capture size; overflow is explicit truncation. |
| stdout/stderr observed byte count | Accounting after successful drain to EOF | Do not treat as authoritative if controller/console closes or crashes. |
| Console backpressure | Kernel pipe buffer plus independent lifecycle timer | Backpressure may block guest output, but must not block cancellation/reap. |
| Wall deadline | Externally initiated at configured duration; measured 0–1 ms scheduler overshoot | Define deadline, grace, and teardown deadline separately; no hard-real-time claim. |
| Cancellation | External request with exact-process forced fallback | Does not require guest cooperation. |
| Graceful guest termination | Failed/unsupported for tested non-EFI runner path | Omit from supported profile or treat only as best-effort before forced kill, never as sole teardown. |
| Forced teardown | Exact recorded identity plus `SIGKILL` | Required terminal fallback; mismatch is unresolved. |
| CPU | Exact integer vCPU topology only | Reject CPU percentage and CPU-time requests; accounting cannot satisfy them. |
| Guest memory | Exact closed configured RAM profiles | Accept only workload/profile combinations with retained evidence; reject all other values. |
| Host/VMM memory | Accounting-only RSS | No exact host-memory claim. |
| Capture disk | Exact per-stream prefix/marker bound | Other transcript/log stores need their own independent fixed bounds. |
| Controller/VMM CPU and RSS | Accounting-only | Not user-owned resource enforcement. |

## Failure cases and residual risk

- libkrun returned host exit 0 for both observed guest kernel panics and the silent 96 MiB case.
  Supervisor success therefore requires expected typed output and terminal/backend evidence; it
  cannot equate runner exit 0 with successful guest execution. Parsing attacker-controlled panic
  prose is not a general health oracle.
- The documented shutdown eventfd did not provide a trustworthy graceful path in this tested
  non-EFI configuration. A future graceful mechanism needs a separately authenticated, bounded,
  adversarially tested guest control path; this spike supplies none.
- Closing the console kills the runner through `SIGPIPE`, which is fail closed for containment but
  can lose terminal console evidence. A controller crash during flood demonstrated that behavior.
- Fixed drain buffers prevent accumulation but do not cap the CPU cost of copying/discarding a
  high-rate stream. Wall timeout bounds duration, not exact host CPU consumption.
- Total host RSS, kernel pipe memory, VMM mappings, code pages, and Hypervisor allocations are not
  enforced by the guest RAM profile.
- Process identity relies on the host OS, Security.framework, correct durable state, and the parent
  spike's one-process/one-VM result. A compromised host administrator/kernel remains out of scope.
- The wedged case is a busy/output-blocked userspace analogue, not a genuinely wedged guest kernel,
  VMM, Hypervisor.framework process, or uninterruptible host thread.
- Sleep/wake, logout/login, reboot, installed App Sandbox storage, memory/disk pressure, corrupt
  firmware/root disks, malicious-kernel VMM attacks, and production update/recovery remain other
  tracks or open corpus work.

## Decision and consequence

**Conditional pass** for this narrow development track:

- retain fixed-prefix stdout/stderr capture with explicit truncation;
- retain independently scheduled wall/cancellation actions and exact identity re-verification;
- retain forced exact-runner `SIGKILL` as the only evidenced non-cooperative teardown path;
- permit only closed, evidence-bound vCPU/RAM profiles;
- define the minimal-fixture floor as 1 vCPU/64 MiB, while keeping the Bun floor at the separately
  evidenced 1 vCPU/256 MiB;
- reject CPU percentage/time limits, total host-memory limits, arbitrary RAM values, and graceful-
  only teardown rather than silently approximating them;
- treat console loss, missing declared output, kernel/backend ambiguity, identity mismatch, and
  teardown uncertainty as non-success terminal states.

This decision does not make libkrun/HVF production-ready or `validated-local`. Integration with
the storage, installed recovery, adversarial VMM, supply-chain, and shared attack-corpus tracks is
still required before any posture change or product contract freeze.
