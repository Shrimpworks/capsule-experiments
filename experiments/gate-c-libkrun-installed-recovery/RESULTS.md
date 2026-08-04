# Gate C installed libkrun lifecycle and recovery results

Date: 2026-07-31 (America/Toronto)

Repository revision: `1f9f55bf2c7cc25b936dc9e2ceb343113f398c3c` plus the uncommitted,
experiment-scoped files in this directory and the parent task's pre-existing working-tree changes.

Decision: **conditional pass for the exact same-machine, cooperating-process installed runner-read
and Supervisor-recovery mechanics; authority separation, distribution completion, and corrupt-disk
terminal integrity remain failed/open.**

This is development-only feasibility evidence. It does not promote libkrun/HVF to
`validated-local`, prove a production boundary, or authorize hostile execution.

## Hypothesis and threat

A Developer ID-signed, hardened-runtime, App-Sandboxed runner can boot one read-only raw root from
its own signed installed app bundle without an absolute-path exception or app group. An
unprivileged per-user LaunchAgent Supervisor can durably record the exact runner before start,
survive `SIGKILL`, compare a reparented runner's PID/start time/UID/GID/path/signing
identifier/Team/CDHash and installed SHA-256, and signal only that process.

The cases address temporary-path authority, runner substitution, PID reuse or path/name-only
cleanup, corrupt records, live update replacement, record-write failure before guest start, and
launchd child cleanup. They do not establish VMM resistance to a malicious guest, mutable
scratch/output custody, bounded console, or clean-machine distribution.

## Environment and exact inputs

| Item | Observed value |
| --- | --- |
| Host | MacBookPro18,4; Apple M1 Max; arm64; 10 cores; 64 GB |
| macOS | 26.5.2 (25F84), Darwin 25.5.0 |
| Xcode / SDK | Xcode 26.6 (17F113), macOS SDK 26.5 |
| Apple clang | 21.0.0 (`clang-2100.1.1.101`) |
| Go | 1.26.5 |
| Rust | 1.93.1 |
| libkrun | 1.19.4, commit `728df8125077d0db44265f6e997c72b81b65c015`, retained two-patch tree |
| libkrunfw / kernel | 5.5.0 / Linux 6.12.91 |
| Hypervisor | `kern.hv_support=1` observed by the host-capability preflight |
| Signing | Developer ID Application, Team `3DDR84M4JS`, hardened runtime, secure timestamp |
| Notary tooling | `notarytool` 1.1.2 (41); authenticated `capsule-notary` profile |
| launchd | `gui/501`, audit session `100023` during the run |
| Privilege | per-user app and LaunchAgent; no `sudo`, LaunchDaemon, root helper, app group, or restricted file exception |

Exact signed/artifact bytes at the evidence point:

| Artifact | SHA-256 / CDHash |
| --- | --- |
| runner Mach-O | SHA-256 `d3ead5d7ab4328aa326efac86487536618d9441012cf31dd191ba231d16db8b9`; CDHash `f19740beee06605936d493886dd95bf3f2b887cf` |
| signed libkrun | `3435c2e29796d90d5b3381895132536277a98a5bce96d49c6888fd601a6111dc` |
| signed libkrunfw | `7300690a531743ccb2824350638bd3aec7dd48c0743f75de7d1ee0695f8d45e7` |
| read-only root fixture | `7e75817e4f2351dd29cef77292984169d2eddef03ea1c1547635dca280d0422d` |
| recovery Supervisor | `8fb089b85b0be475cedf53dc6fc2485b2021effcfa1cbca4e850bd7e4cc3c772` |
| process-identity helper | `b40eda48c96553e49e602fa38182a97247d00b1d81be7f006c921c9a4d62397f` |
| positive LaunchAgent profile | `0e3301bc1a7b4e34fd547523887abfbd185247b073cd70dc2171f4a685c8fc2f` |
| submitted zip | `2ff57f7ddc8110824b47eec457792b42b46ea2f1fa280f064ab20015e891161e` |

Mach-O hashes change when timestamped signatures change. A distributed runtime manifest must bind
the actual distributed bytes, while source provenance separately binds upstream commits, patches,
firmware/kernel source, and toolchains.

## Observed evidence

