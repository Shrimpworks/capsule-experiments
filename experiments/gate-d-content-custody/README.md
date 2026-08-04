# Gate D: content handles and custody

Status: development-only feasibility spike; **conditional-pass** on 2026-07-31.

Owner: Capsule Gate D research spike, delegated from task
`019fb58b-04a8-7121-98c9-82d304cf82a5`.

Removal/replacement condition: remove the executable prototype after a reviewed
Broker/Supervisor implementation and its signed-XPC, durable-ledger, backend-staging, and fault-
injection tests supersede it. Retain the negative cases and contract fixture if they remain useful.

Nothing in this directory is a production Capsule component, security boundary, runtime profile,
or source of authoritative receipt claims. Production packages must not import it.

## Question and hypothesis

Gate D asks whether the Content Broker can retain user-content custody while giving the Execution
Supervisor only attempt-scoped transient access to exact bytes, without exposing content or
redeemable authority to the agent-facing daemon and without a live user-file mount.

Hypothesis:

1. The Broker can snapshot a user-selected regular file into a private immutable-by-contract
   object, expose only a random planning reference plus digest/size, and later transfer an already-
   open read-only descriptor directly to the authenticated Supervisor.
2. A handle ID is only a lookup key, not a bearer capability: redemption also requires the
   authenticated Supervisor role and exact installation, epoch, registration, attempt, direction,
   operation, expiry, and state bindings.
3. Persisting `issued -> consumed` before descriptor transfer makes ambiguous failures fail closed.
   A lost transfer burns the handle and attempt rather than resurrecting authority.
4. Returned output can use a write-only bounded pipe into Broker storage. Release remains forbidden
   until the Supervisor supplies an exact successful terminal-integrity binding and the Broker
   independently verifies bytes, length, and digest.

Threats addressed: live-path races, path substitution, symlink/special-file inputs, daemon content
redemption, cross-job reuse, stale/replayed handles, duplicate redemption, partial transfer,
post-snapshot substitution, crash-created authority resurrection, unbounded returned output, early
artifact release, and garbage collection of live authority.

## Authoritative baseline and repository constraints

The spike is based on exact commit
`9bfd2acedbccfbe851f797edc06eb447733188e3` (`Document hardened architecture and spike plan (#7)`).
The worktree was moved from stale commit `571131b` before any repository file was edited.

The controlling repository documents were read from that baseline: `AGENTS.md`,
`docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/TECHNICAL_DESIGN.md`,
`docs/security/THREAT_MODEL.md`, `docs/FEASIBILITY_SPIKES.md`,
`docs/security/TRUST_ARCHITECTURE.md`, `docs/protocol/OBJECT_MODEL.md`,
`docs/EXECUTION_SUPERVISOR.md`, ADR-0007, and the linked authority, attempt, epoch, runtime-
integrity, receipt, logical-slot, platform-component, compromise, evidence, and recovery documents.

The current `schemas/*.json` and TypeScript `Job` remain the canonical pre-freeze scaffold. This
spike does not modify or extend them.

## Environment and tooling

Observed locally:

| Item | Exact observation |
| --- | --- |
| Host | macOS 26.5.2 (25F84), Darwin 25.5.0, arm64 |
| Filesystem | Root/data storage is APFS; workspace runs in a managed filesystem sandbox |
| Hardware metadata | `sysctl hw.model` and `hw.memsize` were denied by the managed sandbox; no value is inferred |
| Privilege | Ordinary user process; no privileged helper, App Sandbox entitlement, app group, or XPC Mach service |
| Signing | `security find-identity -v -p codesigning` reported `0 valid identities found` |
| Apple SDK | Command Line Tools only at `/Library/Developer/CommandLineTools`; macOS SDK 26.5 |
| Xcode | Unavailable; `xcodebuild` reports that the active developer directory is Command Line Tools |
| Clang | Apple clang 21.0.0 (`clang-2100.1.1.101`) |
| Swift | Apple Swift 6.3.3; a Foundation smoke compile succeeds with a writable module cache |
| Go | Go 1.23.4 darwin/arm64 |
| SQLite | SQLite 3.51.0 CLI |
| Node/pnpm | Node 22.22.1 via `fnm` and pnpm 10.28.2 for repository verification; default shell Node 16.15.0 was not used |

No Apple Container backend or guest was involved. The prototype transfers and stages content on
the host only, so it cannot establish guest isolation or backend mount behavior.

