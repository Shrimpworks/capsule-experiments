# Coordinated sleep/wake and logout/login cases

These cases are prepared but deliberately not automated. They operate on a live development-only
VM and must be coordinated with the logged-in user. They must not be described as complete until
the exact before/after files and cleanup result are retained. Reboot is not authorized by this
experiment.

## Preconditions

1. Re-run `build.sh`, `audit-build.sh`, `notarize.sh`, and `run.sh` far enough to install the exact
   notarized app and LaunchAgent. For a coordinated run, adapt the harness to stop after
   `start_and_reparent`; do not weaken its marker/path checks or directly signal an unverified PID.
2. Confirm `active.json` is durable and the recorded runner is reparented to PID 1.
3. Run `collect-manual-state.sh ACTIVE_RECORD IDENTITY_HELPER EVIDENCE_DIRECTORY` immediately
   before and after the transition.
4. Record the exact `kern.boottime`, console user/audit session, app/runner hashes, active record,
   live identity, LaunchAgent state, power source, and power assertions.

## Sleep/wake

- Remove or explicitly account for any `caffeinate`/power assertion that prevents sleep. Do not
  kill another user's assertion without their approval.
- The user initiates ordinary sleep through the UI and wakes the same machine.
- After wake, collect state before any recovery action. Require the exact PID/start time, UID/GID,
  identifier, Team ID, CDHash, executable location, and installed bytes to match the durable record.
- Restart the Supervisor through its installed LaunchAgent and require one exact terminal record.
- If the runner is absent or any tuple field changed, classify the attempt `unresolved`; absence is
  not teardown evidence.

## Logout/login

- The user explicitly logs out and back into the same account; the script must never invoke logout.
- Expect the GUI launchd domain and audit session to change. Preserve the pre-logout active record
  in Supervisor-owned storage and collect the post-login boot/session state before bootstrap.
- Bootstrap the exact LaunchAgent and observe whether the runner survived. If it is absent, keep
  the attempt unresolved until a documented/session-lifecycle mechanism supplies destruction
  evidence. If it survives, require the complete exact tuple before signaling it.
- The current prototype Supervisor does not bind boot/audit-session identity and would terminalize
  an enrolled record whose PID is `ESRCH`. Do **not** use that behavior as logout/login evidence;
  the coordinated version must fence automatic recovery on a session change before this case can
  be executed defensibly.
- Exercise fast-user switching and a second simultaneous login only on a dedicated test account;
  neither is implied by a same-account logout/login pass.

## Clean-machine distribution

Copy the exact notarized archive to a separate, unprimed supported Mac through a channel that sets
quarantine. Record the archive SHA-256, quarantine xattr, offline stapler validation, online/offline
Gatekeeper assessment, first launch, container/bundle state, LaunchAgent registration, one recovery
loop, and uninstall. MDM deployment additionally requires the organization's signing/notary/PPPC
policy and an uninstall/repair owner. Same-machine `spctl` output is not a substitute.
