# Gate F durable-state fault-injection follow-up

Status: development-only disposable research. Product packages must not import it.

Owner: Capsule maintainers, Gate F.

Removal/replacement condition: replace this Python model only after the real Supervisor store,
installer, Broker delivery path, and selected backend preserve the same fail-closed outcomes under
equivalent process-crash, storage-fault, restore, and eventual power-cut testing. Retain the
fixtures and `RESULTS.md` as design evidence.

## Question

Can the proposed Gate F ordering survive more realistic local-storage failures without reviving an
approval, enabling a mixed installation, forgetting a backend cleanup obligation, or treating a
partially observed external effect as ordinary success?

This follow-up starts where `../gate-f-trust-transition/` stopped. It uses real independent
processes and temporary files but remains an executable model, not Capsule product code.

## What the harness exercises

`durability.py` implements a small Supervisor-like SQLite authority store using:

- SQLite WAL mode, `synchronous=FULL`, `fullfsync=ON`, `checkpoint_fullfsync=ON`, foreign keys,
  and disabled automatic checkpointing;
- a single authoritative state row with sequence, epoch, transition fence, clock state, and
  execution-enable bit;
- durable grant consumption, attempt records, external-effect intents, and cleanup obligations;
- a separate checkpoint file written as `temporary write → fsync/F_FULLFSYNC → rename → directory
  fsync` on macOS;
- exact checkpoint comparison before execution-ready state;
- enumerable fake installer and backend effects stored outside the authority database.

`worker.py` is always launched as another process for crash and contention cases. The tests publish
the worker's exact PID at a durable marker and send that PID `SIGKILL`; they do not kill by name or
touch unrelated processes. Every database, marker, copied restore, and external effect lives under
a fresh `TemporaryDirectory`.

The retained cases cover:

- writer-lock contention and ten two-process compare-and-swap races;
- SQLite `max_page_count` disk-full simulation before commit and after an external effect;
- process death with committed WAL, before/after a checkpoint, and an artificially truncated WAL;
- truncated database and logically altered state;
- old-database/new-checkpoint and new-database/old-checkpoint partial restores;
- a coherent old database/checkpoint restore;
- injected wall-clock rollback and unavailable time;
- file fsync/rename/directory-fsync process-crash boundaries;
- process crashes around fake installer intent/effect/observation and backend
  intent/create/observation/cleanup.

## Run

From the repository root:

```sh
./experiments/gate-f-durability/run.sh
```

No third-party Python dependency is required. The harness uses only the standard library and
deletes temporary state when each test completes.

## Interpretation boundary

Passing these tests is evidence about model ordering, SQLite recovery after process death, and
ordinary filesystem visibility on the tested APFS host. It does **not** establish:

- survival of sudden power loss, torn writes, controller-cache loss, or device failure;
- real APFS snapshot, Time Machine, installer/package-manager, Keychain, or Secure Enclave
  semantics;
- durability of a write merely because Python returned from `fsync`;
- an independently protected or cryptographically authorized checkpoint;
- authoritative enumeration for Apple Container or any production backend;
- resistance to a privileged administrator who coherently restores every local state file;
- safe use of wall time as an anti-rollback source.

`PRAGMA max_page_count` is a deterministic SQLite capacity-limit simulation, not a real APFS
`ENOSPC` event. WAL truncation is deliberate damage to a disposable copy, not a claim about the
probability or exact shape of real corruption. Killing before and after checkpoint boundaries does
not prove the behavior of a kill in the middle of SQLite's internal checkpoint routine.

See `RESULTS.md` for observed results and product store requirements inferred from them.
