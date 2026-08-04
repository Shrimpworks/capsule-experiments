# Gate F durable-state fault-injection results

Date: 2026-07-31

Decision: **conditional pass for process/storage ordering; power-loss and product-store behavior
remain unproven**.

The follow-up found no reason to abandon the Gate F state model, but it made several product-store
requirements non-optional. A single serialized SQLite authority writer, a durable intent before
every non-transactional effect, fail-closed database/checkpoint comparison, explicit clock failure,
and independently enumerable or outcome-unknown external effects all need to be part of the real
implementation. A coherent restore of every local file is still undetectable without an
independently protected checkpoint or external witness.

## Environment

- Hardware/architecture: Apple arm64 Mac. Serial, hardware UUID, and provisioning identifiers were
  not retained.
- OS: macOS 26.5.2 build 25F84; Darwin 25.5.0.
- Data volume observed by `mount`: APFS, local, journaled.
- Python: CPython 3.14.6.
- Python-linked SQLite: 3.53.3.
- SQLite settings in the authority/WAL fixtures: WAL, `synchronous=FULL`, `fullfsync=ON`,
  `checkpoint_fullfsync=ON`, automatic checkpointing disabled.
- Atomic-file fixture: same-directory temporary file, ordinary `fsync`, Darwin `F_FULLFSYNC=51`,
  `rename`, then directory `fsync`.
- All mutable test data: fresh standard-library `TemporaryDirectory` locations on the host data
  volume.

The Darwin 26.5 SDK defines `F_FULLFSYNC` as “fsync + ask the drive to flush to the media.” The
test observed that the request and directory fsync returned successfully. That observation does
not prove survival of an actual power cut or storage-controller failure.

## Reproduction

Run from the repository root:

```sh
./experiments/gate-f-durability/run.sh
```

Observed result on the environment above:

```text
Ran 17 tests
OK
```

The 17 test methods include:

- 18 exact-PID `SIGKILL` executions at retained durability/effect checkpoints;
- 10 repetitions of two independent processes racing the same epoch compare-and-swap;
- independent writer, fake installer-effect, fake backend-effect, and cleanup processes;
- disposable database/WAL copies subjected to bounded capacity, truncation, mutation, and restore
  faults.

## Observed evidence

