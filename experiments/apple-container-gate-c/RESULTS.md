# Gate C spike: Apple Container capability coverage

Date: 2026-07-31 (America/Toronto)

Decision: **FAIL — Apple Container CLI/API 1.0.0 is not an acceptable direct Capsule
Supervisor backend.** Retain it as a development-only backend and pivot the next spike to a narrow
adapter over the lower-level Containerization API. Pivot again to another backend if that adapter
cannot durably enumerate and force-reap runtime helpers after controller loss, or cannot apply and
report exact PID and storage limits without a broad fork or private API.

Later license-free follow-up: the lower-level package was subsequently compiled and run directly
with Command Line Tools and local ad-hoc signing. The follow-up enforced PID limits with a retained
small patch and improved controller-crash behavior, but still lacks supported durable helper/VM
identity. See [`../apple-containerization-direct/RESULTS.md`](../apple-containerization-direct/RESULTS.md).
This report otherwise retains the original CLI/API observations unchanged.

This is a disposable research result, not a production-readiness claim. It applies only to the
versions and host below. `Observed` means measured on this host or read from the exact installed
source revision. `Inference` is an architectural conclusion drawn from those observations.

## Baseline, hypothesis, and method

The worktree was clean and was moved from stale commit `571131b` to the requested authoritative
baseline `9bfd2acedbccfbe851f797edc06eb447733188e3` (`Document hardened architecture and spike plan
(#7)`) before substantive work. The named Gate C documents were present and reviewed, including
the execution supervisor, technical design, control evidence matrix, threat model, feasibility
plan, and ADRs 0008, 0011, and 0018. The relevant linked protocol, runtime-integrity, component
compromise, artifact, networking, recovery, receipt, and approval ADRs were also reviewed.

Hypothesis: Apple Container's per-container VM, an explicit empty network attachment set, a
read-only root, read-only block-backed input volumes, cgroups, and kill/delete APIs can provide the
mechanisms required by `BackendCapabilityReport`; the Supervisor can independently observe those
mechanisms and reconcile them after either side crashes.

Method: build a pinned Bun fixture, run it as hostile untrusted code, inspect guest-visible state,
sample the host CLI/API state, inject negative configurations, kill the Apple API server while a
guest is alive, and inspect the exact open-source revisions corresponding to the installed
binaries. A connectivity failure counted only when paired with an explicit empty attachment set
and guest interface/route evidence.

## Environment and provenance

| Item | Observed value |
| --- | --- |
| Host | macOS 26.5.2, build 25F84; Darwin 25.5.0 RELEASE_ARM64_T6000; arm64 |
| Apple Container CLI | `/usr/local/bin/container`, 1.0.0 release, commit `ee848e3` |
| Apple API server | 1.0.0 release, full commit `ee848e3ebfd7c73b04dd419683be54fb450b8779` |
| Containerization package | 0.33.3, resolved commit `a2a1add6c7e1a1665e5397edc49d925c49090b3a` |
| vminit | `ghcr.io/apple/containerization/vminit:0.33.3` |
| Linux kernel | Kata `vmlinux-6.18.15-186` from Kata Containers 3.28.0 |
| Swift | 6.3.3, target `arm64-apple-macosx26.0` |
| Xcode | Not installed; Command Line Tools only; `xcodebuild` fails |
| Host Bun | 1.3.14 |
| Fixture base | `docker.io/oven/bun:1.3.14-slim`, OCI index digest `sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04`; selected arm64 manifest `sha256:6068a9d40e9fc5c4519891edb63dfc5935c393fe2228eb9a5b7f472b444b5ee2` |
| Node/pnpm | Default `node` was 16.15.0 and could not run the pnpm wrapper; fnm Node 22.21.1 was available. Verification results below use the exact invocation recorded there. |
| Go/Git | Go 1.23.4 darwin/arm64; Apple Git 2.50.1 (155) |

The `container` executable was signed by Apple Inc.'s Containerization team (`UPBK2H6LZM`) and had
SHA-256 `ddbdf8f48d2718761b57afd450c4b02bf9174767043526d5274f0bd6b4863e33`.
The API server SHA-256 was
`12747bbc84384a71f715068a45c6214a6d86ac26a25946c70040fa0a7e893558`.
Installed core-images, network-vmnet, runtime-linux, and machine-apiserver plugins all reported
1.0.0 / `ee848e3`.

