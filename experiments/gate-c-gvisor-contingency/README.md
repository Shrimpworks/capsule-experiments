# Gate C OCI/gVisor contingency spike

Status: development-only experiment. Product packages must not import this code, and its output is
not valid Capsule posture or receipt evidence.

Owner: Gate C research task delegated from the Capsule planning session on 2026-07-31.

Purpose: determine whether the current Mac can exercise the planned OCI plus gVisor contingency,
retain a fail-closed test harness for a Linux worker, and compare the resulting backend evidence
contract with direct Apple Containerization.

Removal/replacement condition: remove after the shared backend attack corpus replaces this harness
and a reviewed backend ADR records the selected exact Apple and Linux configurations.

The current decision and exact observations are in [`RESULTS.md`](RESULTS.md).

## Safety properties of this experiment

- `inventory.sh` is read-only.
- `run.sh` checks that the requested runtime is registered before it builds or starts anything.
- The fixture base must already be present locally at the pinned digest; the script never pulls.
- Every created container has an experiment-specific name and label.
- Cleanup tracks exact container IDs and the exact temporary image tag. It does not prune, delete by
  wildcard, or modify Docker/Podman daemon configuration.
- The default runtime is `runsc`. If it is absent, the script exits `2` without mutation.
- The fixture has a read-only root, no network attachment, uid/gid 65532, empty capabilities,
  `no-new-privileges`, exact memory/CPU/PID limits, and bounded tmpfs mounts.
- The largest intentional flood is 512 KiB and the largest memory cgroup is 128 MiB.

No script installs `runsc`, starts the stopped Podman VM, restarts a daemon, changes a Docker
setting, or kills Docker Desktop. Engine-crash testing belongs on a disposable Linux worker.

## Files

- `inventory.sh`: host client/runtime inventory with no state changes.
- `Dockerfile`: digest-pinned fixture image.
- `probe.ts`: bounded hostile probes.
- `run.sh`: common OCI control harness, defaulting to `runsc` and accepting an explicit runtime
  through `CAPSULE_RUNTIME`.
- `RESULTS.md`: observed evidence, limitations, comparison, and next decision gate.

## Reproduce the current result

Inventory:

```sh
./experiments/gate-c-gvisor-contingency/inventory.sh
```

Fail-closed gVisor preflight on the current Mac:

```sh
./experiments/gate-c-gvisor-contingency/run.sh
```

Expected result: exit `2` with `runsc is not registered` before an image or container is created.

OCI engine control run using the already-installed `runc` runtime:

```sh
CAPSULE_RUNTIME=runc ./experiments/gate-c-gvisor-contingency/run.sh
```

This validates the harness and some Docker/OCI orchestration mechanisms. It is **not** gVisor
evidence and must never be cited as such.

## Future gVisor run

gVisor requires Linux, though it supports both x86-64 and ARM64. On macOS it therefore needs a
Linux VM or a dedicated Linux worker. The official installation packages contain `runsc`, the
containerd shim, and supporting binaries. Docker integration registers `runsc` as a runtime and
requires a daemon reload/restart. See the official [installation guide](https://gvisor.dev/docs/user_guide/install/)
and [Docker quick start](https://gvisor.dev/docs/user_guide/quick_start/docker/).

Use a disposable worker rather than modifying the workstation's Docker Desktop VM. Pin a gVisor
point release and verify its published checksum, then register a dedicated runtime profile with
external networking disabled. Because the worker is itself a VM, gVisor recommends the `systrap`
platform rather than nested KVM; that is a performance recommendation, not validation evidence.
See [changing platforms](https://gvisor.dev/docs/user_guide/platforms/).

Once the worker reports a registered runtime such as `capsule-runsc`, cache the pinned fixture base
and run:

```sh
docker pull oven/bun@sha256:5148f6742ac31fac28e6eab391ab1f11f6dfc0c8512c7a3679b374ec470f5982
CAPSULE_RUNTIME=capsule-runsc ./experiments/gate-c-gvisor-contingency/run.sh
```

The pull is intentionally a separate, visible operator action. The test must retain host-side
evidence that Docker/containerd invoked the pinned `runsc` runtime. Guest `dmesg` text is not
security evidence; gVisor's own quick start warns that a guest can imitate it.

The full follow-up must additionally use an isolated test daemon/containerd instance to kill and
restart the engine at every create/start/stop/delete boundary. The current script kills only the
Supervisor-like client controller because terminating Docker Desktop would affect unrelated user
work. The worker test must prove either:

1. exact labeled containers remain authoritatively enumerable and force-destroyable after engine
   restart; or
2. engine death synchronously destroys the exact sandbox and leaves independently attributable
   evidence.

Missing state is not destruction evidence. Output rotation is also not the product output gate;
the final adapter needs a Supervisor-owned bounded stream, a typed overflow event, and kill/teardown
evidence.