| Area | Observed result | Security consequence |
| --- | --- | --- |
| Concurrent writer lock | A second `BEGIN IMMEDIATE` writer with zero busy timeout received `database is locked`; it made no partial change. Killing the exact lock holder discarded its uncommitted write. | Treat busy/locked as a refusal, never as permission to continue from in-memory state. One process owns authoritative mutation. |
| Concurrent epoch CAS | In all 10 two-process races, exactly one process advanced expected epoch 1 to 2; the other observed a mismatch. | Every security transition needs an expected sequence/digest predicate in addition to SQLite writer serialization. |
| Capacity exhaustion before commit | `PRAGMA max_page_count` caused `database or disk is full`; the transaction containing an execution fence and large write rolled back as a unit. | No external side effect may begin until its required state transaction has actually committed. `SQLITE_FULL` is terminal for that operation. |
| Capacity exhaustion after an effect | A backend-create intent and cleanup obligation were committed first. A later oversized observation transaction failed full after the fake guest appeared; recovery still retained the intent and cleanup requirement and could reconcile the guest. | Do not depend on the post-effect handle write as the only cleanup record. Reserve intent/identity before create and preserve it until authoritative destruction. |
| WAL recovery after process death | A `synchronous=FULL` committed execution fence remained visible after exact-PID `SIGKILL` while the WAL was live. The same fenced state recovered when killed immediately before and after an explicit truncate checkpoint boundary. | WAL supports the intended process-crash ordering on this host, but this is not storage-power-loss evidence. |
| Artificial WAL damage | Truncating a copied WAL to its header could hide the transaction containing a previously committed fence or cause corruption. The separately retained newer checkpoint disagreed, so the pair could not be accepted as ready. | A database commit is not durable security evidence if its WAL can be lost/corrupted independently. Verify a separately protected latest checkpoint and fail closed on disagreement. |
| Database corruption/tamper | A half-truncated database was classified corrupt. A logically changed epoch with an unchanged checkpoint produced checkpoint mismatch. Neither became execution-ready. | Open/integrity/checkpoint failures require quarantine or repair, never automatic empty-store initialization. |
| Partial restore | Restoring the old database under the new checkpoint, or the old checkpoint beside the new database, produced mismatch and refusal. | Bind state sequence, epoch digest, transition, execution fence, and freshness state in the independent checkpoint. |
| Coherent restore | Restoring both the old database and its matching old checkpoint was accepted as a valid old world. | The local file pair detects partial restore only. Strong coherent-rollback detection needs a Keychain/platform anchor or external witness with suitable non-rollback semantics. |
| Wall-clock rollback/failure | An injected lower wall time and an unavailable time source each persisted an untrusted clock state and disabled attempts. | Expiry/freshness must not be extended from a rolled-back or missing wall clock. Define a trusted-time policy and explicit degraded/repair state. |
| Atomic file replacement | After killing at temporary-file fsync, the destination was wholly old. After killing at rename or directory fsync, it was wholly new. No partial destination bytes were observed. | Use same-volume temporary files, verify bytes, sync the file, rename, sync the directory, and treat leftover temporaries or cross-store mismatch as recovery input. |
| Database/checkpoint boundary | Killing after the database fence commit but before checkpoint replacement caused mismatch; killing after checkpoint rename produced a matching but fenced pair. None of the four commit/replace checkpoints became ready. | A database and sidecar cannot be described as one atomic commit. The mismatch window is acceptable only if startup refuses closed and repair can authenticate the intended state. |
| Fake installer effect | At intent-only crash the installer outcome remained unknown. When the exact external record existed, restart reconciled it by its idempotency key/digest. Every case remained `repair-required` with attempts disabled. | Installer absence is not generally proof of no effect. Installation must expose an exact query/idempotency mechanism or retain `effect-outcome-unknown`. |
| Fake backend effect | The grant remained consumed and the cleanup obligation remained required at intent-only, externally visible, and observation-durable crashes. An explicit independent delete was required before recording destruction. | Missing handle/response never revives a grant or proves guest absence. Backend identity/enumeration is still the decisive Gate C blocker. |

## Design conclusion

The Gate F protocol is viable at the model/process level if the product store adopts all of the
following semantics:

1. **One authoritative writer.** Only the Supervisor mutates grant, attempt, execution-fence,
   cleanup, and epoch state. Other components communicate through authenticated idempotent
   messages. `BUSY`, `LOCKED`, `FULL`, `IOERR`, `CORRUPT`, and failed commit are explicit refusal
   outcomes.
2. **Compare-and-swap every transition.** A transaction binds the expected state sequence, active
   epoch/digest, transition ID, and execution-enable state. Writer serialization alone does not
   prevent a stale command from applying after another valid command.
3. **Durable intent before effect.** Grant consumption/attempt creation and a backend cleanup intent
   commit before guest creation. Installer, release, backend create/destroy, and migration effects
   each use a stable idempotency/reconciliation key.
4. **The pre-effect record is sufficient for recovery.** A lost post-effect response, handle write,
   or observation event must not erase cleanup. If the external system cannot prove absence, the
   state remains `outcome-unknown`/`cleanup-required`.
5. **No automatic store recreation.** Missing, corrupt, truncated, schema-incompatible, or
   checkpoint-mismatched authoritative state enters repair/quarantine. Reinstall cannot reset
   grants, attempts, cleanup, or transition history.
6. **Explicit WAL and checkpoint policy.** Configure and verify the selected SQLite durability
   settings; test the exact SQLite/VFS shipped by the product. Backups and migration tooling must
   use a quiesced/SQLite-supported snapshot rather than copying only the main database while WAL is
   live.
