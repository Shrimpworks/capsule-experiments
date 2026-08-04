# Gate E — Execution Supervisor language and privilege topology

Status: **conditional-pass** research spike; development-only and not a Capsule security boundary.

Owner: Capsule architecture maintainers.

Removal/replacement condition: retain this report, source pins, and negative fixtures until a final
Supervisor ADR supersedes the decision. Delete the prototype code after signed macOS integration
tests cover the same API and misuse cases in the selected implementation.

## Decision

Adopt the following **provisional macOS v0 default**:

- an unprivileged, per-user, native Swift Execution Supervisor;
- direct use of an exact pinned `Containerization` package/backend instance;
- only the `com.apple.security.virtualization` entitlement required by that direct backend;
- no Capsule root `LaunchDaemon` or privileged launcher;
- no use of the stock user-global `container-apiserver`, its CLI, or its broad XPC protocol as the
  Supervisor-only backend-control boundary.

This is a conditional pass, not a language freeze. The privilege question has enough evidence for
"per-user, not root." A license-free follow-up subsequently built and ran the pinned direct
`Containerization` lifecycle using Command Line Tools and an ad-hoc virtualization entitlement;
see [`../apple-containerization-direct/RESULTS.md`](../apple-containerization-direct/RESULTS.md).
The Swift selection remains provisional because Gate C still lacks exact PID control and durable
helper/VM identity and recovery evidence. A final ADR requires those remaining discriminating
results and the production-signed matrix.

A Go Supervisor with in-process native bindings is not the v0 default: Go can reach XPC and
Security through cgo, but Apple exposes the supported container library in Swift and no maintained
Go or C lifecycle API was found. A separate entitlement-bearing Swift backend helper remains the
only credible challenger. It must prove that process isolation materially reduces risk without
duplicating Supervisor authority or recovery state; it is not justified as a root helper.

## Gate and hypothesis

Gate E asks for the smallest maintainable component that can authenticate local peers, assess code
identity, own the approved attempt lifecycle, and control the selected Apple backend without
unnecessary privilege.

Hypothesis:

> macOS 26 and Apple Container can support a per-user Supervisor without root. Native Swift should
> minimize platform adaptation. Go should remain viable for platform checks through a narrow
> audited binding, while a helper should be rejected unless one specific backend operation cannot
> safely run in the Supervisor.

Threats addressed:

- a compromised same-user daemon calls the backend directly;
- a copied, stale, wrong-identifier, or ad-hoc process impersonates a trusted IPC peer;
- a native/FFI boundary widens the parsing or memory-safety TCB;
- a root or entitlement-bearing helper accepts policy, paths, images, flags, or replayed launch
  requests;
- partial Supervisor/helper/backend updates lose cleanup or grant-consumption state;
- language or binary-size preference is mistaken for proof of a security boundary.

## Authoritative repository baseline

