# ADR-0041: Freeze the passive fixed-owned-guest successor contract

- Status: Accepted
- Date: 2026-08-05
- Refines: ADR-0018, ADR-0022, and ADR-0028

## Context

C1, C2A, and immutable C2B v1/v2 retain exact governed-runtime, descriptor, resource, transport,
teardown, and no-guest construction evidence. C2B v2 deliberately left final runner, firmware,
composed-profile, unsupported-resource, guest-evidence, and admission fields null. Later governed
fork acceptance changed the immutable source heads: Deno and `rusty_v8` advanced through
governance-only acceptance, while libkrun accepted runtime console-validation source after the
retained dylib was built.

One fixed benign owned guest cannot be requested safely from v2. Capsule first needs one immutable
no-effect successor that distinguishes selected bytes from historical evidence, resolves component
roles, removes unsupported authority fields, freezes the exact runner/device/runtime/lifecycle
contract, and reports remaining artifact dependencies without manufacturing identities.

## Decision

Capsule accepts C2B passive binding v3 as that successor contract. C1, C2A, C2B v1, and C2B v2
remain immutable exact-byte predecessors. Mutable branches never identify governed source.

The host runner role is one per-attempt App-Sandboxed VMM process created and owned by the Execution
Supervisor. It is neither a persistent service nor a privileged helper. The Supervisor owns the
durable-record-before-start handshake, identity, drains, completion interpretation, cancellation,
forced teardown, and authoritative absence. The runner owns only exact preflight, the closed
libkrun call sequence, and VM entry. No new Supervisor authority or daemon-to-backend path is added.

The non-EFI boot role uses the exact retained `libkrunfw.5.dylib` as the sole runtime boot-kernel
carrier through `krunfw_get_kernel`. The extracted kernel is evidence only. Separate kernel and
firmware path authority is forbidden, so a separate firmware artifact role is inapplicable rather
than null.

The build uses only libkrun feature `blk`. The runner explicitly disables implicit console, init,
and vsock. The exact virtio inventory is balloon, RNG, one three-port console, and one read-only raw
root block device. Network, TSI, virtiofs/`NullFs`, additional or writable block, GPU, sound, input,
host sockets, and live host paths are absent. Host FDs 0 through 7, guest-launcher FDs 0 through 5,
runtime-child FDs 0 through 2, port IDs/names/nodes, and close-from boundaries are exact.

The fixed governed `deno_core` child has no module loader, extensions, inspector, or string-code
generation. It retains the exact three bootstrap ops, `--jitless`, deterministic random seed,
internal fixed main-module bytes, and the TSYNC syscall/executable-memory seal.

The only resource fields are one vCPU, 256 MiB guest RAM, 1,000 ms wall time, and concurrency one.
The fixed guest has no scratch device. CPU-time, exact host/VMM memory, and scratch-maximum fields
are omitted and unknown resource fields reject; no null or unsupported promise substitutes for a
mechanism. C2A transport caps and external Supervisor teardown/absence semantics remain exact.

V3's composed digest identifies the passive contract only. It does not make a runnable
materialization or authorize a guest. Accepted libkrun commit
`7432eda5a49220976b0167005aa43ee622f9d632` has no retained dylib identity, and no final runner
artifact exists. The prior libkrun dylib and build-only preflight remain historical evidence only.
A new version must bind current-source dylib and final-runner bytes before separate guest
authorization can be requested.

## Consequences

- Firmware, runner, device, descriptor, runtime, resource, and teardown semantics no longer depend
  on authority-bearing nulls.
- The exact passive contract is reviewable and digestable without wiring a consumer or overstating
  stale artifact bytes.
- Rebuilding libkrun and constructing the runner remain required; their byte changes require a new
  successor rather than mutation of v3.
- The first owned-guest task must name that later materialized profile digest and remain separately
  authorized, local, fixed-fixture-only, credential-free, and network-free.
- Any different resource, device, loader, firmware, root, runner, or teardown mechanism requires a
  new version and the applicable validation or ADR evidence.

## Later materialization

The immutable
[C2B v4 materialized successor](../protocol/GOVERNED_DENO_CORE_C2B_MATERIALIZED_PROFILE_V4.md)
later closed the exact build/static blockers without changing this decision or v3 bytes. It retains
the accepted header, twice-reproduced current-source unsigned libkrun dylib, independent ABI audit,
byte-equal unsigned final runner, and a new composed digest. Neither artifact was loaded or
executed. The fixed benign owned guest remains `BLOCKED` on separate authorization naming that
digest, and runtime/profile admission remains `BLOCKED`.
