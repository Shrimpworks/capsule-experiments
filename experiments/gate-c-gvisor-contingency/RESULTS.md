# OCI/gVisor contingency results

Date: 2026-07-31 (America/Toronto)

Decision: **under this spike's no-install/no-daemon-change constraint, gVisor dynamic validation is
blocked on this Mac because no `runsc` runtime is installed or registered. The OCI contingency
remains technically credible but unvalidated.** A control run against the existing `runc` runtime
passed the bounded OCI harness and demonstrated a useful durable-ID/reconciliation shape across
Supervisor-like client death. It is not evidence for the gVisor isolation boundary, gVisor syscall
compatibility, or engine-crash recovery.

No package was installed, no Podman VM was started, no daemon was reconfigured or restarted, and no
unrelated container/image was changed. The harness removed all of its temporary Docker objects.

## Hypothesis and threat

Hypothesis: an OCI engine plus a pinned gVisor `runsc` runtime can satisfy the same Supervisor
backend contract as direct Apple Containerization while giving a restarted Supervisor a durable,
engine-owned container identity that it can enumerate and force-destroy.

The relevant threats are guest escape, ambient network/filesystem/process authority, exact resource
limit bypass, output exhaustion, cancellation escape, and a hostile sandbox surviving controller
or engine death without an authoritative cleanup obligation.

## Environment and provenance

| Item | Observed value |
| --- | --- |
| Host | macOS 26.5.2 (25F84), Darwin 25.5.0, Apple silicon arm64 |
| Docker Desktop | 4.81.0 (232925) |
| Docker client/engine | 29.6.1 / API 1.55, Linux arm64 |
| Docker VM kernel | LinuxKit 6.12.76 |
| containerd / runc | 2.2.5 / 1.3.6 |
| Cgroups | v2, `cgroupfs` driver |
| Registered runtimes | `runc` and `io.containerd.runc.v2`; no `runsc` |
| Docker live restore | disabled |
| Host gVisor tools | `runsc` and `containerd-shim-runsc-v1` absent |
| Podman | 5.8.3 client; existing AppleHV machine stopped and not started |
| Other OCI tools | `nerdctl`, `ctr`, host `containerd`, `crun`, Lima, Colima, Finch, and OrbStack absent |
| Fixture | `oven/bun:1.1.38`, repository digest `sha256:5148f6742ac31fac28e6eab391ab1f11f6dfc0c8512c7a3679b374ec470f5982`, arm64 |

Docker Desktop exposed 975 cached images, but no image was identified as a gVisor/runtime fixture.
A read-only search of the Docker and Podman application payloads found no `runsc` or gVisor binary.
`docker info` reported only the two runc aliases above. The default `run.sh` preflight exited `2`
before build or container creation:

```text
BLOCKED: requested runtime runsc is not registered
```

