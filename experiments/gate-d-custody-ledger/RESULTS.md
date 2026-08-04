# Gate D multi-process custody-ledger results

Date: 2026-07-31

Decision: **strong conditional pass; Gate D strengthened**.

## Revision and environment

| Item | Observed value |
| --- | --- |
| Repository revision | `1f9f55bf2c7cc25b936dc9e2ceb343113f398c3c` plus the uncommitted isolated experiment |
| Branch | `codex/license-free-spikes` |
| Host | macOS 26.5.2 (25F84), Darwin 25.5.0, arm64 |
| Python | CPython 3.14.6 at `/opt/homebrew/opt/python@3.14/bin/python3.14` |
| SQLite used by Python | 3.53.3 |
| Database mode | rollback journal `delete`, `synchronous=FULL`, `fullfsync=ON` |
| Privilege | ordinary user; no root/helper |
| IPC | Unix-domain stream plus `SCM_RIGHTS`; not authenticated XPC |
| Backend | none; host-only transfer/staging experiment |

The surrounding worktree contained unrelated work owned by the parent task. This spike changed
only `experiments/gate-d-custody-ledger/`.

## Commands

Primary run:

```sh
CAPSULE_GATE_D_REPETITIONS=20 \
  ./experiments/gate-d-custody-ledger/verify.sh
```

The runner compiles every Python source in memory, executes all 17 top-level tests, then repeats
the multi-process input/output race, SQLite before/after-commit crash, and Broker/Supervisor output
crash bundle 20 times.

## Observed evidence

| Case | Result |
| --- | --- |
| Daemon-visible reference | Pass: exactly opaque content ID, digest, length, and logical slot; no source/store path, handle, endpoint, or descriptor |
| Server-derived role | Pass: daemon-configured service rejected before transition; request cannot provide or override role |
| Complete binding | Pass: wrong installation/epoch/registration/attempt/direction/operation failed before consumption |
| Expiry and revocation | Pass: issued handles became replay tombstones and could not redeem |
| Concurrent input redemption | Pass: exactly 1 of 20 independent SQLite processes consumed; 19 observed already-consumed |
| Concurrent output redemption | Pass: exactly 1 of 20 independent SQLite processes consumed; 19 observed already-consumed |
| SQLite crash before commit | Pass: rollback journal restored `issued`; no descriptor had been created |
| SQLite crash after commit | Pass: `consumed` survived process exit and integrity check; retry denied |
| Real input transfer | Pass: separate Supervisor process received exact bytes on a read-only descriptor without a store path |
| Broker crash before input send | Pass: durable consumed state survived; no retry |
| Supervisor crash after input receive | Pass: descriptor closure did not restore authority |
| Input store substitution | Pass: pre-send digest/size verification failed and quarantined content; handle remained consumed |
| Real output transfer | Pass: separate Supervisor process received a write-only pipe; Broker retained the read end and object path |
| Output byte bound | Pass: byte `maxBytes + 1` quarantined the handle and removed partial content |
| Early/daemon release | Pass: uncommitted output and daemon-role release both denied |
| Exact terminal commit | Pass: Broker reopened and rehashed its object before `consumed -> committed` |
| Duplicate output commit | Pass: exact duplicate returned idempotent; changed digest/size/transcript denied |
| Failed/indeterminate terminal state | Pass: output became quarantined and never releasable |
| Output store substitution | Pass: commit-time rehash detected the change and quarantined object/handle |
| Broker crash after output consume | Pass: restart changed uncommitted output to quarantined |
| Broker crash after object sync/before transfer record | Pass: private partial survived with durable handle attribution; restart quarantined |
| Broker crash after transfer record/before commit | Pass: recorded exact bytes remained unreleased; restart quarantined |
| Supervisor crash after output write | Pass: collected bytes lacked terminal success; restart quarantined |
| Input restart behavior | Pass: restart never reset a consumed input |
| GC before tombstone horizon | Pass: retained handle and content |
| GC with active/indeterminate attempt | Pass: retained tombstone, content, and partial after horizon |
| GC after terminal attempt/horizon | Pass: removed tombstone/partial and two-phase-deleted unreferenced expired content |
| Orphan collection | Pass: removed only old random managed names; retained recent and unknown names |
| Illegal state resurrection | Pass: SQLite trigger rejected terminal/revoked state returning to issued |
| Database integrity | Pass: `PRAGMA integrity_check` returned `ok` after injected process exits |

No test reported a widened or resurrected authority, double winner, released quarantined output, or
unexpected database-integrity failure.

## Interpretation

This evidence resolves the narrow mechanism question the original Gate D spike left open:
`BEGIN IMMEDIATE` plus a constrained rollback-journal ledger can atomically consume one handle
across independent processes, and consume-before-send remains fail-closed across Broker/Supervisor
process death.

Output recovery needs an explicit conservative rule. The safe result was not a resumable pipe or
automatic recommit. Any consumed output without a completed terminal commit becomes quarantined on
Broker restart. That is an availability cost, but it prevents crash recovery from turning
ambiguous bytes into ordinary released content.

GC safety also depends on Supervisor attempt state. Time alone is insufficient: the ledger retained
expired tombstones, private partial files, and referenced content while an attempt was active or
indeterminate, then removed them only after terminal state and the retention horizon.

## Gate consequence

Gate D should remain conditional at the repository level, but its confidence increases
materially. The prior multi-process SQLite/restart residual is now observed rather than merely
specified. The remaining blockers are composition tests:

1. run the same ledger behind mutually authenticated distribution-signed Broker/Supervisor XPC;
2. place the database and object store in the shipping Broker's protected container;
3. import/copy descriptor bytes into the selected backend's attempt-owned storage and perform the
   Supervisor's independent post-stage digest verification;
4. add disk-full, I/O-error, power-loss/APFS-restore, database-corruption, migration, and signed
   cross-store saga fault injection.

Failure of one of those integrations can still force a persistence or transfer redesign. Nothing
here establishes production security or backend isolation.
