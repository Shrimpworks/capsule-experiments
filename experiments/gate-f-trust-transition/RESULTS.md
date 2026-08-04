# Gate F: trust transition and recovery results

Date: 2026-07-31

Authoritative repository baseline: `9bfd2acedbccfbe851f797edc06eb447733188e3`
(`Document hardened architecture and spike plan (#7)`).

Decision: **conditional-pass**.

The architecture is directionally coherent and can be made fail-closed, but the current documents
do not yet specify enough durable state and ordering to freeze an implementation contract. The
prototype passed only after making the transition fence, grant disposition, ledger/effect
checkpoints, epoch commit point, component acceptance, and rollback eligibility explicit. Real
platform durability, signature, installer, peer-identity, and non-rollbackable-anchor behavior is
untested.

## Environment and tools

- Hardware: MacBook Pro `MacBookPro18,4`, Apple M1 Max, 10 cores, 64 GB RAM. Serial, hardware UUID,
  and provisioning identifiers were deliberately not retained.
- OS: macOS 26.5.2 build 25F84; Darwin 25.5.0 arm64.
- Python: CPython 3.14.6.
- Python-linked SQLite: 3.53.3; standalone SQLite CLI: 3.51.0.
- Git: 2.50.1 (Apple Git-155).
- Repository-supported toolchain, not used by the model: Node 22.22.1 through `fnm`, pnpm 10.28.2,
  Go 1.26.5.
- Interactive shell default Node was 16.15.0, below the repository requirement. All repository
  pnpm verification was therefore run through the pinned Node 22 runtime.
- Model settings: SQLite WAL, `foreign_keys=ON`, `synchronous=FULL`; two independent database files.

## Hypothesis and gate

Hypothesis: a signed, exact `PreparedUpdate` plus a durable pre-swap execution fence, attempt/grant
ledger checkpoint, explicit external-effect boundary, target verification, single authoritative
epoch commit, and per-process component acceptance can ensure that:

1. a mixed or stale component world never becomes execution-ready;
2. consumed approval never becomes unused after crash or repair;
3. ambiguous backend creation retains cleanup responsibility;
4. incomplete transitions enter `repair-required`;
5. a committed epoch is never rewound in place; and
6. completed external effects are observed/reconciled but never described as rolled back.

Gate F passes only if partial transitions fail closed, approval consumption cannot be reset, and
coherent rollback limitations are stated without claiming inherent monotonicity.

## Prototype scope

Observed in the model:

- An update fence is durably committed before any component swap. It disables attempts and
  terminally invalidates still-unused grants from the old epoch.
- `PreparedUpdate` binds installation, transition ID, exact source/target epoch, exact old/new
  components and entitlements, policy/profile/trust/storage target, post-fence grant/attempt ledger
  digest, external-effect high-water mark, migration reversibility, and allowed recovery actions.
- Component swaps and external trust/profile installation are separate side effects with durable
  intent/observation points.
- Candidate epoch N+1 is staged first. One transaction changes the authoritative epoch pointer,
  manifest status, policy/profile/trust snapshot reference, and storage format while execution
  remains disabled.
- Attempts are enabled only after daemon, Broker, Supervisor, and updater acknowledge the same
  epoch digest from their currently observed identity and process incarnation.
- A post-commit rollback must create a later authorized epoch; it cannot move the current pointer
  back to N. Pre-commit prior restoration is allowed only when explicitly repaired, reversible,
  free of later external effects, and history preserving.
- The external database acts only as an independently enumerable test oracle. A real backend or
  delivery system may lack equally strong enumeration.

Not implemented or observed:

- cryptographic signatures or installation-root authorization;
- canonical `PreparedUpdate` wire bytes and key-purpose checks;
- macOS installer/package-manager atomicity, APFS behavior, power-cut durability, Keychain,
  Secure Enclave, entitlements, code signing, or XPC;
