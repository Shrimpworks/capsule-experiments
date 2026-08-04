# Gate C P0-4A installed development topology results

Date: 2026-08-02 (America/Toronto)

Repository base: `22aa6d7d` (`docs: integrate external security review findings (#21)`), plus the
experiment-scoped files in this directory.

Decision: **conditional pass—continue the no-host-root packaging topology into the remaining P0
work, but do not admit the backend or claim signed/notarized distribution.**

## Hypothesis and decision boundary

An early complete app shape can enumerate every first-slice role, retain exact candidate or
explicit placeholder bytes, register an embedded per-user Supervisor without root, authenticate
the tested IPC process identities, recover from a service crash, and reject incomplete or mixed
installed components.

P0-4A cannot select final runtime/root/port/`NullFs` mechanisms, produce a
`development-admitted` `BackendValidationRecord`, or substitute for P0-4B. The harness deliberately
does not link its Supervisor or runner to libkrun, start Hypervisor.framework, boot the placeholder
root, or execute Bun.

The observed result supports continuing this topology because complete-role enumeration,
installed-byte readback, per-user registration/activation, exact IPC identity, stale-peer refusal,
and crash/reconnect all compose without host-root authority. It remains conditional because the
local credential set was ad-hoc only, the sandboxed runner was rejected before `main`, the exact
candidate floor was macOS 26, on-demand Mach activation was not established, and every execution
mechanism still depends on P0-0 through P0-3.

## Environment

| Item | Observed value |
| --- | --- |
| Host | MacBookPro18,4; Apple M1 Max; arm64; 10 cores; 64 GB |
| macOS | 26.5.2 (25F84), Darwin 25.5.0 |
| Xcode | 26.6 (17F113), SDK 26.5 |
| Apple clang | 21.0.0 (`clang-2100.1.1.101`) |
| Swift | 6.3.3 |
| Python | 3.14.6 |
| libkrun | 1.19.4, commit `728df8125077d0db44265f6e997c72b81b65c015` |
| libkrunfw/kernel | 5.5.0 / embedded Linux 6.12.91 candidate |
| Runtime | Bun 1.3.14, retained only as the stock candidate rejected by P0-0 |
| Signing credentials | zero valid local code-signing identities; ad-hoc Hardened Runtime signatures |
| launchd context | `gui/501`, audit session `100023` |
| Privilege | ordinary user; no `sudo`, LaunchDaemon, root helper, setuid/setgid byte, or restricted file exception |

## Observed evidence

| Case | Observation | Result |
| --- | --- | --- |
| Complete role manifest | The generated closed manifest listed 18 app/service/runtime roles and explicitly kept `backendAdmitted=false`. | Pass for topology enumeration |
| Installed-byte readback | After `ditto` into `~/Applications`, 17 non-self-referential entries matched exact SHA-256, length, mode, Mach-O minimum OS, identifier, Team field, and CDHash where applicable; the main executable used strict outer-signature readback. | Pass with explicit outer-signature exception |
| Missing component | Removing the refusing guest-launcher placeholder returned bounded status 78. | Refused |
| Mixed component | Replacing the current client with same-identifier stale bytes returned bounded status 78 before service use. | Refused |
| Unexpected component | Adding an undeclared runtime-root path returned bounded status 78. | Refused |
| Descriptor manifest | The closed FD 0–7 control binary observed the exact access modes; injecting FD 8 returned status 78. No guest was created. | Pass for harness mechanics only |
| App Sandbox | The nested App-Sandbox/Hypervisor-entitled runner terminated with status 134 before `main`; unified log recorded AMFI error -423 for an ad-hoc/unknown chain. | Environmental signing gap, not a pass |
| Embedded registration | `SMAppService.register` returned success and `enabled`; launchd retained the bundle-relative Supervisor, Mach service, per-user domain, and `AbandonProcessGroup=true`. | Pass on this host with ad-hoc development bytes |
| Activation | Explicit `launchctl kickstart gui/501/<exact-label>` started the registered unprivileged Supervisor. Initial Mach lookup alone did not establish activation. | Explicit activation pass; on-demand remains open |
| Live process identity | Both XPC directions enforced the ad-hoc identifier+CDHash requirement; the reply's actual `SecCode`, EUID 501, and audit session 100023 matched. | Pass for exact ad-hoc identities, not Team enrollment |
| Stale live peer | A same-identifier client with a different CDHash received `Connection interrupted`. | Refused |
| Crash/reconnect | After exact-label `SIGKILL`, explicit per-user kickstart plus a fresh XPC connection reached PID 45151/instance `62a186d0584f26fb9f78c73aceae0e86`, distinct from PID 44979/instance `582407bb7885519c60adb114ee8cba2c`. | Pass for same-session explicit recovery |
| Gatekeeper | `spctl --assess --type execute` rejected the app with status 3. | Expected distribution gap |
| Cleanup | `SMAppService.unregister` succeeded and the manifest-verified installed app was removed. | Pass |

## Exact installed identities

The retained installed manifest SHA-256 was
`70f6c89f4703b26dbd98cbb19d402b6a1dfe87280b857e401b30fe5b00af08fa`.
The descriptor manifest SHA-256 was
`93d99f0b37f5420a5eba3078858c1a2ffe55578ca324dafb919d950c4728bae8`.
The complete component table, including exact paths, states, hashes, Mach-O floors, identifiers,
Team fields, and CDHashes, is retained at
[`evidence/2026-08-02/installed-components.tsv`](evidence/2026-08-02/installed-components.tsv).

