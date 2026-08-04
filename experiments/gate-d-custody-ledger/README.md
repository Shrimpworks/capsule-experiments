# Gate D follow-up: multi-process custody ledger

Status: development-only feasibility spike; **strong conditional pass** on 2026-07-31.

Owner: Capsule Gate D custody-ledger follow-up.

Removal/replacement condition: remove the executable prototype after a reviewed, signed,
App-Sandboxed Broker implementation reproduces these transactions and fault cases through the
shipping Broker/Supervisor XPC protocol and selected backend staging path. Retain the state,
negative, and crash fixtures if they remain useful.

Nothing in this directory is a product component, frozen database or wire schema, security
boundary, or source of authoritative receipt claims. Product packages must not import it.

## Question

The first Gate D experiment established the intended custody state machine with an atomic JSON
file, threads, and descriptor probes. This follow-up asks whether its unresolved persistence claims
hold when:

- independent operating-system processes contend for the same handle;
- one-use transitions are real SQLite transactions rather than in-memory compare-and-swap;
- a Broker or Supervisor exits at ambiguous transfer boundaries;
- output bytes arrive through a bounded write-only pipe;
- restart reconciliation and garbage collection operate on durable state.

The security hypothesis is that the Broker can commit `issued -> consumed` before transferring a
descriptor, never restore consumed authority after an ambiguous failure, and keep output
unreleasable until exact bytes and a successful terminal transcript binding commit together.

## Scope and architecture

```text
daemon-visible ContentRef
  {opaqueContentId, sha256, byteLength, logicalInputSlot}
                  no path, endpoint, handle, store name, or descriptor

test-only Broker process                        Supervisor process
  private SQLite + object store                 no Broker store path
  BEGIN IMMEDIATE                               request exact handle/bindings
  durable consume                               receive SCM_RIGHTS descriptor
  commit before send                ----------> copy/read input or write output pipe
  verify/store/quarantine                       close or crash
```

`broker_service.py` processes one request so the harness can kill it at exact boundaries.
`supervisor_client.py` is a separately spawned receiver. `worker.py` opens its own SQLite
connection for transaction races and process-exit injection.

The direct SQLite workers deliberately have database access only to test SQLite concurrency. A
product ledger remains Broker-owned; the daemon and Supervisor must not open its database.

The server-side `--peer-role` is a test stand-in for an already authenticated peer. It is not
accepted from request bytes. A server configured with the daemon role rejects redemption before a
ledger transition. This does **not** replace Gate B signed-XPC identity evidence.

## Durable contract exercised

Every handle row binds:

```text
installationId, epochDigest, registrationId, attemptId,
direction, operation, content identity where applicable,
expected digest/size or maximum bytes, expiry, tombstone horizon,
state, redemptionId, transfer and terminal-commit evidence
```

Input:

```text
issued -> consumed
       -> revoked
       -> expired
```

Output:

```text
issued -> consumed -> committed -> trusted-host release record
       |            -> quarantined
       -> revoked
       -> expired
```

There is no transition from a terminal/tombstone state back to `issued`. SQLite triggers reject
state resurrection. An exact duplicate output commit is idempotent. A different digest, size, or
terminal transcript after commit is denied as a mismatch.

### Input transaction and descriptor

The Broker snapshots a bounded regular file into a randomly named private object, records a
separate random content ID and SHA-256 digest, and exposes only safe `ContentRef` fields.

For redemption it uses `BEGIN IMMEDIATE`, checks the server-derived Supervisor role and every
binding, changes the exact issued row to consumed, and commits before opening and sending the
read-only object descriptor over `SCM_RIGHTS`. The Supervisor observes a read-only descriptor and
never receives the source or store path. It still must verify the digest after staging in the
product path.

### Output transaction, bounded pipe, and commit

The Broker consumes the output handle before returning a write-only pipe. It records a private
random transfer filename in the consume transaction so incomplete output remains attributable
after a crash. The Broker reads at most `maxBytes + 1`; the extra byte quarantines the handle and
removes partial content.

On EOF, the Broker syncs the collected object and records its digest and size. A later commit
reopens the Broker-owned object and independently recomputes both. Only `terminalState=success`
with the exact digest, size, redemption, attempt binding, and transcript digest can transition to
committed. Failed, indeterminate, incomplete, substituted, or oversized output becomes
quarantined and cannot be released.

### SQLite profile

The observed test profile uses:

- SQLite rollback-journal `DELETE` mode, not WAL;
- `BEGIN IMMEDIATE` for compare-and-set transitions;
- `synchronous=FULL` and `fullfsync=ON`;
- foreign keys, `STRICT` tables, transition triggers, `secure_delete=ON`, and
  `trusted_schema=OFF`;
- a mode-`0700` private store and mode-`0600` database.

Rollback journaling is the deliberately smaller initial candidate. It avoids depending on WAL
concurrency behavior while Capsule has not pinned and reviewed its production SQLite build. This
spike tests process-exit recovery, not physical power loss.

## Crash and restart policy

