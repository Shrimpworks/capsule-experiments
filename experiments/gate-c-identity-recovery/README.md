# Gate C identity and recovery spike

Status: development-only disposable research. Product packages must not import this code.

This is the final focused follow-up to the direct Apple Containerization Gate C spike. It tests
whether the public Containerization 0.33.3 and macOS Virtualization surfaces provide either:

- a supported durable identity that maps one Capsule attempt to its live VM/helper across a
  Supervisor restart; or
- authoritative enumeration/reconnection/force-reap after the controller dies.

It also retains a fail-closed controller-loss harness for multiple concurrent VMs, an
unrelated-helper negative control, crashes at lifecycle boundaries, and a bounded
management-vsock reachability probe. The shared-host run correctly refused ambiguous helper
attribution; the decision and exact observations are in [`RESULTS.md`](RESULTS.md).

## Safety

- All mutable state is under a fresh `/private/tmp/capsule-gate-c-identity-*` directory carrying
  distinct run-root and state-root markers. Cleanup refuses any other path and refuses to remove
  the run root while its state root still exists.
- The guest image and init image are digest/version pinned. Guests have no network interface or
  Unix relay, run as uid/gid 1000, use a read-only root, empty capabilities, and
  `no_new_privileges`.
- The guest vsock probe attempts TCP-like connection setup only to port 1024 on bounded CIDs 0-16.
  It sends no management payload.
- The live runner records the baseline set of Virtualization helpers and kills only controller PIDs
  it created whose current process command still matches the probe invocation. Its
  experiment-owned control VM is the unrelated-helper negative control. The runner never signals
  a helper PID; pre-existing helpers may independently exit while the suite runs.
- If a helper survives controller death, the runner fails without guessing which helper to kill.

Owner: Capsule architecture / Gate C backend owner.

Removal/replacement condition: remove after the backend ADR either adopts a supported lifecycle
identity/recovery mechanism with retained adversarial evidence or pivots Capsule's macOS execution
backend. Retain the neutral crash fixture and decision evidence as appropriate.

## Reproduce

Build from the exact upstream tag/commit and apply local ad-hoc signing:

```sh
./experiments/gate-c-identity-recovery/build-probe.sh
```

The build script clones `apple/containerization` 0.33.3 only when the exact local source is absent,
audits the public API shape, builds the package, and signs only with the local virtualization
entitlement.

Run non-VM identity and source checks:

```sh
CAPSULE_CONTAINERIZATION_SOURCE=/private/tmp/capsule-gate-c-identity-containerization-0.33.3 \
  swift build --package-path experiments/gate-c-identity-recovery \
  --product identity-recovery-probe
./experiments/gate-c-identity-recovery/.build/debug/identity-recovery-probe identity
./experiments/gate-c-identity-recovery/audit-public-surfaces.sh \
  /private/tmp/capsule-gate-c-identity-containerization-0.33.3
```

The live suite inspects process state and deliberately sends `SIGKILL` to its own controllers. Run
it only in a disposable development session:

```sh
./experiments/gate-c-identity-recovery/run-live-tests.sh
```

The optional second argument overrides the compatible kernel path. The runner preserves unrelated
Virtualization helpers and removes only its marker-protected state after every unambiguously
observed experiment-owned helper has disappeared. Concurrent foreign helper churn is an expected
fail-closed result, not permission to guess or signal a helper.
