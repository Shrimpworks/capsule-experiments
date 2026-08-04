# Gate B Installed Per-User Services Results

Date: 2026-07-31
Repository revision: `1f9f55bf2c7cc25b936dc9e2ceb343113f398c3c` plus the uncommitted,
experiment-scoped files in this directory
Decision: **conditional pass for the tested development topology**

## Hypothesis and threat

Three independently signed, unprivileged, per-user components can use launchd activation and
authenticated XPC as real process boundaries. Exact peer requirements must reject a stale but
otherwise valid same-team component in both the client and service positions; typed protocol checks
must independently reject malformed and wrong-epoch requests.

This addresses same-user component impersonation, stale replacement, unauthenticated IPC, confused
roles, and accepting a protocol request merely because its process has a valid Apple signature. It
does not address hostile-guest isolation or make launchd an execution authorizer.

## Environment

| Item | Observed value |
| --- | --- |
| macOS | 26.5.2 (25F84), arm64 |
| Xcode | 26.6 (17F113) |
| Apple clang | 21.0.0 (`clang-2100.1.1.101`) |
| SIP | enabled |
| Signing | Apple Development, Team `3DDR84M4JS` |
| launchd domain | `gui/501`, Aqua login session |
| Audit session | `100023` during the retained run |
| Privilege | no `sudo`, LaunchDaemon, root helper, privileged port, or restricted entitlement |

Every binary was signed with Hardened Runtime, a distinct role identifier, no
`get-task-allow` entitlement, and an exact active CDHash in the peer requirement. The stale build
kept the same Team and signing identifier but had different compiled bytes and CDHash.

## Observed evidence

`./run.sh` completed successfully on the environment above.

| Case | Observation |
| --- | --- |
| Per-user registration | Three plists installed under `~/Library/LaunchAgents` bootstrapped into `gui/501`; `launchctl print` found all three labels. |
| On-demand activation | Daemon-to-Supervisor, Broker-to-Supervisor, Supervisor-to-Broker health, and Supervisor-to-daemon health messages activated their services and returned a service PID plus random per-process instance value. |
| Narrow listener authority | The Supervisor used separate daemon and Broker Mach service names and installed a different exact listener peer requirement on each. |
| Symmetric exact identity | Each listener applied `xpc_connection_set_peer_code_signing_requirement`; each client independently applied an exact server requirement. Both receivers then revalidated the actual reply/request sender with `SecCodeCreateWithXPCMessage`. All four enrolled channels reported both checks true. |
| Effective user | XPC connection metadata and message replies agreed that client and service effective UID were `501`; the client rejected any disagreement. |
| Audit session | XPC connection metadata, service-observed peer metadata, and each process's task audit token agreed on audit session `100023`; the client rejected any disagreement. |
| Malformed operation | An authenticated exact daemon peer sent `forged-operation`; the Supervisor returned bounded status `10` (`unknown operation`). |
| Wrong epoch | An authenticated exact daemon peer sent `epoch-stale`; the Supervisor returned bounded status `13` (`epoch mismatch`). The harness performed no authoritative action. |
| Stale client | A newly compiled Apple Development-signed daemon with the same Team and signing identifier but a different CDHash received `Connection interrupted`; no protocol reply was accepted. |
| Service crash/reconnect | After `SIGKILL` through `launchctl kill`, a fresh daemon connection caused launchd to activate a new Supervisor. Both its PID and random process-instance value changed; exact values are retained in the ignored run log. Exact identity, UID, and audit-session checks passed again. |
| Stale service replacement | After clean Broker bootout, the installed path was populated with a newly compiled same-Team/same-identifier Broker having a different CDHash. The enrolled Supervisor client rejected it with `Peer Forbidden`. |
| Enrolled restore | Restoring the exact enrolled Broker at the same path and bootstrapping the unchanged plist returned the channel to an accepted state. |
| Cleanup | All three services were booted out. Independent follow-up checks found none of the three labels, plists, or the marker-owned install root. |

The ignored `build/last-run.log` retains all accepted reply fields and bounded denial descriptions
for the latest local run. Derived binaries are reproducible and are not repository evidence by
themselves.

## Enforcement, protocol, and harness boundaries