Apple's signed 1.0.0 release identifies the same commit and explicitly says that API major-version
0 compatibility was removed and API version negotiation was deferred to a later release. That is
an additional integration risk, not the reason for this fail decision. See the official
[Apple Container 1.0.0 release](https://github.com/apple/container/releases/tag/1.0.0) and the
[tagged source](https://github.com/apple/container/tree/1.0.0). The dependency revision was
verified from the tag's `Package.resolved`; the corresponding primary source is
[Containerization 0.33.3](https://github.com/apple/containerization/tree/0.33.3).

## Results

### Capability summary

| Required area | Observed evidence | Gate result |
| --- | --- | --- |
| Network deny/default | `--network none --no-dns` produced `networks: []`, only `lo`, no IPv4 route, and no successful TCP/UDP/DNS. Omitting `--network` attached `default`, created `eth0` and routes, and allowed public TCP and DNS. | Conditional mechanism: explicit empty attachments work; omission is network-on. `--no-dns` alone is not denial. |
| Loopback | A guest listener and client connected over `127.0.0.1` with external networking disabled. | Present by design; policy must treat intra-guest loopback as allowed, not claim “no sockets.” |
| Unix/vsock exposure | `/proc/net/unix` was empty and no host socket FD was inherited. `/dev/vsock` existed; non-root could create `AF_VSOCK` sockets even though it could not open the root-only device. Probes of host/local CID port 1024 did not connect; one guest-CID probe remained unresolved through the 500 ms poll. | Unproven isolation: no exposed Unix relay was observed, but vsock is a management channel and the finite port probes do not prove it unreachable. |
| Read-only root | `/` was ext4 read-only and a write failed `EROFS`; `/tmp` was a separate writable tmpfs. | Pass for the tested mechanism. |
| Read-only input | A block-backed Apple volume mounted `ro`; the exact JSON input was readable and mutation failed `EROFS`. | Pass for mount immutability; snapshot digest/capability staging was outside this spike. |
| Memory | `memory.max` exactly matched 256 MiB; the hostile allocator was killed with exit 137. The CLI rejected 192 MiB because its minimum is 200 MiB. | Enforced with a declared minimum. CLI postmortem evidence is insufficient. |
| CPU | `--cpus 1` produced `cpu.max = 100000 100000`; sampled usage rose by about one CPU-second per wall second under saturation. | Throughput quota enforced. No backend total-CPU-time budget; Supervisor accounting/watchdog still required. |
| PIDs | Apple emitted `pids.max=max`. Non-root `RLIMIT_NPROC=16` stopped the test at 16 processes and also prevented management `exec`; the same limit as root allowed all 128 attempted children. | Fail: no externally enforced process-tree ceiling in the CLI profile; RLIMIT is not an equivalent control. |
| Disk/volume | A requested/reported 32 MiB ext4 volume had a 128 MiB host image and accepted 129,409,024 bytes before `ENOSPC`. | Fail exactness: requested size is treated as a minimum and silently rounded by ext4 geometry. |
| Output/log bytes | A detached output flood grew Apple `stdio.log` to 18,194,948 bytes in under one second before the process OOMed. Tagged source writes to an unbounded file through `MultiWriter`. | Fail unless the Supervisor owns a bounded stream/log implementation and kills on overflow. |
| Cancellation/kill | A parent and child ignoring `SIGTERM` were both gone after `container stop --time 1`; host logs recorded exit 137. | Pass for the normal forced-kill path. |
| Orphan discovery/reconciliation | After API-server `SIGKILL`, launchd restarted it, but it reported the still-running runtime helper as `stopped`. `stats` was empty and `stop --time 1` was a successful no-op; the helper survived more than 53 seconds until forced deletion. | **Fail CLEAN-001.** Persisted metadata was mistaken for terminal state while execution remained alive. |
| Teardown evidence | Normal host logs and host process inspection showed helper exit. After a stopped container, CLI stats returned `[]`; inspect did not contain exit/OOM evidence. Forced deletion eventually removed the crash-orphan helper. | Fail independent/durable terminal evidence; `state=stopped` is not proof of VM destruction. |

### Network and IPC details

Observed with an explicit deny profile:

```text
--network none --no-dns --read-only --cap-drop ALL --cpus 1 --memory 256M
--user 1000:1000 --tmpfs /tmp
```

The guest had only `lo`, no IPv4 route, and no non-loopback IPv6 address. TCP attempts to
`1.1.1.1:443` and the default gateway did not connect; a UDP DNS send failed `ENETUNREACH`; DNS and
metadata probes failed. `/etc/resolv.conf` still named `1.1.1.1` and `1.0.0.1`, so resolver-file
contents were not control evidence. The independently inspected container configuration had an
empty `networks` array and no published ports or sockets.

Negative test: the otherwise identical command without `--network none` attached the built-in
`default` network, assigned `192.168.64.x`, installed routes, connected to public TCP and the
gateway, and received a UDP DNS response. This proves that Capsule must construct and verify an
explicit empty attachment set. The tagged client source's network resolution behavior is visible
in [Utility.swift](https://github.com/apple/container/blob/1.0.0/Sources/Services/ContainerAPIService/Client/Utility.swift).

Loopback remained usable. No Unix-domain socket relay appeared in `/proc/net/unix`, and the guest
FD inventory contained no host socket. Containerization nevertheless uses vsock for guest-agent,
stdio, copy, and optional Unix-relay plumbing; the exact configuration exposes `interfaces` and
`sockets` separately. See Apple's
[LinuxContainer source](https://github.com/apple/containerization/blob/0.33.3/Sources/Containerization/LinuxContainer.swift)
and [Vminitd source](https://github.com/apple/containerization/blob/0.33.3/Sources/Containerization/Vminitd.swift).
Inference: the next adapter must emit and attest both empty collections, deny published relays,
and either prove the management protocol is purpose-scoped or treat guest-reachable vsock as an
open risk.

### Filesystem and resource details

Observed root and input protections behaved as configured. No live user file path was supplied to
the guest; the input test used an Apple-managed ext4 block image. This does not test Capsule's
required immutable content-addressed snapshot production or authorization flow.

Observed cgroup values were exact for the accepted memory and integer-CPU settings. The 256 MiB
allocator was killed, while `container stats` showed the live limit. After stop, `container stats`
returned no entry. Lower-level `ContainerStatistics` includes `memoryEvents`, including OOM
counters, but Apple 1.0.0 maps only memory usage/limit, CPU usage, network, block I/O, and current
process count into its `ContainerStats`. Inference: use lower-level statistics or retain equivalent
Supervisor-owned cgroup/exit evidence; do not infer OOM from exit 137 alone.

Tagged Containerization source defines OCI `LinuxPids`, but `LinuxContainer.Configuration` exposes
only CPU and memory resource fields and generates only CPU and memory cgroup resources. Apple
1.0.0 adds `RLIMIT_NPROC` but no PID flag. It also leaves `noNewPrivileges` at the lower-level
default `false`; the spike dropped all capabilities and ran as uid 1000, but did not dynamically
prove resistance to every setuid path. Inference: a lower-level adapter must set OCI
`pids.max`, `noNewPrivileges=true`, non-root identity, and an image/profile rule forbidding setuid
artifacts; inability to do all four is a pivot trigger.

The storage negative test is an exact-limit failure, not merely accounting drift. Apple accepted
32 MiB, reported 32 MiB, then formatted a 128 MiB extent. Tagged volume service and formatter
sources show the requested value entering an ext4 formatter as a minimum size:
[VolumesService.swift](https://github.com/apple/container/blob/1.0.0/Sources/Services/ContainerAPIService/Server/Volumes/VolumesService.swift)
and
[EXT4 formatter](https://github.com/apple/containerization/blob/0.33.3/Sources/ContainerizationEXT4/EXT4%2BFormatter.swift).
Capsule must reject unsupported sizes before approval or approve the actual discrete allocation;
it must never silently clamp or round an approved value.

### Cancellation, crash recovery, and evidence

The ordinary cancellation path was effective: a Bun parent and child ignored `SIGTERM`, the one
second grace elapsed, and Apple force-killed the container tree. The 1.0.0 release also documents a
change making `kill` wait for container exit.

The adversarial controller-crash path failed:

1. A labeled stubborn container was running under API-server PID 26430 and runtime helper PID
   32188.
2. PID 26430 was sent `SIGKILL`; launchd restarted the API server as PID 32443. The runtime helper
   survived with parent PID 1.
3. The replacement server listed the container as `stopped`; stats were empty.
4. `container stop --time 1` returned success without killing the helper. It was still alive after
   more than 53 seconds.
5. `container delete --force` deregistered the service and the helper disappeared.

Exact 1.0.0 source loads each persisted non-auto-remove bundle at boot as stopped instead of
reattaching to or reaping its launchd runtime helper. See
[ContainersService.loadAtBoot](https://github.com/apple/container/blob/1.0.0/Sources/Services/ContainerAPIService/Server/Containers/ContainersService.swift).
Inference: a Supervisor cannot rely on this API's reported lifecycle state after either process
restarts. A missing in-memory handle or persisted `stopped` record must become `indeterminate`, and
release is forbidden until independent helper/VM enumeration and a force-reap receipt succeed.

### API/source limitations

The exact tagged source observations matter because Xcode was unavailable, so a separate Swift
prototype against Containerization 0.33.3 could not be compiled on this host. No lower-level API
behavior is claimed as dynamically tested. Source inspection established that:

- `LinuxContainer.Configuration` has explicit interface, Unix-socket, mount, CPU, and memory
  fields, while its generated OCI resources omit PIDs.
- OCI model types do contain `LinuxPids` and `noNewPrivileges`; adding them may require a focused
  Containerization change or a new supported configuration surface.
- lower-level statistics contain process maximum/current and memory-event counters that Apple
  1.0.0's public CLI service discards;
- Apple 1.0.0's log writer appends stdout/stderr without a size cap; and
- the API server boot path does not recover a live non-auto-remove runtime helper.

These are source observations at the pinned revisions, not proof that a proposed adapter works.

## Gate decision and pivot trigger

**FAIL Apple Container CLI/API 1.0.0 for Gate C.** The failure is mandatory even though several
mechanisms work: CLEAN-001 is contradicted by a live orphan reported as stopped; exact storage is
silently expanded; PID-tree and output byte limits are absent; and durable terminal evidence is
insufficient. A broken network was not counted as a control—the positive default-network test and
empty-attachment inspection were required to characterize network denial.

Next backend candidate: a narrow, pinned adapter over Containerization 0.33.3 (or the smallest
reviewed patch to it), not the Apple CLI service. It must demonstrate all of the following in one
end-to-end rerun:

1. explicit empty interfaces and Unix relays, with management-vsock scope characterized;
2. read-only root/input and independently bounded scratch/output;
3. exact memory, CPU-throughput, `pids.max`, and approved discrete disk capacity;
4. Supervisor-owned wall/CPU/output byte watchdogs and durable exit/OOM/limit evidence; and
5. after killing and restarting both Supervisor/controller processes, enumeration and forced reap
   of every launchd helper/VM before a terminal receipt or capability release.

Pivot to another backend if the public lower-level API cannot enumerate/force-reap surviving
helpers across process restart, cannot set PID and storage controls exactly without a broad fork,
or cannot keep management channels unavailable to hostile guest code. A microVM/OCI backend with
durable host-side handles is the next comparison target; do not keep extending the Apple CLI
schema to paper over missing mechanisms.

## Concrete architecture/document changes proposed

These are recommendations only; the spike deliberately does not broadly edit architecture docs.

- ADR-0008: record Apple CLI/API 1.0.0 as development-only and Gate C failed; name the lower-level
  adapter spike and the hard pivot triggers above.
- `EXECUTION_SUPERVISOR.md`: make crash recovery enumerate actual launchd/runtime-helper/VM state.
  Persisted `stopped` is not terminal evidence. Split CPU throughput quota from total CPU time and
  wall timeout.
- `BackendCapabilityReport`: report mechanism, version, minimum, granularity, and independently
  observable evidence for each limit. For this version that includes memory minimum 200 MiB,
  integer CPU cores, actual ext4 allocation geometry, postmortem-stat availability, explicit
  interface/socket collections, and API compatibility.
- `CONTROL_EVIDENCE_MATRIX.md`: leave NET-001 only partially spike-observed; split RES-001 into
  memory, CPU throughput/time, PID, disk, and log/output subclaims; mark CLEAN-001 unsupported for
  Apple 1.0.0 with this crash fixture.
- Plan validation: ban implicit network defaults and `--no-dns` as a network control. Reject any
  disk size that the backend cannot enforce exactly before approval. Do not accept
  `RLIMIT_NPROC` as the sole process-tree ceiling.
- Receipts/transcripts: record controller boot identity, helper/service/VM handle, stop escalation,
  exit/OOM/limit event, deregistration, and independent disappearance checks. Ambiguity is a
  teardown failure, never a successful terminal receipt.
- Output handling: keep stdout/stderr in a Supervisor-owned bounded stream; kill on overflow and
  emit a typed limit event rather than depending on Apple's unbounded `stdio.log`.

## Open risks and next smallest test

Open risks: unproven hostile reachability of management vsock; no dynamic `no_new_privileges` or
setuid attack; no lower-level cross-process recovery proof; no content-addressed input staging;
no bounded output broker; no exact scratch/output capacity implementation; and no evidence that a
Containerization patch remains stable across Apple's unversioned 1.0.0 XPC boundary.

Next smallest test: with full Xcode available, build a tiny signed Swift controller directly on
Containerization 0.33.3 that starts one labeled stubborn fixture with empty interfaces/sockets,
OCI `pids.max=16`, `noNewPrivileges=true`, a prevalidated discrete ext4 volume, and a bounded log
pipe. Kill the controller, start a fresh instance, enumerate the launchd helper by sealed job ID,
force-reap it, and produce a durable record containing helper identity, cgroup values, exit/limit
event, and independent disappearance. If that single crash test cannot be made reliable using
supported APIs, stop the Apple path and run the same corpus against the alternative backend.

## Retained fixtures, reproducibility, and cleanup

Retained under this directory:

- `Dockerfile`: digest-pinned Bun image recipe;
- `hostile-probe.ts`: JSON-lines probes for network, vsock, mounts, cgroups, memory, CPU, PIDs,
  disk, output flood, and stubborn process trees; and
- this report and `README.md`.

Representative build/run commands (names are intentionally scoped):

```sh
container build --tag capsule-gate-c:dev experiments/apple-container-gate-c
container run --name capsule-gate-c-baseline --label capsule.experiment=gate-c \
  --network none --no-dns --read-only --cap-drop ALL --cpus 1 --memory 256M \
  --user 1000:1000 --tmpfs /tmp capsule-gate-c:dev baseline
container run --name capsule-gate-c-default-network --label capsule.experiment=gate-c \
  --no-dns --read-only --cap-drop ALL --cpus 1 --memory 256M \
  --user 1000:1000 --tmpfs /tmp capsule-gate-c:dev baseline
```

The crash injection deliberately kills Apple's API-server process and is not automated in a
script; repeat it only on a disposable user session after resolving exact PIDs and labels.

All `capsule-gate-c-*` containers, the `capsule-gate-c-input` volume, and the locally built
`capsule-gate-c:dev` image were explicitly deleted after observation. Apple reported 17.92 GB
reclaimed (including sparse image accounting). These runtime resources are not recoverable; the
source fixtures remain. Pre-existing `buildkit`, network, image, and unrelated user resources were
not deleted.

## Verification

Verification used fnm Node 22.22.1 and pnpm 10.28.2. The locked install reused the local pnpm store
without downloading packages. All prescribed checks passed:

```text
pnpm install --frozen-lockfile  PASS
pnpm check                      PASS
pnpm lint                       PASS
pnpm test                       PASS
pnpm verify:schemas             PASS
go test ./...                   PASS
go vet ./...                    PASS
go build ./...                  PASS
bun build hostile-probe.ts      PASS
```

The fixture was syntax-checked with Bun before execution and again after Biome's mechanical import
formatting. Every dynamically reported result above came from the built image; the lower-level
Swift adapter remains unbuilt because full Xcode is unavailable.