| Case | Observation | Result |
| --- | --- | --- |
| Developer ID build | The app, nested dylibs, runner, Supervisor, and identity helper were signed. The app requirement checked Developer ID OID, Team, identifier, and no `get-task-allow`; hardened-runtime timestamps were present. | Pass on this machine |
| Sandbox/storage shape | Entitlements contained only App Sandbox and Hypervisor. No temporary file exception or app group was present. The 0444 root was a sealed `Contents/Resources` file. | Pass for runner read authority; same-user write protection unproven |
| Installed launch | The app ran from `~/Applications`; the LaunchAgent and Supervisor state ran from their exact per-user Application Support/LaunchAgents paths. The guest emitted exact marker `INSTALLED_GUEST_BOOTED` through the trusted launcher from the bundle root. | Pass for guest entry; not authoritative completion evidence |
| Outside storage | The same sandboxed runner given the prior experiment's worktree disk failed virtio-blk configuration and exited 125. | Pass negative |
| Corrupt root | A signed app containing a 1 MiB zero root logged `mount KRUN_BLOCK_ROOT_DEVICE: Invalid argument`, but its host runner exited **0**. | **Fail: exit status is not terminal guest success evidence** |
| Record before start | The Supervisor fsynced a new JSON temp file, renamed it, fsynced its directory, then wrote one `G` byte. A pre-existing temp file caused the durable write to fail; pipe EOF aborted the runner before authorization. | Pass for injected create/write conflict; real ENOSPC untested |
| Exclusive Supervisor lease | A second signed Supervisor launched against the live store received nonblocking `flock` failure and did not create another runner. | Pass negative for cooperating prototype processes |
| Reparent and exact reap | With `AbandonProcessGroup=true`, three ordinary Supervisor `SIGKILL`/restart loops produced reparented runner PPID 1. Recovery compared the complete durable/live tuple and installed SHA-256, sent `SIGTERM`, and retained `reaped-exact` terminal records. | Pass, three loops |
| Corrupt identity record | Changing recorded start-useconds made recovery refuse to signal a still-live runner. Restoring the exact record allowed exact recovery. | Pass negative |
| Live update replacement | Replacing the installed app path with a same-Team/same-identifier V2 while V1 remained live made recovery unresolved. Restoring exact V1 bytes allowed reap. | Pass fail-closed; product update policy still open |
| Identity-helper failure | Making the helper temporarily unexecutable caused recovery to remain unresolved and left the exact runner live. Restoring the helper allowed exact recovery. | Pass negative |
| launchd default behavior | With `AbandonProcessGroup=false`, killing the Supervisor removed the runner rather than reparenting it. Recovery accepted absence only after the enrolled record and installed bytes matched and `kill(pid,0)` returned `ESRCH`; it retained `gone-exact-process-absent`. | Pass negative; setting is security-critical |
| Cleanup | Six terminal records were copied to ignored evidence before marker-validated removal of the two installed apps, exact LaunchAgent plist, and Supervisor store. No active record remained. | Pass |

Six live attempts were exactly reaped after Supervisor restart: three repetition cases, one
corrupt-record refusal/restore, one update-replacement refusal/restore, and one identity-helper
failure/restore. A seventh attempt reproduced launchd-owned child removal when orphan preservation
was disabled.

## Distribution evidence and external state

The exact zip was uploaded to Apple's notary service as submission
`1a67daee-ec4e-4572-ad9a-1a1fa3f63bcf` at `2026-07-31T21:02:52.418Z`. Multiple bounded queries
through approximately 21:21Z returned `In Progress`. The wait client was then interrupted; Apple
continues processing the server-side submission.

Because no accepted result existed, the app was not stapled. Same-machine `spctl` rejected it with
`source=Unnotarized Developer ID` (status 3), and `syspolicy_check distribution` reported a missing
notary ticket (status 70). The lifecycle harness continued only under its explicit
`CAPSULE_ALLOW_UNNOTARIZED=1` development switch and required exactly that negative source.

Therefore this run provides Developer ID **signing** and same-machine installed execution evidence,
not notarization, stapling, Gatekeeper acceptance, quarantine/translocation, first-launch, or
clean-machine distribution evidence. No Developer ID Installer identity was available, so a signed
flat `.pkg` was not attempted; zip/app distribution does not require that identity.

The submitted zip contains only the runner app. It excludes the separately installed Supervisor,
identity helper, LaunchAgent, and installation/update mechanism, so even a later Accepted result
would cover only the runner app—not the tested installed topology. The original upload archive also
cannot contain a future stapled ticket; the retained script now creates and hashes a distinct
post-staple archive after acceptance.

## Observation versus inference

Observed on this exact host:

- the signed installed sandboxed runner read its own sealed bundle root and the outside path
  failed;
- `AbandonProcessGroup=true` allowed the six tested runners to survive Supervisor `SIGKILL`,
  reparent to PID 1, and be exactly reaped after explicit LaunchAgent kickstart;
- disabling the property caused the tested child to disappear with the Supervisor job;
- exact record or installed-byte mismatch withheld cleanup authority;
- record persistence failure withheld the start byte; and
- corrupt root mount failure was not reflected in the runner exit code.

Inferred, not proven:

- because this libkrun profile contains one VM in one VMM process and the start protocol permits no
  unrecorded runner, an enrolled active record plus unchanged installed bytes and `ESRCH` for its
  exact PID can support an `exact-process-absent` terminal lifecycle observation. This still does
  not prove guest success or kernel/hypervisor integrity;
- the signed bundle resource is a promising narrow runtime-root read shape. Mode 0444 and the code
  resource seal are not same-user immutability, and mutable attempt disks cannot be generalized
  from it; and
- repeated manual `kickstart` supports restart recovery mechanics but does not prove login-time,
  automatic crash-loop, sleep, or reboot behavior.

## Limitations, blockers, and residual risk

- **Notarization is pending.** Stapling, accepted same-machine Gatekeeper assessment, offline ticket
  behavior, and clean-machine launch remain unobserved.
- The notary upload covers only the runner app, not a complete install payload. Packaging and
  notarization of the Supervisor/helper/LaunchAgent/install mechanism remain open even if Apple
  accepts the pending runner submission.
- **Corrupt-disk terminal integrity failed.** Host runner exit 0 cannot mean the guest booted or
  completed. A trusted boot/ready/completion protocol and independent transcript are mandatory.
- `AbandonProcessGroup` is security-critical. It deliberately permits an orphaned VMM; every
  Supervisor start must reconcile durable active state before accepting new execution.
- The harness passes expected identity through a same-user-writable LaunchAgent plist and stores
  unauthenticated JSON. This proves lifecycle mechanics, not the product storage/epoch authority
  boundary. Enrolled profile identity and authenticated/durable Supervisor state remain required.
- The nonblocking file lock excludes a second cooperating Supervisor instance, but an arbitrary
  same-user process is not forced to honor it and can still attack ordinary state paths. It is a
  lifecycle serialization result, not an authorization boundary.
- The runner accepts direct root/executable/argv and a no-control-FD test mode; any same-user caller
  could also construct the one-byte pipe. This prototype is not a Supervisor-only launch surface
  and must not be imported into product code. A sealed authenticated launch descriptor and
  OS-enforced caller/launcher binding remain mandatory.
- The installed app and root live under the user's home. Mode 0444 and the bundle resource seal do
  not deny a compromised unsandboxed same-user daemon from changing those paths, and libkrun opens
  the disk by path. The spike did not prove pre-open digest enforcement or eliminate substitution
  between validation and open. Do not treat “component-owned” here as a proven storage authority
  boundary.
- The test used explicit `launchctl kickstart`, not a production restart/backoff policy or
  `RunAtLoad` login recovery. A crash loop could become resource amplification without fencing.
- PID/start/code/path validation still has a validate-then-signal race because macOS supplies no
  pidfd-equivalent in this prototype. Immediate revalidation and post-signal absence narrow but do
  not eliminate it.
- The update case restored historical bytes before reap. Product updates must fence new execution
  and drain/reconcile old attempts before replacement, or retain authenticated historical cleanup
  authority without accepting old code for new execution.
- Real ENOSPC, APFS/full-volume pressure, memory pressure, forced-kill failure, locked storage,
  corrupt/partial terminal records, and repeated launchd restart storms remain untested. Deliberate
  host pressure was not induced in a shared user session.
- Sleep/wake and logout/login were prepared in `MANUAL_TESTS.md` but not run. Current `caffeinate`
  assertions would make sleep evidence ambiguous. No script slept, logged out, or rebooted the
  host.
- The recovery record does not bind boot or audit-session identity. Its exact-PID `ESRCH`
  terminalization was tested only within one unchanged boot/session and must be fenced, not reused,
  for the prepared logout/login case.
- No clean machine, quarantine transfer channel, MDM endpoint, second user/audit session, fast-user
  switch, or minimum supported macOS host was available.
- The guest attachment was read-only; host-side same-user immutability was not proven. Writable
  scratch/output, quota, post-stop extraction, console
  bounds, timeouts, malicious guests, and the complete shared corpus belong to other tracks.
- App Sandbox limits the runner but does not prove libkrun, libkrunfw, Linux, Hypervisor.framework,
  or the guest launcher free of vulnerabilities.
- libkrunfw/kernel source publication, notices, SBOM, provenance, advisory response, update, and
  rollback obligations remain open regardless of notarization.

## Decision consequence

**Conditional pass, narrowly.** An App-Sandboxed installed runner can read a sealed bundle root
without a temporary exception, and exact installed Supervisor-restart recovery is feasible on this
machine when the launchd job explicitly preserves orphan processes. The result does not prove
same-user root immutability and closes neither distribution nor backend terminal-integrity gates.