7. **Independently protected checkpoint.** Persist at least state sequence, epoch number/digest,
   transition ID, attempts-enabled bit, and clock/freshness status under an authority a stale or
   restored database cannot rewrite. A plain self-hashed sidecar is only an accidental-damage and
   partial-restore detector.
8. **Fail-closed clock policy.** Wall time is not an anti-rollback anchor. Backward/unavailable time
   blocks freshness-sensitive approval, trust, and update decisions until an authorized recovery
   establishes a valid time/checkpoint.
9. **Defined sync ordering.** Critical standalone files use same-directory temporary creation with
   restrictive mode, bounded/verified contents, file sync, atomic rename, and directory sync.
   macOS production code should explicitly decide and test `F_FULLFSYNC`/barrier behavior on every
   supported filesystem and OS.
10. **Capacity and recovery budget.** Bound store growth, checkpoint deliberately, surface disk
    pressure before a ceremony, and preserve enough already-durable information to reconcile an
    effect even when its observation cannot be appended. Preallocation/reserve strategy requires a
    separate product measurement; it must not permit destructive cleanup without exact identity.

These are implementation requirements inferred from a model. They are not yet accepted protocol
or ADR changes because this isolated spike was instructed not to edit global project documents.

## Counterevidence and limitations

- The coherent-restore test intentionally passes. A database plus ordinary sidecar on the same
  rollback domain cannot provide monotonicity.
- The checkpoint digest is an unkeyed SHA-256 consistency marker. It provides no authorization and
  must not be treated as a product trust anchor.
- `PRAGMA max_page_count` deterministically exercises SQLite's `SQLITE_FULL` handling but is not an
  APFS volume-full, quota, inode exhaustion, permission change, or real I/O-error test.
- The tests kill processes, not power. They do not exercise torn sectors, controller caches,
  device reordering, sudden battery loss, or a kill in the middle of SQLite's internal checkpoint
  implementation.
- Successful `fsync`, `F_FULLFSYNC`, and directory-fsync returns are observations, not proof of
  persistent media state after power failure.
- Restore cases use quiescent file copies on an APFS data volume. They are not APFS snapshots,
  Time Machine restores, OS reinstall, FileVault transition, or backup-agent concurrency tests.
- The fake installer and backend expose exact local JSON records. Real platform APIs may provide
  weaker enumeration, idempotency, or identity. Their behavior must be tested rather than inferred.
- No real Supervisor process, app container, Keychain item, Secure Enclave key, XPC peer,
  installation-root signature, package installer, Apple Container guest, or Broker delivery effect
  participates.
- The injected clock is model input. The harness does not establish a trusted macOS clock source,
  cross-boot monotonic time, or acceptable offline-freshness UX.
- SQLite `quick_check` and the test schema are small. Product startup latency, bounded checking,
  migrations, WAL growth, checkpoint starvation, file protection, backup exclusion, and recovery
  UX remain unmeasured.

## Next smallest tests

1. Port this state layout and exact error taxonomy to the real Supervisor store process, retaining
   independent writer/fake-effect subprocesses.
2. Run a disposable APFS disk-image campaign with real capacity exhaustion, quota/permission/I/O
   failure, SQLite backup/restore, live WAL copies, and app-container protection classes.
3. Bind the latest checkpoint to the candidate narrow Keychain/platform mechanism, then repeat
   partial, coherent, per-release-group, repair, and key-loss restores.
4. Replace fake installer records with a signed package/staged-release prototype that supports an
   exact post-crash query or records `effect-outcome-unknown`.
5. Run the same backend-intent corpus only after the selected backend exposes a stable
   Supervisor-generated reconciliation identity and authoritative enumerate/destroy behavior.
6. Execute a separate VM-driven sudden-power-loss campaign. Only that campaign can support claims
   about power-cut durability of the exact filesystem, SQLite build, and installer ordering.