| Boundary | Durable observation | Recovery |
| --- | --- | --- |
| Broker exits after update but before SQLite commit | row remains `issued`; no descriptor existed | a later exact redemption may proceed |
| Broker exits after consume commit but before input FD send | input remains `consumed` | no retry; attempt remains burned |
| Supervisor exits after receiving input FD | input remains `consumed` | no retry |
| Broker exits after output consume but before pipe send | output remains `consumed` | Broker restart quarantines |
| Broker exits after output file sync but before transfer record | private partial is durably named by the handle | Broker restart quarantines; GC retains until terminal/horizon |
| Broker exits after transfer record but before terminal commit | exact bytes remain recorded but unreleased | Broker restart quarantines |
| Supervisor exits after writing output | collected bytes have no terminal success | Broker restart quarantines |

The restart operation leaves consumed inputs consumed, expires stale issued handles, and
quarantines every consumed-but-uncommitted output. This intentionally sacrifices resumability to
avoid widening authority.

## Garbage-collection rules exercised

GC first expires stale issued handles. It does not remove a tombstone or associated partial while
the attempt is `active` or `indeterminate`, even after the retention horizon. Only a terminal
attempt plus an elapsed tombstone horizon permits handle removal. Content is eligible only when no
handle references it, its retention horizon passed, and no unresolved attempt references it.

File deletion is a recoverable two-phase operation: database rows become `gc-eligible`, files are
removed and the directory synced, then rows become `deleted`. A later pass can complete an
interrupted deletion. Randomly named unreferenced store files are removed only after an orphan
grace period; unknown human-named files are ignored.

## Reproduction

From the repository root:

```sh
./experiments/gate-d-custody-ledger/verify.sh
```

Increase the repeated race/crash bundle:

```sh
CAPSULE_GATE_D_REPETITIONS=20 \
  ./experiments/gate-d-custody-ledger/verify.sh
```

The Codex managed sandbox blocks local Unix socket creation. In that environment the verification
command needs the narrow local-IPC approval; this is a harness restriction, not an observed
Capsule denial.

## Retained files

- `schema.sql`: constrained Broker ledger and legal transition triggers.
- `ledger.py`: snapshot, transaction, transfer, commit, reconciliation, and GC model.
- `ipc.py`: bounded JSON packet plus `SCM_RIGHTS` descriptor transport.
- `broker_service.py`: one-request independent Broker process with crash injection.
- `supervisor_client.py`: independent descriptor/pipe receiver.
- `worker.py`: short-lived concurrent transaction/crash worker.
- `test_ledger.py`: positive, negative, race, crash, restart, substitution, release, and GC tests.
- `verify.sh`: syntax, suite, and repeated race/crash runner.
- `RESULTS.md`: exact observed environment, results, decision, and residual risks.

## Decision

**Strong conditional pass; Gate D is strengthened, not failed.**

The follow-up closes the original uncertainty around multi-process atomic redemption and durable
restart semantics. Real independent processes demonstrated one winner under concurrent input and
output redemption; process exit before commit rolled back without transfer; every post-commit
ambiguity preserved consumption or quarantined output; and GC did not delete live, unresolved, or
unexpired replay state.

It is not an unconditional Gate D pass because the tests do not compose the ledger with shipping
signed XPC peers, App Sandbox storage, or the selected backend import/staging path. Those remaining
integration points can invalidate a product implementation even though the ledger mechanism is
viable.

## Contract consequence

The Phase 2 design can proceed with a single Broker-owned transactional ledger and these rules:

1. A planning `ContentRef` is never a transfer handle.
2. Peer identity is derived before ledger lookup; handle possession is insufficient.
3. Consume commits before descriptor transfer, and ambiguous input delivery has no automatic
   retry.
4. Output uses a bounded write-only transfer and remains unreleasable until an exact successful
   terminal commit.
5. Broker restart quarantines uncommitted output instead of trying to resume it.
6. Tombstone and content GC require both elapsed policy horizons and terminal attempt state.

No new ADR is proposed from this disposable spike alone. ADR-0007 remains consistent; schema
freeze and the Broker persistence design should incorporate the observed constraints after the
shipping integration reproduces them.

## Residual risks

- Crash injection uses `os._exit`, not sudden power loss, kernel panic, APFS corruption, restored
  snapshots, disk-full behavior, I/O errors, or a physically failing store.
- SQLite 3.53.3 and Python's SQLite wrapper are observed test dependencies, not reviewed or pinned
  product dependencies. The product should use its platform/native SQLite binding and pin the
  effective behavior it claims.
- The harness role is server-configured but not code-signing authenticated. Gate B XPC identity
  evidence must be composed with this state machine in one installed test.
- The database and store are mode-restricted test directories, not separate App Sandbox containers.
- `SCM_RIGHTS` proves descriptor lifetime and access mode, not the final XPC protocol or entitlement
  boundary.
- No Apple Container/Containerization or OCI staging/import path was used. A product must copy or
  import exact bytes into attempt-owned storage, verify them again, close the descriptor, and never
  expose a live Broker file to the guest.
- Terminal transcript authenticity is represented by a bound digest; cryptographic verification
  and the full cross-store Supervisor/Broker saga are outside this experiment.
- A trusted local administrator, compromised Broker, or compromised Supervisor remains outside the
  local containment guarantees described by this ledger.
