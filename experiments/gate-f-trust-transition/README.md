# Gate F trust-transition durability spike

Status: development-only disposable research model. Product packages must not import it.

Owner: Capsule maintainers, Gate F.

Removal/replacement condition: remove the Python prototype after a production-language update and
recovery implementation preserves these invariants and passes an equivalent retained crash,
power-loss, component-substitution, store-restore, replay, and repair corpus on the selected macOS
storage/install mechanism. Keep `RESULTS.md` and translated fixtures as durable evidence.

## Purpose

This executable specification and child-process harness test whether the intended `PreparedUpdate` →
`pending-verification` → epoch finalization → repair protocol can fail closed across durable writes
and non-transactional effects. It models protocol logic only. It does not test signatures,
Keychain/Secure Enclave access, XPC peer requirements, real installers, filesystem flush behavior,
or an isolation backend.

## Model

`model.py` uses two independent SQLite databases:

- `control.sqlite` represents Supervisor-owned installation, epoch, transition, grant, attempt,
  cleanup, component-acceptance, and event records.
- `external.sqlite` represents independently observed component installations, backend guests,
  trust/profile state, and completed external releases.

The split is intentional: no SQLite transaction is allowed to pretend a component swap, guest
creation, or content release committed atomically with Supervisor state.

The successful path is:

```text
stable
  → preparing-update (attempt fence + unused-grant invalidation)
  → prepared
  → swapping
  → pending-verification
  → finalizing-epoch
  → awaiting-component-acceptance
  → stable
```

On restart, every incomplete trust transition becomes `repair-required`. Re-enabling attempts is a
separate final transaction after all enrolled component roles accept the exact epoch digest from
their current process incarnation.

`crash_worker.py` and `test_process_crash.py` additionally start a real Python child process,
pause it immediately after a named durable SQLite/external-effect checkpoint, send `SIGKILL` to the
exact observed PID, and open both databases in a fresh process context for reconciliation. This
tests operating-system process death and WAL recovery. It still does not simulate sudden power
loss, torn storage, or APFS snapshot rollback.

## Run

From the repository root:

```sh
python3 -m unittest discover -s experiments/gate-f-trust-transition -p 'test_*.py' -v
```

No third-party Python package is required. Tests use temporary directories and retain no live
database state.

See `RESULTS.md` for hypothesis, environment, observations, decision, proposed document changes,
and limitations.