The exact bundle exposed an effective macOS floor of **26.0**, despite the harness source declaring
13.0 for `SMAppService`: the retained libkrunfw candidate itself carries `minos 26.0`. libkrun
carries 11.0 and Bun 13.0. A final supported floor requires rebuilding and testing every final byte
on clean hosts; editing `LSMinimumSystemVersion` cannot lower a dependency's floor.

## Why the no-host-root topology remains coherent

- Registration used `SMAppService.agent`, not a daemon service or a plist installed in
  `/Library/LaunchDaemons`.
- launchd placed the job in `gui/501` and the service reported EUID 501/audit session 100023.
- The embedded plist uses a bundle-relative Supervisor and contains no `UserName=root`, absolute
  `Program`, privileged helper, app group, or temporary filesystem entitlement.
- Every Mach-O mode was checked for setuid/setgid bits; none was present.
- The Supervisor and runner remain distinct roles. The runner's exact descriptor candidate contains
  no key, database, network, XPC, temporary-directory, or writable-root role.
- Failure of the App Sandbox runner did not trigger a root/helper fallback. It remains a signing and
  packaging gap for an Apple-credentialed rerun.

This establishes coherence of the early topology, not containment. The ad-hoc service identities
have no Team enrollment; the Supervisor and launcher are placeholders; and the descriptor control
binary is not a VMM.

## Every provisional final byte or mechanism

1. Supervisor implementation, authenticated durable ledger, enrolled manifest, trust epoch, keys,
   update fence, repair, and quarantine behavior.
2. Supervisor-only sealed runner launch descriptor and OS-enforced caller/launch binding.
3. P0-0 governed runtime-authority closure; stock Bun 1.3.14 remains rejected.
4. P0-1 final runtime-root bytes, protected construction, genuine read-only descriptor custody,
   `/dev/fd/N` attachment identity, recovery, and same-user corpus.
5. P0-2 `NullFs` removal or complete bounded review/fuzz acceptance.
6. P0-3 exact source/input/completion byte layouts, independent caps, attempt/profile bindings,
   port directionality, continuous drain, commit trailer, hostile virtio-console corpus, and final
   runner FD roles.
7. Final guest launcher process, drop/inheritance behavior, child-tree wait, result collection, and
   completion ownership.
8. Final firmware, kernel/config/boot/module/debug policy, runtime root, and runtime bytes.
9. Governed libkrun/libkrunfw patches plus exact source publication, notices, SBOM, provenance,
   advisory, update, and rollback handling.
10. Final entitlements, app/nested-bundle layout, embedded service plist, `AbandonProcessGroup`
    policy, on-demand activation, and main-executable installation-manifest identity mechanism.
11. Apple Development/Developer ID identities, Team requirements, epoch-specific access groups,
    notarization, staple, Gatekeeper/quarantine/translocation, updater/package, and clean-host
    readback.
12. Supported macOS floor and matrix; the currently assembled exact candidate is floor 26.0.
13. Wrong-user/session, fast-user-switch, logout/login, reboot, sleep/wake, update mix, rollback,
    pressure, power-loss, automatic restart/backoff, and restart-storm recovery.
14. Final profile/review/registry/capability/validation objects and their evidence digests,
    invalidation triggers, expiry, and `development-admitted` ceiling.

Any final byte, entitlement, topology, descriptor, patch, or minimum-OS change invalidates the
dependent P0-4A observation and must be rerun in P0-4B after P0-0 through P0-3 close.

## Claim boundary and residual unknowns

- No Developer ID or Apple Development identity was available. Ad-hoc exact-CDHash behavior does
  not prove Team/channel requirements, protected app containers, Developer ID distribution, or
  notarization.
- The App Sandbox runner did not reach `main` under ad-hoc signing. The identical unsandboxed
  control validates only descriptor code; it is not substitute sandbox evidence.
- The run used one host, user, boot, Aqua session, and macOS 26.5.2. There is no clean-host or
  minimum-floor execution evidence.
- Explicit kickstart recovered the service. Initial Mach lookup spawned an earlier malformed
  six/seven-argument prototype but the retained corrected run did not separately re-prove pure
  on-demand activation.
- The app contains real pinned candidate libkrun/libkrunfw/Bun bytes but never loads them. Bun is
  explicitly rejected, firmware/kernel/root/launcher include placeholders, and no source/license
  package or final manifest exists.
- This run says nothing about hostile-guest/VMM isolation, runtime-root immutability, `NullFs`, port
  safety, completion semantics, terminal integrity, VM recovery, or final admission.

## Retained artifacts and reproduction

Tracked durable artifacts are the complete source, input manifests, fixtures, scripts, tests, this
decision, and `evidence/2026-08-02/`. Ignored `.build/` and `.runs/` contain derived local binaries,
mutated negative copies, the full generated JSON manifest, live logs, and process observations.

```sh
./experiments/gate-c-installed-development-topology/build.sh
./experiments/gate-c-installed-development-topology/verify.sh
./experiments/gate-c-installed-development-topology/run.sh
```

P0-4B was not attempted and must not start until P0-0 through P0-3 select the exact final
mechanisms.