| Property | Classification | Exact boundary |
| --- | --- | --- |
| Apple Team/channel/role/no-debug/CDHash requirement before message delivery | OS enforcement observed | Exact Apple Development binaries on this macOS build |
| Actual message/reply sender tied to the requirement | OS identity object plus harness validation observed | `SecCodeCreateWithXPCMessage` and strict `SecCodeCheckValidity` |
| Effective UID and audit-session metadata | OS observation | Connection-start metadata in one current Aqua session |
| Role and epoch acceptance | Development protocol check | Compile-time role plus constant `epoch-installed-1`; no durable trust store |
| New service instance after crash | launchd behavior plus harness marker | Random process instance proves new process generation; PID is recorded only as lifecycle evidence, never identity |
| Install/remove ownership | Script safety rule | Exact labels/plists plus marker-validated spike install root |

## What this supports

The run supports continuing with an unprivileged per-user Supervisor/Broker/daemon packaging
direction. It closes the narrow feasibility question that launchd on-demand activation, exact
bidirectional XPC requirements, message-derived identity, current-session checks, and reconnect to
a new Supervisor instance can compose on this host.

It also confirms that an expected path and a valid same-Team/same-role signature are insufficient:
the exact active build set must be enrolled on both ends of trusted IPC. Epoch remains a separate
typed protocol and durable-state responsibility.

## Limitations and blocked cases

- Only one logged-in user and one audit session were available. Wrong-user denial, fast-user
  switching, simultaneous login sessions, loginwindow transitions, and logout/login recovery are
  **blocked**, not simulated.
- The run established a fresh connection after the Supervisor crash. It did not test a long-lived
  client's in-flight message ambiguity, retry/replay policy, or durable request idempotency.
- `epoch-installed-1` is a constant. There is no signed manifest, durable epoch store, update fence,
  grant ledger, attempt, key rotation, or repair-required transition in this experiment.
- Replacement used clean bootout/bootstrap around an expected installed path. Atomic installer
  swap races, partial update, rollback, launchd cache behavior during a real package update, and
  crash-safe per-release Keychain-group changes remain Gate F work.
- Apple Development is not Developer ID/notarized installed-product evidence. App bundles,
  provisioning-profile-backed restricted groups, notarized packages, updater ownership, minimum-OS
  compatibility, and distribution migration remain untested here.
- Screen lock and LocalAuthentication state were not exercised because this protocol has no UI or
  Approval-key operation. The earlier Gate B user-presence experiment is separate evidence.
- The Supervisor-to-Broker and Supervisor-to-daemon paths are bounded health probes in this
  experiment. They do not justify a product control API or any daemon backend authority.
- The local administrator, kernel, launchd, code-signing services, and current user remain trusted
  assumptions. A copied byte-identical binary retains the same identity by design.

## Gate consequence

**Conditional pass, narrowed.** Installed per-user launchd/XPC lifecycle is no longer a basic Gate B
feasibility blocker on the tested macOS/Apple Development configuration. Gate B still cannot be
called shipping-validated until distribution-packaged services bind the real durable epoch and
stores, survive update/replay/session matrices, and pass the same exact-peer tests on the minimum
supported OS.

The evidence supports the existing architecture; it requires no pivot and creates no new
Supervisor responsibility. Product channels should preserve separate purpose-specific Mach
services rather than one listener with a broad OR requirement when the operations or accepted roles
differ.

## Reproduction and scoped verification

```sh
./experiments/gate-b-installed-services/run.sh
shellcheck -x experiments/gate-b-installed-services/run.sh
sh -n experiments/gate-b-installed-services/run.sh
clang -fblocks -Wall -Wextra -Werror \
  -DCOMPONENT_ROLE='"probe"' -DCOMPONENT_BUILD='"syntax"' \
  experiments/gate-b-installed-services/Sources/component.c \
  -framework CoreFoundation -framework Security -lbsm \
  -o /private/tmp/capsule-gate-b-component-syntax
plutil -lint experiments/gate-b-installed-services/LaunchAgent.plist
git diff --check -- experiments/gate-b-installed-services
```

After any interrupted run, inspect the exact labels/paths and then use `./run.sh --cleanup`.