- Repository revision: `9bfd2acedbccfbe851f797edc06eb447733188e3` (`origin/main`, "Document
  hardened architecture and spike plan (#7)").
- The worktree was clean and detached at that exact revision before spike edits.
- Required inputs read in full: `AGENTS.md`, `docs/PROJECT.md`, `docs/ARCHITECTURE.md`,
  `docs/TECHNICAL_DESIGN.md`, `docs/security/THREAT_MODEL.md`,
  `docs/FEASIBILITY_SPIKES.md`, `docs/EXECUTION_SUPERVISOR.md`, the protocol object model,
  relevant trust/integrity/compromise/evidence/update documents, and ADRs 0001–0018.
- `docs/PLATFORM_CONSTRAINTS.md` does not exist at the baseline revision.

## Environment and versions

Observed on 2026-07-31 in America/Toronto:

| Item | Observed value |
| --- | --- |
| Host | MacBookPro18,4; Apple M1 Max, 10 cores, 64 GB; arm64 |
| Operating system | macOS 26.5.2 build 25F84; Darwin 25.5.0 |
| Xcode | Not installed; active developer directory is Command Line Tools |
| macOS SDK | 26.5 at `/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk` |
| Swift | Apple Swift 6.3.3 (`swiftlang-6.3.3.1.3`) |
| Clang | Apple clang 21.0.0 (`clang-2100.1.1.101`) |
| Go | go1.26.5 darwin/arm64 |
| Apple Container | CLI 1.0.0, release commit `ee848e3`; installer receipt 1.0.0 |
| Pinned Apple source | `apple/container` 1.0.0 at `ee848e3`; `apple/containerization` 0.33.3 at `a2a1add` |
| Node/pnpm | Shell default Node 16.15.0 is below repo minimum; fnm Node 22.21.1 and pnpm 10.28.2 are installed |
| Git/ripgrep | Git 2.50.1; ripgrep 15.1.0 |
| Test privilege | Ordinary user. Escalation escaped the Codex workspace sandbox only; no command ran as root |
| Test entitlements | Probes were ad-hoc/linker signed with no Team ID and no custom entitlements |

The official Containerization source says its supported source-build configuration requires Apple
silicon, macOS 26, and Xcode 26. The license-free follow-up nevertheless observed that the exact
0.33.3 package compiled and ran on this host with Command Line Tools alone. That is useful
feasibility evidence, but it does not override upstream support requirements. See the pinned
[Containerization requirements](https://github.com/apple/containerization/blob/0.33.3/README.md#L34-L42).

## External primary evidence

All conclusions below use the installed binaries plus exact tagged Apple source rather than blog
descriptions:

- Apple documents `container-apiserver` as a launch agent and the per-container runtime as an XPC
  helper in the [v1.0 technical overview](https://github.com/apple/container/blob/1.0.0/docs/technical-overview.md#L39-L47).
- The v1.0 API client connects to one global `com.apple.container.apiserver` service and JSON-encodes
  container configuration in the
  [tagged client source](https://github.com/apple/container/blob/1.0.0/Sources/Services/ContainerAPIService/Client/ContainerClient.swift#L24-L73).
- The v1.0 server checks that client and server effective UIDs match, but does not apply a code
  requirement in the
  [tagged server path](https://github.com/apple/container/blob/1.0.0/Sources/ContainerXPC/XPCServer.swift#L163-L193).
- Apple Container 1.0.0 pins Containerization 0.33.3 and publishes many Swift client/server products
  in its [package manifest](https://github.com/apple/container/blob/1.0.0/Package.swift#L23-L71).
- Direct Containerization exposes an explicit `networking` switch; when false it does not allocate
  an interface in the
  [tagged manager source](https://github.com/apple/containerization/blob/0.33.3/Sources/Containerization/ContainerManager.swift#L190-L218)
  and [interface creation path](https://github.com/apple/containerization/blob/0.33.3/Sources/Containerization/ContainerManager.swift#L276-L317).
- Apple signs direct Virtualization consumers with
  [`com.apple.security.virtualization`](https://github.com/apple/containerization/blob/0.33.3/signing/vz.entitlements#L1-L8),
  which Apple defines as the Boolean entitlement permitting use of Virtualization.framework; the
  API checks entitlement availability during VM configuration validation
  ([Apple entitlement documentation](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.virtualization)).
- macOS XPC can enforce peer code requirements and returns a dedicated peer-signing error for a
  mismatch ([Apple XPC documentation](https://developer.apple.com/documentation/xpc/xpc_connection_set_peer_requirement)).
- `SMAppService` can register bundled launch agents and launch daemons, but a daemon is not required
  merely to create a per-user service
  ([Apple ServiceManagement documentation](https://developer.apple.com/documentation/servicemanagement/smappservice)).
- Go officially supports calling C APIs through cgo, subject to its C/Go pointer and callback rules
  ([Go cgo documentation](https://pkg.go.dev/cmd/cgo)).

## Prototypes and reproducibility

The retained probes are intentionally below product level:

- `swift-platform-probe/main.swift`: calls XPC peer-code-requirement and Security dynamic-code
  validity APIs directly from Swift.
- `go-platform-probe`: calls the same APIs through a small cgo shim; optional
  `--apple-api-ping` sends a raw XPC `ping` to the installed Apple service.
- `check-apple-source.sh`: pins exact upstream commits and fails if the tested EUID-only server
  shape, explicit no-network switch, or Virtualization entitlement changes.
- `run-smoke.sh`: builds and runs both local probes with experiment-local caches.

Reproduce the local API checks:

```sh
./experiments/gate-e-supervisor-topology/run-smoke.sh
```

Reproduce exact upstream source checks after cloning the two tags:

```sh
./experiments/gate-e-supervisor-topology/check-apple-source.sh \
  /path/to/apple-container-1.0.0 \
  /path/to/apple-containerization-0.33.3
```

The same-user Apple API probe additionally requires temporarily starting the already-installed
service outside the Codex sandbox:

```sh
container system start --disable-kernel-install --timeout 20
experiments/gate-e-supervisor-topology/.build/go-platform-probe --apple-api-ping
container system stop
```

Do not treat this as a backend-isolation test. It creates no Capsule attempt, approval, receipt, or
validated posture.

## Observed evidence

The observations in this section are direct command, binary, or exact-source results.

### Platform API probes

Both release probes compiled and produced the same security-API results:

```text
Swift: valid requirement=0, malformed requirement=22, same-team setter=0,
       self dynamic validity=0
Go:    valid requirement=0, malformed requirement=22, same-team setter=0,
       self dynamic validity=0
```

- Status `0` is success; the malformed requirement was rejected with `EINVAL` (`22`).
- Three additional malformed strings (`""`, `"identifier"`, and `"anchor and and"`) were rejected
  by the Go negative test.
- `go test` passed.
- Both ad-hoc probes reported dynamic code validity success. This directly demonstrates that
  dynamic validity alone is not a Team ID or enrolled-component identity check.
- Setting a same-team requirement succeeded syntactically, but no signed peer match was exercised.
  This probe proves API access, not end-to-end peer authentication.

The first Swift run crashed because the prototype allowed an inactive XPC connection to be
released. Activating and cancelling each synthetic connection fixed it. This is retained as a
useful negative result: native object lifecycle rules are part of the implementation burden even
for a small platform check.

### Stock Apple backend authorization

- `container system status` initially reported that the API server was neither running nor
  registered.
- `container system start --disable-kernel-install` registered
  `com.apple.container.apiserver` in `gui/501` as a `LaunchAgent`; it ran as the ordinary user.
- The ad-hoc Go binary had no Team ID or Apple Container signing identity. Outside the Codex
  workspace sandbox, its raw XPC `ping` received a dictionary reply:

```json
{"language":"go-cgo","appleApiPingStatus":0}
```

- The identical client received XPC error status `2` inside the Codex sandbox. This is a negative
  control showing a mandatory sandbox can block the route, but Capsule has not yet proved an App
  Sandbox profile for its daemon.
- The tagged Apple source check found only an effective-UID comparison on inbound API messages and
  no peer code requirement in that server file.
- After the probe, `container system stop` completed and a final status check confirmed the API
  server was not running or registered. No container, image, volume, or network was created or
  deleted by this spike.

### Direct Containerization follow-up

The separate license-free follow-up compiled a 75,443,168-byte debug probe from exact
Containerization 0.33.3, ad-hoc signed it with only the virtualization entitlement, and ran real
VM-backed containers without an Apple developer account. It observed `networking: false` with no
guest `eth0`, uid/gid 1000, `no_new_privileges`, no capabilities, a read-only root, bounded tmpfs,
an exact 256 MiB memory limit, bounded output with kill-on-overflow, and prompt helper disappearance
after controller `SIGKILL`.

The unmodified API left `pids.max` unlimited. A retained four-hunk patch subsequently exposed the
existing OCI control and dynamically enforced `pids.max=16` against both root and non-root fork
attacks. That resolves local mechanism feasibility, not dependency governance or upstream support.
Counterevidence remains decisive on recovery: a restarted manager cannot enumerate or reopen the
exact VM/helper through a supported durable identity. The direct path is viable for one focused
identity/recovery spike, not a validated backend.

### Footprint and dependency observations

These are measurements, not estimates of a finished Supervisor:

| Artifact | Release file size | Maximum resident set in one no-op probe run |
| --- | ---: | ---: |
| Swift platform probe | 73,000 bytes | 7,880,704 bytes |
| Go+cgo platform probe | 1,729,074 bytes on the final rerun | 10,862,592 bytes in the original measured run |

The separate direct-Containerization debug probe was 75,443,168 bytes after ad-hoc signing. That
non-optimized package build is not comparable to the two no-op release probes, but it confirms that
the backend dependency—not Capsule's small platform adapter—dominates the executable footprint.

The installed Apple 1.0.0 executables measured approximately 52.9–59.9 MB each: CLI, API server,
runtime helper, image helper, and network helper. Tagged source contained 20,971 physical Swift
lines under `Sources/Containerization`, 50,920 under all Containerization `Sources`, and 40,893
under Apple Container `Sources`. Containerization declares 14 direct SwiftPM dependencies. These
rough counts show that the backend library dominates TCB/dependency review; they do not predict the
size of a dead-stripped Capsule binary or count transitive code actually reachable at runtime.

## Inferences from the observations

The following are reasoned conclusions, not directly observed enforcement results:

1. **Root is not required for the candidate topology.** The installed backend operates as a
   per-user launch-agent stack, and direct Virtualization.framework use is entitlement-gated rather
   than documented as root-only. Gate C could still discover a specific required operation that
   changes this, but no such operation is currently evidenced.
2. **The stock Apple service is not Capsule's authority boundary.** An ad-hoc same-user program can
   reach it, and its source authorizes by EUID. Unless a separately validated mandatory sandbox
   prevents the daemon from resolving that service, a compromised daemon could bypass Capsule's
   Supervisor protocol. Capsule should avoid starting or depending on this global API service.
3. **Swift has the smallest adaptation layer.** It can use the official Containerization package,
   native XPC/Security/ServiceManagement APIs, Swift concurrency, and OS logging without a custom
   foreign ABI. This does not make its full TCB small; it only minimizes Capsule-owned glue.
4. **Go can implement the Supervisor's non-native state machine, but direct macOS backend access is
   not narrow today.** XPC/Security calls through cgo are mechanically possible. The missing piece
   is a maintained lifecycle API: reimplementing Apple's evolving XPC/JSON protocol, spawning the
   broad CLI, or designing an async Swift C ABI all add audit and update cost.
5. **A native helper cannot yet be called tiny or semantically dumb.** A correct helper must at
   least authenticate the Supervisor, validate a versioned sealed descriptor, create/start/stop/
   destroy/reconcile VMs, report stable backend handles, handle duplicate/out-of-order operations,
   and survive crashes. It may remain policy-dumb—it must never parse plans, approvals, paths,
   images, mount flags, or content formats—but its lifecycle semantics are nontrivial.

## Comparison of the three options

| Criterion | Native Swift Supervisor | Go Supervisor + narrow native bindings | Unprivileged Supervisor + native helper |
| --- | --- | --- | --- |
| Platform API coverage | Best. Direct official Swift Containerization plus native XPC, Security, ServiceManagement, Keychain, and logging | XPC/Security probe passed through cgo; no official maintained Go/C Containerization lifecycle API found | Best inside helper; Supervisor language remains independent |
| Privilege minimization | Per-user; Supervisor carries Virtualization entitlement because launch is already its authority | Per-user if binding is in-process; same entitlement moves into Go process/native library | Supervisor can be unentitled; helper carries Virtualization entitlement. Root remains unjustified |
| IPC/serialization surface | No additional backend IPC if direct library is used | In-process FFI ownership/callback boundary; stock service alternative has broad XPC+JSON surface | Adds one authenticated protocol, replay/version handling, descriptors, replies, and crash ambiguity |
| TCB/process blast radius | Containerization/native bugs share the process with grant ledger, evidence key, and recovery state | Adds Go runtime plus native backend and binding in the same process | Backend compromise is process-contained from evidence key/ledger, but helper still has launch power and scoped content |
| Entitlement/signing | One enrolled executable; same-team/signing-ID requirements natural in Swift | Product signing still required; cgo does not remove entitlement or identity requirements | Two enrolled executables, exact peer requirements, helper entitlement, and an additional epoch component |
| Update/recovery coupling | One component/epoch update; backend and Supervisor core move together | One component if statically/in-process bound, but Swift/C ABI compatibility becomes internal release work | Highest: mixed Supervisor/helper versions, helper replacement, pending operations, and reconciliation must fail closed |
| Binary/runtime footprint | Minimal probe was 73 KB/7.9 MB RSS; real backend build unmeasured | Minimal probe was 1.91 MB/10.9 MB RSS before backend code | At least native backend footprint plus Supervisor and IPC; Apple's own runtime helper is about 54.9 MB |
| Observability | Direct lifecycle events and OSLog in one process; easiest transcript correlation | Go structured logging is strong; native callback/error correlation needs explicit binding | Clean boundary events are observable, but split clocks/logs and indeterminate replies complicate transcripts |
| Testability | Native test seams exist; ContainerManager accepts an injected virtual-machine manager; signed platform tests still required | Go state-machine/fault tests are strong; cgo and macOS-only integration require separate suites | IPC misuse/fault injection is explicit, but the state space and fixtures increase materially |
| Maintenance | New Supervisor language, but Swift already exists for Broker and matches upstream backend | Preserves Go expertise but owns an unsupported cross-language backend bridge | Highest deployment/protocol/recovery cost; potentially worthwhile only for demonstrated containment benefit |
| Can helper stay semantically dumb? | Not applicable | An in-process binding is glue, not an authority helper | Policy-dumb is plausible; stateless or lifecycle-dumb is not yet demonstrated |
| Spike disposition | **Provisional default** | **Do not select for v0 without a stable native API experiment** | **Provisional challenger; never root by default** |

## Gate result

**Decision: conditional-pass.**

What passed:

- per-user operation is evidenced;
- no root/administrator runtime helper is justified;
- Swift and Go can both invoke the required XPC/Security checks;
- the stock Apple user-global API is positively disqualified as the Capsule launch boundary;
- a concrete, least-component provisional choice exists: direct native Swift Supervisor.

What prevents a full pass:

- Gate C has not established the exact enforceable backend contract;
- Gate B has not demonstrated signed peer rejection, Keychain/storage separation, or the daemon's
  mandatory sandbox profile;
- the upstream direct package still omits guest PID control; the retained local patch works but is
  not yet an accepted, governed dependency;
- no supported durable identity/enumeration surface can reconcile the exact VM/helper after a
  Supervisor restart, and no direct-Swift versus helper recovery comparison exists;
- no signed release footprint, entitlement, update, or orphan-reconciliation result exists.

The safe fallback remains the fake backend, which creates no guest. Apple execution stays
development-only.

## Contract and architecture consequences

These are concrete follow-up edits; this spike deliberately does not rewrite the architecture
documents:

1. `docs/EXECUTION_SUPERVISOR.md`: record the provisional per-user Swift/direct-Containerization
   choice, forbid root and stock `container-apiserver` in v0, and link this spike.
2. New `docs/PLATFORM_CONSTRAINTS.md`: state Apple silicon + macOS 26, Xcode 26 build requirement,
   exact Containerization pin, Virtualization entitlement, signing/notarization requirements,
   supported XPC peer-requirement OS floor, user-session behavior, and the lack of root need.
3. `docs/ARCHITECTURE.md`: specify that "Supervisor to backend" means a private enrolled backend
   instance or an independently authenticated narrow helper—not a same-user global management
   service.
4. ADR-0005: clarify that "Go isolation orchestration" was refined by ADR-0018 and does not decide
   the macOS Supervisor.
5. ADR-0018 follow-up: after the signed experiment, accept the final Supervisor language and either
   prohibit a helper or define its exact non-root entitlement, operations, descriptor, state, and
   removal rule.
6. `docs/security/THREAT_MODEL.md`: add direct invocation of a vendor same-user backend service to
   component-substitution/daemon-bypass stories and required tests.
7. `docs/security/CONTROL_EVIDENCE_MATRIX.md`: keep AUTH-002 proposed/blocked; link this spike as
   counterevidence for stock Apple API use. Do not promote RI-001 from setter-level probes.
8. Gate C/backend contract: default `networking` must be set explicitly to false; never rely on the
   upstream default, which is true.

## Open risks and limitations

- Containerization 0.33.3 is still an evolving pre-1.0 library. Its own README limits source
  stability to minor versions; exact pinning and coordinated updates are required
  ([primary source](https://github.com/apple/containerization/blob/0.33.3/README.md#L174-L180)).
- Apple Container's public API has a broad 36-route control surface in the inspected tag. Capsule
  would require only a narrow subset, but no stable subset protocol is documented for non-Swift
  consumers.
- Rootless/per-user does not protect against a malicious same-user process. Capsule still needs
  proven code requirements, sandbox rules, protected stores, and Keychain groups.
- The `com.apple.security.virtualization` entitlement is necessary capability, not evidence that
  configuration is safe or that resource/network controls are enforced.
- Directly linking Containerization puts image/archive/OCI, gRPC/vsock, filesystem, and VM lifecycle
  code near the Supervisor's keys and ledger. Exact reachable TCB and process isolation benefit are
  unmeasured.
- A helper would add an authority-bearing process. If it accepts arbitrary paths, image names,
  mounts, environment, backend flags, or general JSON, it fails Gate E regardless of language.
- Swift and Go probes used ad-hoc binaries. They did not test a Developer ID team, hardened runtime,
  notarization, entitlements, debugger rejection, or stale build/epoch cases.
- The successful Apple API ping proved reachability only. It did not create a VM or evaluate Gate C
  network, storage, resource, teardown, or recovery controls.
- The service start/stop reused an existing user installation and existing caches. No test result
  may be generalized to a clean install or another OS/SDK patch level.
- Full Xcode was unavailable, so the official pinned package's build graph and signed direct
  lifecycle remain unobserved here.

## Next smallest discriminating experiment

On one clean macOS 26 Apple-silicon VM with matching Xcode 26:

1. Build and Developer-ID-sign two development-only facades against exact Containerization 0.33.3:
   - A: Swift Supervisor-shaped process directly owning the backend;
   - B: Go Supervisor-shaped process plus an unprivileged Swift helper carrying only the
     Virtualization entitlement.
2. Give both the same frozen five-operation backend seam:
   `probe`, `createStart`, `terminate`, `destroy`, `reconcile`. Inputs are fixed typed fields,
   Supervisor-generated attempt/backend IDs, digest-bound file descriptors, exact numeric limits,
   and no paths/images/mounts/environment/general JSON.
3. Run one pinned, dependency-free, no-network fixture from local immutable bytes. Do not use the
   stock Apple API service.
4. Attack each facade with ad-hoc, same-team-wrong-ID, stale-build, wrong-epoch, duplicate,
   out-of-order, truncated, oversized, replayed, and unknown-operation requests.
5. Kill each process before and after create/start/terminate/destroy and prove that the Supervisor's
   cleanup lease and independent enumeration reach an explicit destroyed or unresolved state.
6. Record signed entitlements, launchd domain/EUID, active code identity, IPC schema and parser SLOC,
   release binary/RSS/startup measurements, backend/library reachable dependencies, and update/
   repair transitions.

Selection rule:

- choose direct Swift if both enforce the same contract and the helper does not demonstrate a
  concrete containment benefit greater than its IPC/update/recovery cost;
- choose the hybrid only if backend/library compromise is observably contained from the evidence
  key, grant ledger, and Supervisor store while the helper stays policy-dumb and accepts no wider
  authority;
- reject both if either requires root, a same-user global control service, replacement plan bytes,
  arbitrary paths/images/flags, or unreconciled launch ambiguity.

Until that experiment and Gate C pass, keep the language choice explicitly provisional and the
Apple backend development-only.