- actual storage migration or forward/backward parser compatibility;
- actual Broker and Supervisor stores or cross-process authenticated messaging (the retained
  harness uses real child-process death around the model stores, not product components);
- a real backend's create/enumerate/destroy semantics;
- a non-rollbackable platform counter or independent witness.

## Observed evidence

Command:

```sh
python3 -m unittest discover -s experiments/gate-f-trust-transition -p 'test_*.py' -v
```

Result: **31 unittest methods passed, 0 failed** on the environment above. Those include the
original 29 model tests plus 43 real child-process `SIGKILL`/restart executions.

The retained tests observed:

- happy-path N → N+1 completion and all-role acceptance;
- old daemon/new Supervisor and new daemon/old Supervisor rejection;
- stale Broker epoch, stale Supervisor identity, changed entitlement, missing manifest, and
  policy/profile/trust checkpoint mismatch rejection;
- crashes after grant issuance and atomic grant consumption;
- crashes after backend-create intent and after externally visible guest creation;
- crashes after result-release intent, external release, and local result finalization;
- update refusal while attempts, cleanup, or release intent remain unresolved;
- crashes/restarts at each modeled update phase and representative before/after swap boundaries;
- partial local snapshot restore detection;
- deliberate coherent restore of both local worlds remaining undetected;
- PreparedUpdate tampering/replay, stale component-ack replay, and old-grant replay rejection;
- preservation of grant, attempt, cleanup, and event history through repair;
- authorized completion of a partially swapped target;
- refusal to rewind a committed epoch, an irreversible migration, or a transition followed by a
  newly completed external effect;
- exact-PID `SIGKILL` after 23 named durable checkpoints spanning grant use, backend creation,
  result release, component swaps, epoch commit, component acceptance, and attempt re-enable;
- ten repeated real-process kills after externally visible guest creation and ten after externally
  visible result release, with restart reconciliation preserving cleanup or completed-release
  state on every run.

The original injected-crash cases close both SQLite connections after the named committed write or
external action. The added harness instead pauses a child immediately after the same callback,
publishes its exact PID, sends uncatchable `SIGKILL` without closing either connection, and opens
the WAL-backed stores in a fresh process context. This now exercises real process death and SQLite
recovery, but still is not sudden-power-loss testing.

Repository verification also passed under Node 22.22.1: `pnpm install`, `pnpm check`, `pnpm lint`,
`pnpm test`, `pnpm verify:schemas`, `go test ./...`, `go vet ./...`, and `go build ./...`.

## Inferences from the evidence

These are design inferences, not observations of Capsule or macOS:

- The documented protocol can fail closed if one authoritative Supervisor transaction owns the
  epoch pointer and execution-enable bit, and everything outside that transaction is treated as an
  idempotent saga with durable intent plus reconciliation.
- `pending-verification` is insufficient as the last pre-stable state. A distinct
  `awaiting-component-acceptance` phase avoids enabling execution merely because the Supervisor
  committed N+1 before all required live peers accepted it.
- A transition-start barrier must define old unused-grant disposition. Invalidating them at the
  fence prevents ordinary authorized repair back to epoch N from resurrecting approvals whose
  reviewed runtime/policy context crossed an update ceremony.
- Backend absence after a persisted create intent is indeterminate unless the selected backend
  supplies authoritative enumeration. It must retain a cleanup obligation.
- A terminal attempt with an unresolved content-release intent is not drained for update purposes.
  The release must be reconciled, safely retried with the same idempotency key, or classified
  unknown before epoch advancement.
- Restoring exact old components and policy after N+1 has committed must be represented by a new
  authorized N+2 epoch. Reassigning the current pointer to N silently rewrites history.
- A completed external effect cannot be undone by database rollback. Recovery needs a stable
  idempotency key and, where available, an independently queryable completion record; otherwise it
  must retain `effect-outcome-unknown`.

## Counterevidence and limitations

