# Gate C: installed libkrun lifecycle and recovery

Status: **development-only feasibility spike**. This directory is not product code, authoritative
receipt evidence, a validated backend, or a production-readiness claim.

Owner: Capsule core / native backend track. Remove or replace the prototype after the exact
installed lifecycle is independently reviewed and implemented behind the production Supervisor
adapter, or after a later ADR rejects this backend.

## Bounded question

Can one Developer ID-signed, App-Sandboxed libkrun/HVF runner boot a read-only raw fixture from its
own signed installed app bundle—with no temporary absolute-path exception or app group—and can an
unprivileged per-user LaunchAgent Supervisor recover and reap its exact reparented process across
repeated Supervisor deaths?

The experiment also tests denial of an outside-bundle disk, a corrupt disk, a corrupt durable
identity record, installed-runner replacement while an attempt is live, and record-write failure
before authorization. It prepares but does not automate sleep/wake, logout/login, clean-machine,
MDM, reboot, or destructive pressure cases.

## Topology

```text
~/Applications/CapsuleKrunInstalledRecoverySpike.app
  Contents/MacOS/capsule-krun-runner       signed, sandboxed VMM
  Contents/MacOS/lib/...                   signed libkrun/libkrunfw
  Contents/Resources/root.ext4             sealed, read-only bundle resource

~/Library/Application Support/CapsuleKrunInstalledRecoverySpike
  bin/supervisor                           unprivileged LaunchAgent executable
  bin/process-identity                     Security.framework identity probe
  state/active.json                        fsync + rename + directory-fsync before G
  state/terminal-attempt-*.json            exact-reap evidence
```

The Supervisor launches only sealed paths from its installed plist. The runner waits on a private
inherited control pipe. The Supervisor records PID, start seconds/useconds, UID/GID, executable
path, signing identifier, Team ID, CDHash, and runner SHA-256 durably before writing the single
authorization byte. Recovery compares the complete record against the live process and installed
bytes. Any mismatch is unresolved and receives no signal. The LaunchAgent sets
`AbandonProcessGroup=true`; the retained negative case shows launchd removes the runner with its
Supervisor when this setting is false.

The expected identity currently comes from the generated LaunchAgent plist and the JSON record is
not authenticated. Those are harness inputs, not product authority. A product Supervisor must get
the expected profile from enrolled epoch-bound state and protect its ledger/transcript against
same-user substitution.

The spike runner still accepts direct disk/executable/argv and permits its no-control-FD test mode;
even the one-byte pipe can be created by another same-user caller. Product code must not reuse this
surface. Sole-launch authority needs a sealed, authenticated Supervisor descriptor plus an
OS-enforced caller/launch mechanism; this experiment tests lifecycle after launch, not that
authority boundary.

The root is mode 0444 and sealed by the bundle signature, so a shared app group is unnecessary for
this runner-read case. Those facts do not make a per-user app bundle immutable against another
same-user process: this prototype does not prove daemon write denial or close the path-open race.
A product design still needs exact pre-open digest/identity enforcement in protected storage. It
also does **not** solve mutable per-attempt scratch/output staging; that path needs a separately
justified narrow transfer or group design and adversarial evidence.

## Reproduce

Rebuild the ignored fixture if needed:

```sh
./experiments/gate-c-libkrun-hvf/build-guest-probe.sh
./experiments/gate-c-libkrun-hvf/prepare-root-disk.sh
```

Build and verify with the exact Developer ID identity, then notarize and run:

```sh
CAPSULE_SIGNING_IDENTITY='Developer ID Application: Dylan Steele (3DDR84M4JS)' \
  ./experiments/gate-c-libkrun-installed-recovery/build.sh
./experiments/gate-c-libkrun-installed-recovery/audit-build.sh
CAPSULE_NOTARY_PROFILE=capsule-notary \
  ./experiments/gate-c-libkrun-installed-recovery/notarize.sh
./experiments/gate-c-libkrun-installed-recovery/run.sh
```

If a submission is already pending, resume it without creating a duplicate:

```sh
CAPSULE_NOTARY_PROFILE=capsule-notary \
CAPSULE_NOTARY_SUBMISSION_ID='<submission UUID>' \
  ./experiments/gate-c-libkrun-installed-recovery/notarize.sh
```

The script submits once, retains the submission ID immediately, exits 75 while processing remains
in progress, and staples only an accepted result. It keeps separate upload and post-staple archive
hashes. The archive covers only the runner app; a complete installed distribution must also package
and validate the Supervisor, identity helper, LaunchAgent, and installation/update mechanism.

`run.sh` refuses any pre-existing label or path, uses an exact marker for cleanup, never signals a
process after an identity mismatch, and removes only its own installed app, LaunchAgent, and state
after a complete run. If interrupted, inspect the active record first, restore the exact enrolled
app if an update test was in progress, and invoke `run.sh --cleanup`; unresolved active state is
intentionally retained.

See [MANUAL_TESTS.md](MANUAL_TESTS.md) for explicitly coordinated transitions. No script reboots,
sleeps, or logs out the host.

## Exact upstream inputs

The build reuses and re-audits the retained Gate C pins and patches:

- libkrun `v1.19.4`, commit `728df8125077d0db44265f6e997c72b81b65c015`;
- libkrunfw `v5.5.0`, embedded Linux `6.12.91`;
- the retained `@rpath` firmware and `ro,nosuid,nodev` block-root patches;
- the Alpine 3.22 raw ext4 fixture documented by the parent Gate C experiment.

libkrunfw/kernel binary distribution still requires exact LGPL/GPL source and notices. Notarizing
the app does not satisfy source, SBOM, provenance, advisory, update, or rollback obligations.