The backend contract may rely on one VMM process per attempt, record-before-start, exact live
identity, and fail-closed mismatch handling. It must not freeze success semantics, claim installed
distribution readiness, or generalize the bundle-root result to writable attempt storage.

Recommended later integration changes (not made by this track):

1. **ADR-0022:** require the installed launch topology and exact `AbandonProcessGroup` (or an
   equally evidenced mechanism) in the profile; bind the launchd plist digest, app/runner/library/
   root identities, record-before-start transcript, and exact absence/reap classification. Add the
   corrupt-disk exit-0 counterexample and prohibit using runner exit alone as success. Do not call
   a user-home bundle immutable without a proven same-user write/substitution control. Require a
   sealed Supervisor-only descriptor/caller mechanism and complete-payload distribution; explicitly
   exclude this runner's direct/no-control development modes.
2. **Evidence matrices:** mark bundle-owned runner read access and exact restart recovery as
   exact-host observed/development evidence; keep same-user storage protection proposed; mark
   notarization/stapling/Gatekeeper/clean-machine,
   terminal guest completion, pressure, sleep, logout, and reboot incomplete. Record the outside
   disk denial and update/record mismatch negatives separately.
3. **Backend contract freeze:** freeze neither terminal-success nor writable-disk semantics. Permit
   a development capability report to name the bundle-resource root identity, one runner/VM, exact process tuple,
   launchd orphan policy, and `unresolved` mismatch state. Require update fencing and reconciliation
   before enrolled bytes move. Do not freeze the real launch API, storage authority, or installed
   packaging shape from this cooperating-process harness.
4. **Next fake-backend/registered-plan slice:** proceed with backend-independent exact plan
   registration, one-use grant consumption, durable attempt-before-side-effect, and
   `cleanup-required`/`unresolved`/terminal states. Model the installed runner identities and
   launch-profile digest as sealed backend inputs; add fake cases for record-write failure, corrupt
   record, historical-version replacement, exact absence, and approval burn. Do not connect the
   daemon to libkrun or emit ordinary success from this experimental runner.

## Retained evidence and reproduction

Tracked reproduction artifacts are this directory's sources and scripts. Ignored machine-local
evidence is retained at:

- `.runs/last-run.log`: complete case summary and same-machine Gatekeeper negative;
- `.runs/evidence/state/`: seven latest terminal JSON records with exact identities and runner/root
  digests (`state-prior-runs/` retains earlier superseded local runs);
- `.runs/restart-loop-*.reparented.identity`, `.runs/corrupt-record.reparented.identity`, and
  `.runs/update-replacement.reparented.identity`: live PPID/start/code/path observations;
- `.runs/evidence/`: installed hashes, signatures, entitlements, final launchd/plist state, host
  version, and power assertions;
- `.runs/component-storage-positive.log`, `.runs/outside-storage-negative.log`, and
  `.runs/corrupt-disk-negative.log`: storage and corrupt-root observations; and
- `.build/CapsuleKrunInstalledRecovery.zip`: exact pending-notary archive.

Primary commands:

```sh
./experiments/gate-c-libkrun-hvf/build-guest-probe.sh
./experiments/gate-c-libkrun-hvf/prepare-root-disk.sh
CAPSULE_SIGNING_IDENTITY='Developer ID Application: Dylan Steele (3DDR84M4JS)' \
  ./experiments/gate-c-libkrun-installed-recovery/build.sh
./experiments/gate-c-libkrun-installed-recovery/audit-build.sh
CAPSULE_NOTARY_PROFILE=capsule-notary \
  ./experiments/gate-c-libkrun-installed-recovery/notarize.sh
CAPSULE_ALLOW_UNNOTARIZED=1 \
  ./experiments/gate-c-libkrun-installed-recovery/run.sh
```

The notarization command has not yet completed successfully; do not rerun it blindly while the
submission remains pending. Query the recorded submission first, then staple the unchanged app if
Apple accepts it.

## Verification completed

The following completed successfully on the working tree:

```text
build.sh (C -Wall/-Wextra/-Werror, nested signing) PASS
audit-build.sh                                PASS
run.sh retained lifecycle harness             PASS
shellcheck -x experiment scripts              PASS
sh -n experiment scripts                      PASS
go test ./... (experiment Supervisor module)  PASS
pnpm install (Node 22.22.1 / pnpm 10.28.2)    PASS
pnpm check                                    PASS
pnpm lint                                     PASS
pnpm test                                     PASS
pnpm verify:schemas                           PASS
go test ./... (repository)                    PASS
go vet ./...                                  PASS
go build ./...                                PASS
git diff --check -- experiment directory      PASS
```

The resumable notarization command returned its deliberate status 75 with
`notarization=PENDING`; that is external state, not a passing distribution check.