- The coherent-restore negative test restores both SQLite worlds to epoch 1 and boot accepts them
  as stable. This is expected and confirms that local hash chains and locally stored TUF version
  checkpoints do not create a non-rollbackable anchor.
- SQLite documents atomic commit for one transaction, but that property depends on VFS/filesystem
  assumptions and does not make external actions atomic. Its WAL documentation explicitly says
  even transactions across multiple attached databases are not atomic as a set. The model therefore
  provides ordering evidence only, not proof of macOS power-loss durability. See SQLite's
  [atomic commit](https://www.sqlite.org/atomiccommit.html),
  [`synchronous`](https://www.sqlite.org/pragma.html#pragma_synchronous), and
  [WAL](https://www.sqlite.org/wal.html) documentation.
- TUF requires version/expiration/hash checks and persistence to reject repository rollback,
  freeze, and mix-and-match inputs. Those rules support the proposed `TrustSnapshot` inputs, but a
  coherently restored local trusted checkpoint remains outside what that local checkpoint can
  detect. See [TUF specification 1.0.35](https://theupdateframework.github.io/specification/v1.0.35/index.html),
  current when this spike ran.
- `digest()` stands in for a signature over strict canonical bytes. It demonstrates binding only;
  it is not authentication and must not be reused as product cryptography.
- The model serializes one writer. The child harness tests process death but not concurrent
  component writers, lock contention, disk-full, torn/corrupt database pages,
  rollback-journal/WAL deletion, clock failure, or malicious privileged store editing.
- The external effect table is stronger than many real APIs. When completion cannot be queried,
  replay safety depends on the remote system honoring the same durable idempotency key.

## Exact proposed state-machine changes

Replace the underspecified four-step transition diagram with these normative states and entry
conditions:

```text
stable
  → preparing-update       # atomically fence attempts; invalidate old unused grants
  → prepared               # authorized PreparedUpdate + ledger/effect checkpoints durable
  → swapping               # component/migration intent and observations; execution disabled
  → pending-verification   # exact target world verified; execution disabled
  → finalizing-epoch       # signed N+1 record staged; execution disabled
  → awaiting-component-acceptance  # N+1 pointer committed; execution disabled
  → stable                 # every required current process accepted exact N+1

any non-stable state on boot or mismatch
  → repair-required

evidence of unauthorized modification
  → quarantined | compromised
```

Normative rules to add:

1. `attemptsEnabled=false`, transition ID, approval fence/high-water mark, and disposition of every
   issued grant commit before swaps or migrations. New approval issuance and content release are
   fenced too.
2. `PreparedUpdate` binds exact from/to epoch identifiers, old and target component identity and
   entitlement sets, policy/profile/TUF checkpoint and local TrustSnapshot, storage migration and
   reversibility, required parser compatibility, post-fence grant/attempt/cleanup/release ledger
   digest or checkpoint, external-effect high-water mark, recovery actions, expiry, nonce, and
   installation-root authorization.
3. An old component may participate only in a minimal versioned recovery/bootstrap protocol able
   to verify the PreparedUpdate and refuse execution. Compatibility does not authorize an old
   component to accept target-epoch attempts.
4. Epoch finalization has one named commit point in the authoritative Supervisor store. It stages
   the immutable signed N+1 record first, then atomically updates current epoch digest,
   policy/profile/TrustSnapshot/storage references, while keeping execution disabled.
5. Required components acknowledge N+1 using authenticated IPC bound to transition ID, epoch
   digest, exact enrolled code identity, relevant entitlements, process-start incarnation, user/
   session, and accepted storage/protocol version. Acks from an exited/restarted or stale process do
   not count.
6. The final transaction enables attempts only after all required acknowledgements and a fresh
   Supervisor self-check. No daemon message can perform this transition.
7. Recovery distinguishes `finish-target`, `restore-prior-before-commit`, and
   `authorize-forward-repair`. After the N+1 commit point, installing older component bytes is a
   new N+2 transition; the epoch pointer is never rewound in place.
8. Prior restoration is forbidden after an irreversible migration or an unaccounted completed/
   unknown external effect. Repair preserves invalidated/consumed grants, attempts, cleanup leases,
   release intents, transcripts, and the abandoned transition record.
9. A durable backend-create intent without authoritative absence proof remains `unresolved` with a
   cleanup obligation. A missing handle or empty enumeration is not `destroyed`.
10. Result/content release uses a durable idempotency key and `intent → completed | unknown`
    states. Epoch advancement waits for every release intent to resolve. Completed delivery is
    recorded as irreversible and is never described as rolled back.
11. Receipts/transcripts record transition ID and epoch digest, plus whether rollback protection was
    `local-sequence-only`, `independent-checkpoint`, or `externally-witnessed`.

## Document and ADR consequences

- `docs/UPDATE_AND_RECOVERY.md`: add the normative states, exact commit point, grant fence,
  component-acceptance barrier, pre/post-commit rollback distinction, external-effect states, and
  repair preconditions above. Clarify that “atomically commit” applies only to the one authoritative
  store transaction, not component/Broker/updater stores or platform swaps.
- `docs/security/INSTALLATION_TRUST.md`: add the transition ID/process-incarnation acceptance
  binding and define the current-epoch checkpoint as `{epochNumber, epochDigest, transitionId,
  attemptsEnabled}`. State that N+1 commit cannot be repaired by moving back to N.
- `docs/TRUST_REPOSITORIES.md`: distinguish TUF rollback protection relative to the retained local
  metadata checkpoint from installation-wide coherent rollback protection. Bind the exact TUF
  checkpoint and derived TrustSnapshot into PreparedUpdate and N+1.
- `docs/EXECUTION_SUPERVISOR.md`: add release-intent drainage and the transition fence to the
  side-effect ordering list; add `effect-outcome-unknown` and component-acceptance records.
- ADR-0012: amend or supersede with the exact commit point, approval fence, acceptance barrier, and
  forward-only repair rule after commit. This changes a security-critical state machine and merits
  an ADR rather than prose-only cleanup.
- ADR-0014: clarify that TUF rollback checks do not survive coherent rollback of the entire local
  trusted checkpoint without an independently protected anchor.
- ADR-0015: require transcripts to retain unresolved cleanup/release outcomes and avoid terminal
  ordinary success until both are classified.
- `docs/security/CONTROL_EVIDENCE_MATRIX.md`: keep TRUST-001 `proposed`; attach this spike as
  `spike-observed` evidence only after review, and add separate claims for forward-only committed
  epoch repair and external-effect reconciliation.

## Open risks

- Which macOS primitive and file layout provide the real authoritative commit, including power loss,
  disk full, fsync behavior, WAL/checkpoint handling, backup exclusion, and protected access?
- Can both old and new signed Supervisors execute a deliberately tiny recovery parser without
  widening normal launch authority or creating downgrade ambiguity?
- Which component installs/migrations are actually reversible, and how is that property reviewed
  rather than self-declared by the update package?
- Can Apple Container or the selected backend enumerate guests by a stable Supervisor-generated
  reconciliation key after a crash?
- Which Broker delivery effects are independently queryable/idempotent, and how are non-queryable
  effects classified?
- Does v0 require anti-coherent-rollback stronger than explicit limitation language? If yes, which
  platform anchor or privacy-reviewed witness has suitable availability and reset semantics?
- How are old operational keys, pending approvals, and evidence verification intervals handled when
  repair creates N+2 with older component bytes?

## Next smallest test

Move the now-proven exact-PID kill pattern onto the selected Supervisor store layout and fake
installer/backend processes. Add kill points around explicit file `fsync`, rename/swap, WAL
checkpoint, migration, peer restart, and IPC response boundaries; then retain before/after APFS
images and independently enumerated guest/effect state. A separate VM power-cut campaign is still
required to test whether the selected macOS storage and installer primitives realize these commit
points under sudden power loss.