Official gVisor documentation says the runtime requires Linux 4.14.77 or newer and supports ARM64,
so Apple silicon is not itself the blocker. The blocker is the absent Linux-side runtime and shim.
See [gVisor installation](https://gvisor.dev/docs/user_guide/install/).

## Dynamic OCI control evidence (`runc`, not gVisor)

The same harness was explicitly run with `CAPSULE_RUNTIME=runc`. Docker inspection confirmed the
requested runtime, `network=none`, and a read-only root on every test container.

| Requirement | Observed runc/Docker Desktop evidence | Classification |
| --- | --- | --- |
| Runtime binding | Docker retained `HostConfig.Runtime=runc`; only runc runtimes were registered. | Harness control only; no gVisor claim. |
| Network deny/default | Engine configuration was `network=none`; the guest had no IPv4 route, TCP did not connect, and DNS did not resolve. `/proc/net/dev` contained loopback and inactive tunnel devices. | Pass for this exact runc control composition. Connectivity failure alone was not counted. gVisor still untested. |
| Identity/privilege | uid/gid 65532, `NoNewPrivs: 1`, and zero effective/permitted capabilities. | Pass for the OCI configuration under runc. |
| Root and host exposure | Root write failed `EROFS`; no bind mount or host socket was supplied. | Pass for tested root configuration; content staging is outside this spike. |
| Memory | `memory.max=134217728`; allocation attack exited 137 with Docker `OOMKilled=true`. | Exact 128 MiB cgroup enforcement observed. |
| PIDs | `pids.max=32`; an unbounded shell fork attack terminated with `Cannot fork` and exit 2. | Exact cgroup value and external process-tree denial observed. |
| CPU | `cpu.max=50000 100000`; saturation consumed about 0.76–0.77 CPU seconds over 1.50–1.55 wall seconds. | 0.5-CPU throughput quota observed; total CPU-time watchdog remains Supervisor-owned. |
| Output/scratch storage | A 1 MiB output tmpfs accepted exactly 1,048,576 bytes, then returned `ENOSPC`. | Exact bounded tmpfs point observed; artifact collection/release remains untested. |
| Log/output bytes | A 512 KiB flood left 57,344–65,536 bytes with Docker's local driver configured for 64 KiB and one file. | Rotation bound observed, but **not** an exact output gate or typed overflow event. Product control remains unsupported by this mechanism alone. |
| Cancellation | A parent and child ignored `SIGTERM`; `docker stop --time 1` ended the container with exit 137. | Forced cancellation observed. Independent child disappearance was implicit in container termination, not separately enumerated. |
| Controller crash | A Supervisor-like client persisted the Docker container ID, then received `SIGKILL`. The stubborn container remained running and was found by exact ID plus `io.capsule.spike.attempt` label, then force-stopped. | Strong evidence for durable engine identity across **client** death. |
| Engine crash | Not run. Docker live restore was disabled, and killing Docker Desktop would affect unrelated user work. | Blocked on a disposable worker; CLEAN-001 remains open. |

Representative output:

```text
uid=65532 gid=65532 NoNewPrivs=1 CapEff=0 CapPrm=0 rootWrite=EROFS
memory.max=134217728 pids.max=32 cpu.max="50000 100000"
pids: exit=2 configured=32 output="Cannot fork"
storage: written=1048576 result=ENOSPC
memory: exit=137 oom=true
output: retainedBytes=65536 fixtureBytes=524288
controller crash: durable container ID enumerated by exact ID and attempt label
cancellation: running=false exit=137
```

## What this says about gVisor

The result establishes that the surrounding OCI/Docker control plane can express the required
non-root, capability, rootfs, network, cgroup, tmpfs, labeling, inspection, and cancellation shape.
It does not establish that `runsc` applies every field correctly.

That distinction matters because gVisor is an application kernel, not merely a different runc
binary. It intentionally relies on host cgroups for resource exhaustion defense, and its memory is
accounted differently because application pages are backed by a `memfd`. The follow-up must inspect
host cgroup evidence and `runsc usage`, not assume runc's guest-visible accounting transfers
unchanged. See gVisor's [security model](https://gvisor.dev/docs/architecture_guide/security/) and
[resource model](https://gvisor.dev/docs/architecture_guide/resources/).

Network absence also needs both layers. gVisor provides an explicit `--network=none` runtime mode
while retaining sandbox-local loopback; the OCI engine must independently attach no network. See
[gVisor networking](https://gvisor.dev/docs/user_guide/networking/). Capsule must reject host
network mode and must not accept a failed connection as the only proof of denial.

## Evidence-contract comparison

| Contract area | Direct Apple Containerization 0.33.3 | OCI engine plus gVisor contingency |
| --- | --- | --- |
| Isolation boundary | Fresh lightweight VM per job; native Virtualization framework. | gVisor userspace application kernel plus Linux host isolation. On this Mac it adds an outer Linux VM. |
| Backend ownership | Direct Swift controller owns the VM; controller death removed observed helpers. | Long-lived Docker/containerd owns sandbox lifecycle; Supervisor is a constrained client. Engine socket becomes high authority and must be Supervisor-only. |
| Durable identity | No supported VM/helper identifier survives controller restart; this is Apple's blocking gap. | Docker container ID plus Supervisor label survived client death and was independently enumerable in the runc baseline. Engine restart still needs proof. |
| Network | Explicit `networking=false`, empty interfaces, empty relays; management vsock remains a residual. | OCI `network=none` plus gVisor `--network=none`; loopback remains. No Apple management vsock, but runsc/gofer/control FDs and engine socket need attack review. |
| PIDs | Upstream API omits it; retained four-hunk patch maps to existing `pids.max`. | Standard OCI/host cgroup field; exact runc behavior observed, exact gVisor composition untested. |
| Memory/CPU | Exact memory and CPU throughput observed in direct backend. | Standard host cgroups; exact runc values/attacks observed. gVisor host accounting semantics require a separate run. |
| Storage | Apple ext4 capacity has 128 MiB granularity; plans must approve discrete actual sizes. | Exact 1 MiB tmpfs observed for scratch/output. Persistent overlay/artifact quota and safe collection need a separate design. |
| Output | Supervisor-owned bounded stream killed on overflow in prototype. | Docker log rotation bounded retained bytes but is not the required output gate. Same Supervisor-owned stream remains necessary. |
| Distribution/operations | Native macOS signing, notarization, XPC, and per-user launch integration. | Requires a governed Linux VM/worker, pinned runsc/shim, container engine, image store, updates, and restricted engine IPC. |

## Pivot cost and benefit

Benefits if the gVisor run passes:

- stable engine-issued identities and label enumeration may close the most important Apple cleanup
  evidence gap;
- OCI cgroup controls avoid maintaining Apple's PID API patch;
- it exercises the already-planned Linux authoritative/hosted backend rather than creating a
  one-off contingency;
- gVisor reduces direct exposure of the host Linux kernel to guest syscalls. Its official security
  overview explicitly targets untrusted code, while also noting that an engine/containerd exploit
  before sandbox entry remains outside gVisor's protection.

Costs and new trust:

- local macOS execution becomes macOS → managed Linux VM → Docker/containerd → runsc → guest,
  increasing footprint, startup/update work, and failure modes;
- a rootful engine socket is effectively launch authority. It cannot be exposed to the daemon or
  Broker; a narrow Supervisor-only adapter and exact runtime/image/profile allowlist are required;
- gVisor syscall compatibility and I/O overhead need Bun-specific measurement;
- engine and VM crash recovery, image-store integrity, runtime/shim updates, and outer-VM teardown
  become part of the evidence record;
- gVisor inside a VM uses `systrap` rather than bare-metal KVM for practical performance, and the
  gVisor production guide says VM deployment has a performance cost;
- [rootless gVisor](https://gvisor.dev/docs/user_guide/rootless/) has network and cgroup limitations
  that conflict with simply assuming it is a drop-in answer. It requires a separate exact profile
  if considered.

The contingency is therefore attractive for Linux and potentially viable for a managed Mac-side
VM. A subsequently completed Gate C identity/recovery spike found no supported durable host-side
identity or restart enumeration in direct Apple Containerization and failed it as the production
backend. OCI/gVisor is now the primary production candidate under the same public task contract;
this runc control result still does not validate gVisor.

## Next decision gate

Run this retained harness on a disposable Linux ARM64 or x86-64 worker with a checksum-verified,
pinned `runsc` release registered as a dedicated runtime. Then add:

1. host-side proof of the exact `runsc`/shim binary, flags, OCI bundle, image digest, cgroup path,
   Sentry/gofer identity, and absence of host network/bind/socket authority;
2. invalid and boundary values for every limit, plus a root/setuid, fork-tree, native-memory,
   CPU-time, disk, log, and output attack corpus;
3. Bun compatibility tests for workers, signals, `/proc`, filesystem behavior, timers, and runtime
   shutdown under `runsc`;
4. controller `SIGKILL` at every lifecycle edge using durable intent/labels;
5. engine/containerd and outer-VM crash/restart tests with authoritative enumeration or destruction
   evidence; and
6. Supervisor-owned bounded output and artifact collection, not Docker log rotation.

Pass only if every required control is matched to an exact host/runtime mechanism and every
post-create crash path reaches destroy/reconcile or explicit unresolved state. If stable identity
works but the engine socket or outer VM creates an unacceptable authority/operations burden, keep
gVisor as the Linux reference and continue the direct Apple path for macOS.