## Primary-source findings

These source statements are external evidence, not observations of Capsule product behavior:

- Apple documents `xpc_dictionary_set_fd` and `xpc_dictionary_dup_fd` as the supported low-level
  XPC operations for inserting a descriptor into a message and obtaining a new receiver-owned
  descriptor. `xpc_fd_create` explicitly performs the equivalent of `dup(2)`, so the sender can
  close its descriptor after boxing it. See
  [Apple: xpc_dictionary_set_fd](https://developer.apple.com/documentation/xpc/xpc_dictionary_set_fd%28_%3A_%3A_%3A%29),
  [Apple: xpc_dictionary_dup_fd](https://developer.apple.com/documentation/xpc/xpc_dictionary_dup_fd%28_%3A_%3A%29),
  and [Apple: xpc_fd_create](https://developer.apple.com/documentation/xpc/xpc_fd_create%28_%3A%29).
- Apple documents OS-enforced XPC peer requirements: received messages are checked against the
  configured code-signing requirement, listener requests from failing peers are dropped, and a
  request/reply connection reports a peer-code-signing failure. This is the intended source of the
  `PeerSupervisor` authorization result, together with protocol-level installation/epoch checks;
  the role must never come from a request field. See
  [Apple: xpc_connection_set_peer_requirement](https://developer.apple.com/documentation/xpc/xpc_connection_set_peer_requirement)
  and [Apple: XPC security updates](https://developer.apple.com/documentation/updates/xpc).
- Apple documents that an Open/Save panel extends a sandboxed app's authority to the selected URL,
  and that a bookmark passed to another process can extend that other process's sandbox to the
  original resource. Therefore the Broker may use the file-picker/security-scope mechanism to
  create its snapshot, but Capsule should not give a bookmark or URL to the Supervisor or daemon;
  it should give an already-open descriptor for the Broker-owned snapshot. See
  [Apple: accessing files from the macOS App Sandbox](https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox).
- Apple's `open(2)` documentation states that `O_NOFOLLOW` fails when the final target is a symbolic
  link. The prototype combines it with descriptor `stat`, a regular-file check, a byte limit, and a
  copy/hash operation; no path check is treated as sufficient by itself. See
  [Apple: open(2)](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/open.2.html).
- SQLite documents atomic transactions and crash recovery, which makes a single Broker-owned
  ledger a suitable product mechanism for atomic one-use redemption. However, SQLite's current WAL
  documentation records a WAL-reset bug through 3.51.2 under concurrent connections, fixed in
  3.51.3 and selected backports. The observed local 3.51.0 must therefore not be used as evidence
  for a concurrent WAL-mode custody ledger. Pin a fixed SQLite or use a reviewed rollback-journal
  configuration until then. See [SQLite transactions](https://sqlite.org/lang_transaction.html),
  [SQLite atomic commit](https://www.sqlite.org/atomiccommit.html), and
  [SQLite WAL](https://www.sqlite.org/wal.html).

## Minimal feasible custody contract

The following is an inference from the repository invariants, primary APIs, and prototype results.
It is the recommended contract for schema freeze, not implemented product behavior.

### Planning reference is not a transfer handle

`ContentRef` is safe manifest metadata available to the daemon:

```text
opaqueContentId, sha256, byteLength, logicalInputSlot
```

It contains no original path, Broker store path, bookmark, file descriptor, endpoint, handle ID, or
other redeemable authority. The `ExecutionPlan` binds the logical slot, opaque content ID, digest,
and byte length.

`ContentHandle` is separate and issued only over direct authenticated Broker/Supervisor IPC after
the Supervisor has created the attempt. Its random 256-bit ID is not sufficient to redeem it.
The authoritative Broker row binds:

```text
installationId, epochDigest, registrationId, attemptId,
contentId, direction, operation, maxBytes, expectedDigest/size,
expiresAt, state, redemptionId, tombstoneUntil
```

The daemon should never receive or proxy a `ContentHandle`. Even accidental possession must not be
enough: the Broker rejects a peer that is not the enrolled Supervisor.

### Input transfer

```text
selected host file
  -> Broker O_NOFOLLOW open + regular-file/size gate
  -> copy/hash to Broker-private object; original path no longer participates
  -> plan binds ContentRef digest/size
  -> attempt exists
  -> Broker atomically changes handle issued -> consumed
  -> Broker attaches read-only snapshot FD to authenticated XPC reply
  -> Supervisor copies FD bytes into attempt-owned staging
  -> Supervisor verifies exact size + SHA-256 before making staging visible
  -> Broker FD closes; guest receives only the verified attempt snapshot
```

There is no handle retry after an ambiguous input transfer. If the Broker crashes after consumption
but before the Supervisor can prove receipt, the attempt fails and its approval remains burned.
This is intentionally less available than a lease/reissue protocol and has a smaller authority
state machine.

### Output return and release

The Supervisor first applies its filesystem-safety and backend output-volume limits. The Broker then
issues a write-only pipe descriptor whose reader stores at most `maxBytes + 1`; an over-limit byte
closes/rejects the transfer and the partial object is removed. This bounds Broker storage even
before commit.

After closing the pipe, the Supervisor submits an exact commit containing attempt binding, size,
digest, terminal integrity classification, and terminal transcript digest. The Broker reopens its
own object, verifies regular-file status, size, digest, and state, then performs
`consumed -> committed`. An exact duplicate commit is idempotent. A mismatch or failed/
indeterminate terminal integrity performs or preserves `quarantined`; it can never become ordinary
release. Only the trusted-host/user surface may release a committed object.

### State and recovery

```text
input handle:   issued -> consumed
                       -> revoked
                       -> expired

output handle:  issued -> consumed -> committed
                       |            -> quarantined
                       -> revoked
                       -> expired
```

`consumed`, `committed`, `quarantined`, `revoked`, and `expired` are replay tombstones until a
policy-defined horizon has passed. Garbage collection first expires issued handles, never deletes
content referenced by a live handle or unresolved attempt, preserves tombstones needed to reject
replay/explain evidence, and removes partial output only after its attempt/lease is terminal.

The product ledger should use one Broker-owned SQLite transaction with a compare-and-set equivalent
to:

```sql
BEGIN IMMEDIATE;
UPDATE content_handle
   SET state = 'consumed', redemption_id = ?, updated_at_ms = ?
 WHERE handle_id = ?
   AND state = 'issued'
   AND expires_at_ms > ?
   AND installation_id = ? AND epoch_digest = ?
   AND registration_id = ? AND attempt_id = ?
   AND direction = ? AND operation = ?;
-- Require changes() = 1, then COMMIT before attaching the descriptor.
COMMIT;
```

## Retained prototype

- `custody.go`: standard-library Go model for Broker snapshotting, opaque references, one-use
  handles, descriptor transfer via `SCM_RIGHTS`, post-stage digest verification, bounded output
  pipes, release gating, atomic-file state persistence, and GC/tombstones.
- `custody_test.go`: positive, adversarial, misuse, and failure-injection cases, including a real
  child process receiving a read-only descriptor over `SCM_RIGHTS`.
- `xpc-probe/xpc_fd_probe.c`: native libxpc descriptor boxing/duplication probe.
- `custody-state.sql`: proposed SQLite rows, checks, legal transitions, and output-release trigger.
- `verify.sh`: reproducible race, repetition, native XPC, and SQLite-constraint runner.

The Go model's persisted JSON file is intentionally not the proposed product database. It makes the
state semantics and restart cases executable; it does not prove multi-process transactional or
power-loss behavior.

## Observed results

Command:

```sh
./experiments/gate-d-content-custody/verify.sh
```

Observed on the environment above:

| Case | Result |
| --- | --- |
| Broker snapshot and descriptor-based staging | Pass; exact bytes staged, no public path, received input FD rejected writes |
| Real child-process descriptor transfer | Pass; child received exact bytes over a Unix-domain socket after process spawn and could not write the FD |
| Original file changed after snapshot | Pass; staged bytes remained the approved snapshot |
| Symlink, directory, FIFO, device, Unix socket | Pass; all rejected without blocking on FIFO; oversized sparse file and zero-byte policy limit also denied |
| Daemon role, cross-attempt binding, path-like forged ID | Pass; all denied |
| Expiry and explicit revocation | Pass; stale/revoked redemption denied |
| Concurrent duplicate redemption | Pass; 1 of 24 contenders succeeded, 23 received already-redeemed |
| Broker crash after durable consume/before open | Pass; reload preserved consumed state and denied retry |
| Supervisor crash after descriptor receipt | Pass; descriptor close plus Broker reload did not restore handle |
| Missing descriptor/partial transfer | Pass; payload without descriptor failed closed |
| Broker-store substitution and truncation | Pass; Supervisor staging rejected digest and size mismatches |
| Output pre-release and daemon release | Pass; both denied |
| Output terminal-integrity failure | Pass; output quarantined and unreleasable |
| Oversized returned output | Pass; bounded pipe rejected the commit and removed the partial object |
| Exact duplicate output commit | Pass; idempotent; mismatched duplicate denied |
| Garbage collection | Pass; live content retained, expired authority tombstoned, tombstone later collected |
| Go race detector | Pass across all 16 top-level tests; helper-only subprocess entry skipped in the parent process as designed |
| Repetition | Pass across 20 suite runs (320 top-level test executions) |
| Native libxpc FD object | Pass; exact bytes and read-only access survived sender close; repeated five times separately |
| SQLite contract fixture | Pass; illegal state resurrection and pre-commit output release rejected |

No unexpected race detector finding occurred. The descriptor custody semantics now crossed a real
process boundary, but over a Unix-domain socket rather than authenticated XPC. These are
observations of the disposable prototype, not proof of a production XPC deployment, authenticated
peer boundary, APFS power-loss outcome, or guest backend.

## Gate decision

**Decision: conditional-pass.**

Evidence supports the minimal data and state contract: descriptor capability transfer avoids
recipient-selected paths; post-stage verification catches substitution/partial transfer; strict
attempt bindings and consume-before-send make duplicate/crash behavior fail closed; a bounded
write-only pipe plus terminal commit gates output; and tombstones permit replay-safe GC.

Gate D does **not** pass outright because production-authenticated component authority and
protected storage separation were not executable in this environment. A combined license-free
Gate B follow-up did exercise exact-ad-hoc-hash XPC authentication and descriptor transfer, which
removes the basic mechanism uncertainty but not the shipping identity/storage requirements:

- there is no separately signed Broker/Supervisor/daemon target, Apple signing identity, installed
  XPC service, App Sandbox container, or component entitlement set;
- the Go prototype's `PeerRole` is a logical authorization input, not OS authentication;
- this directory's libxpc probe exercises descriptor semantics in one process and its child probe
  uses `SCM_RIGHTS`; the combined Gate B follow-up now proves a live exact-ad-hoc-hash-protected XPC
  message with message-derived identity and read-only FD transfer, but not a Team-ID/distribution-
  signed Broker-to-Supervisor deployment;
- the Go state model uses atomic `fsync`/rename JSON, not a reviewed SQLite transaction under
  multi-process crash/power-loss injection;
- no Apple Container stage/import path was tested, so absence of a live host mount in the guest is
  a contract requirement rather than an observed backend fact.

The conditional pass becomes a pass only when Gate B or a combined follow-up proves mutually
authenticated signed XPC peers and storage isolation, and a process-level Gate D run reproduces the
same cases with the real durable ledger and backend staging path.

## Required schema and state-machine changes

Do these during coordinated Phase 2 schema freeze, not by extending the current `Job` union:

1. Add a public/internal `ContentRef` or `InputSnapshotRef` containing only opaque ID, digest,
   length, and logical slot metadata. Keep original path and user label Broker-private.
2. Bind that reference in `InputSnapshotManifest` and `ExecutionPlan.inputSlots`; never place a
   transfer handle, bookmark, file URL, host path, or guest path in the plan.
3. Define `ContentHandle` as a direct Broker/Supervisor object or persisted internal row with the
   complete binding set above. Specify explicitly that ID possession is not authorization.
4. Add direction-specific operations such as `stage-input` and `collect-output`; reject unknown
   direction/operation combinations.
5. Add handle state, redemption ID, expiry, and tombstone semantics. A consumed input handle has no
   retry transition. New approval/attempt is the safe fallback.
6. Add output `commit`/`quarantine` and a separate release record bound to a successful terminal
   transcript digest. Release must not be inferred from collection alone.
7. Add bounded error codes for unknown handle, unauthorized peer, binding mismatch, expired,
   revoked, already consumed, partial transfer, size mismatch, digest mismatch, output limit,
   quarantined, and release-not-ready.
8. Add bounded `content-handle-redeemed`, `staged-digest-verified`, `output-transfer-committed`, and
   `content-release` Supervisor/Broker evidence events. Evidence should identify the redemption
   record or a non-redeemable digest of the handle, never emit a live token.
9. Add cleanup obligations to `ExecutionAttempt`: consumed input handles, partial Broker output,
   quarantined objects, and tombstone-retention horizon remain durable until reconciled.

`custody-state.sql` is a concrete non-wire sketch of these rows and transitions.

## Concrete architecture/document tweaks

- In `docs/EXECUTION_SUPERVISOR.md`, state that the content descriptor is only a transient staging
  source. The Supervisor must copy/import it into attempt-owned storage, verify exact bytes, close
  it, and never turn the Broker path or descriptor into a live guest mount.
- In `docs/security/TRUST_ARCHITECTURE.md`, state that XPC peer identity produces the trusted role;
  handle fields are defense-in-depth bindings, not caller assertions and not bearer authority.
- In `docs/protocol/OBJECT_MODEL.md`, split planning `ContentRef` from direct-channel
  `ContentHandle`, add direction-specific state machines, and make output commit/release distinct.
- In `docs/UPDATE_AND_RECOVERY.md`, specify that an ambiguous post-consumption input transfer burns
  the attempt; recovery may not reissue the same handle automatically. Preserve tombstones across
  Broker restart/update.
- In the control-evidence matrix, Gate D can advance `DATA-002` only to `spike-observed`; `DATA-001`
  remains `proposed` until signed-XPC daemon denial and separate storage are observed.
- Record the final mechanism and fail-closed no-retry rule in a new ADR only after the signed-XPC
  follow-up validates the platform condition. ADR-0007 remains directionally correct.

## Open risks and limitations

- XPC peer requirements and component-specific App Sandbox/Keychain storage are untested here.
  Same-user separation is therefore not established.
- Team identity alone is insufficient; the final requirement must bind the expected signing
  identifier/component purpose and the protocol must bind exact installation, active build, user/
  session, and epoch as required by Gate B.
- A compromised Content Broker can still corrupt content in its custody. The expected plan digest
  plus Supervisor post-stage verification prevents changed bytes from executing as the approved
  input, but cannot make a compromised Broker confidential.
- The snapshot mutation signal uses stable descriptor identity, size, and modification time. An
  adversary may evade that signal, but the copied bytes and their digest—not source-path stability—
  are authoritative.
- The ordinary-file store is immutable by contract and mode, not against the Broker itself or a
  privileged administrator. The local administrator/kernel remain trusted by the repository model.
- Atomic JSON replacement was not subjected to power failure, storage corruption, disk-full, or two
  Broker processes. Product evidence needs fault injection against the exact SQLite library, VFS,
  journal mode, synchronous mode, and startup locking policy.
- SQLite 3.51.0 is present locally and falls within the WAL versions called out by SQLite's current
  WAL documentation. Do not select concurrent WAL mode from this spike.
- APFS snapshots, backups, copy-on-write remnants, encryption-at-rest, deletion guarantees, and
  quarantine retention were not tested. Garbage collection here proves authorization-state rules,
  not secure erasure.
- No guest/backend path was exercised. Gate C must prove that attempt staging is imported or copied
  into isolated storage rather than bind-mounting any live Broker or original-host object.
- The prototype covers data-fork bytes only. Resource forks, extended attributes, sparse-file
  accounting, very large files, mutation stress, and storage-pressure behavior need retained tests
  before regular-file capability implementation.
- The bounded output reader has no prototype wall-time/idle timeout. Product transfer must bind the
  pipe lifecycle to attempt cancellation and a durable lease so a Supervisor that never closes its
  writer cannot pin Broker memory/state indefinitely.

## Next smallest test

Build three minimal, separately signed macOS targets on one supported host:

1. an App-Sandboxed Broker with user-selected read-only file authority and a private content
   container;
2. a Supervisor XPC client/service with no Broker-container path entitlement;
3. a daemon impostor with the same user and team but the wrong signing identifier/entitlement.

Use the chosen XPC peer-requirement API on both ends, transfer the read-only input FD and bounded
output-pipe FD, and repeat only these decisive cases: valid Supervisor success, daemon denial before
FD attachment, same-team wrong-ID denial, wrong epoch/attempt denial, Broker crash immediately
before/after ledger commit and XPC reply, Supervisor crash immediately after receive, restart
reconciliation, and proof that neither daemon nor Supervisor can open the Broker store by path.

Then connect the received input FD to the narrowest Apple Container staging/import operation and
prove the guest sees the verified snapshot while changes to both the original host file and Broker
object cannot change the staged bytes. That combined test is the smallest path from this
conditional-pass to a Gate D pass.
