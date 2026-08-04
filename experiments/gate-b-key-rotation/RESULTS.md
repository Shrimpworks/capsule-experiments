# Gate B release-scoped Keychain/Secure Enclave transition results

Date: 2026-07-31

Repository revision at execution: `1f9f55bf2c7cc25b936dc9e2ceb343113f398c3c`

Decision: **conditional pass; per-security-epoch access groups remain the preferred v0 design.**

The tested release-scoped group design denied old/new private-key cross-use and supported a
fail-closed transition with an explicit pre-commit rollback boundary and forward-only post-commit
repair. The result does not yet justify product or production-ready claims. A signing mediator is
not preferable on current evidence because it would add an always-running high-value signing
oracle and another availability/IPC boundary. Reconsider it if real installer/profile operations
cannot sustain one fresh group and key for every Broker/Supervisor identity-changing security
epoch.

## Environment

- Hardware/architecture: Apple Silicon, `arm64`. Serial and provisioning identifiers were not
  retained.
- macOS: 26.5.2 build 25F84.
- Xcode: 26.6 build 17F113.
- Apple clang: 21.0.0 (`clang-2100.1.1.101`).
- Python: 3.14.6.
- Python SQLite: 3.53.3, WAL, `synchronous=FULL`.
- Signing team: `3DDR84M4JS`.
- Distribution under test: Apple Development, development provisioned, Hardened Runtime.
- Broker signing identifier: `io.github.dills122.capsule.gate-b.broker`.
- Release-1 code-directory hash: `babb1e2d9dc65d945e087d1577fa8f2dbe1caa92`.
- Release-2 code-directory hash: `f9fa054ce6bdf57f947ddcac6dd6ec7fe2389664`.
- Release-1 group suffix: `io.github.dills122.capsule.gate-b.approval`.
- Release-2 group suffix: `io.github.dills122.capsule.gate-b.approval.release2`.

The code-directory hashes describe this disposable run only and are not enrolled product
identities.

## Hypothesis and threat

Hypothesis: disjoint provisioned access groups plus a durable transition fence, create-if-absent
new key, exact public-key authorization, one epoch commit point, logical old-key replacement,
recoverable physical retirement, and current-process component acceptance can ensure that:

1. a stale release cannot reach the replacement private key;
2. a partial transition never becomes execution-ready;
3. replay cannot silently replace the newly authorized key;
4. pre-commit repair can restore the prior world without resurrecting old grants;
5. post-commit repair moves forward and does not rewind the epoch; and
6. physical Keychain effects can be reconciled without pretending they were atomic with SQLite.

The threat is the Gate B observation that a stale same-Team build rejected by exact IPC can still
use any replacement key placed in its historical stable access group.

## Observed model evidence

Command:

```sh
./experiments/gate-b-key-rotation/run-model.sh
```

Result: **11 unittest methods passed, 0 failed.** The retained corpus includes:

- a complete N -> N+1 transition with new authorization active and old key physically absent;
- a fence that disables execution and invalidates old unused grants before key effects;
- idempotent new-key creation retaining one fingerprint;
- fail-closed detection when an authorized new key's observed fingerprint changes;
- restoration of N before commit, with the staged new key removed and the old grant still
  invalidated;
- refusal to restore N after the N+1 commit, followed by successful forward repair;
- reconciliation of a process death after external key creation but before local authorization;
- replay denial for `PreparedUpdate`, transition start, and stale process acceptance;
- immediate logical rejection of the old key at the N+1 commit while execution remains fenced; and
- exact-PID `SIGKILL` after 14 durable or external-effect checkpoints. Every pre-enable restart
  entered `repair-required` with execution denied; the post-enable checkpoint recovered the exact
  stable target.

The two SQLite stores deliberately prevent one transaction from masquerading as atomic Keychain,
component, and Supervisor state.

## Observed provisioned macOS evidence

Command:

```sh
./experiments/gate-b-key-rotation/run-provisioned-transition.sh
```

Result: **pass for the scoped development matrix.** Specifically:

- both separately provisioned/re-signed Broker builds satisfied their designated requirements;
- each build reported the expected Team, identifier, Hardened Runtime signature, distinct CDHash,
  and exactly one release group;
- both builds created and signed with their own disposable Secure Enclave P-256 key;
- old -> new and new -> old key lookup both failed with `-34018`;
- replayed create-if-absent returned `created=false` and the exact original public-key fingerprint;
- exact-worker `SIGKILL` passed at eight checkpoints:
  `transition_fenced`, `new_key_created_external`, `new_key_authorized`, `epoch_committed`,
  `old_key_deleted_external`, `old_key_retired`, `component_accepted`, and
  `execution_enabled`;
- pre-commit repair both restored the prior key world and completed the target from an externally
  created but not-yet-authorized key;
- post-commit repair deleted/observed the old key, retained the exact authorized target key,
  accepted the current target CDHash, and enabled execution only at stable epoch 2; and
- every case attempted deletion of both disposable key tags in `finally`, using the binary
  entitled for the corresponding group.

## Architecture consequence

Use a fresh access group and fresh non-migrated Secure Enclave operational key whenever an enrolled
Broker or Supervisor identity changes in a new security epoch. Calling this merely “per release”
is too loose: reusing a group/key across an identity-changing epoch lets a now-stale build retain
private-key use even if exact XPC rejects it.

The transition contract should preserve these rules:

1. Fence attempts and invalidate old unused grants before creating or installing target authority.
2. `ensure-key` is create-if-absent. Bind the observed public-key fingerprint into an
   installation-root-authorized target epoch before commit; never delete/recreate on retry.
3. The N+1 commit atomically changes only the authoritative Supervisor epoch/key-authorization
   pointer. It logically marks the old key replaced and keeps execution disabled.
4. Before commit, restoring N is permitted only when the old key/authorization remain exact and
   target keys/components can be removed without losing history.
5. After commit, repair is forward-only. It may finish physical key retirement and component
   acceptance but cannot rewind the epoch pointer.
6. Preserve an authorized, exact old-group cleanup path until old-key absence is observed. Its only
   security-relevant result is physical retirement; old-key signatures are already rejected by
   current authorization.
7. Require acceptance from each exact current component process incarnation after the commit and
   physical retirement. A replayed acceptance from a restarted process does not count.
8. Enable execution only after the new key fingerprint, new authorization, old-key absence, target
   identities, epoch digest, and all component acceptances agree.

## Why a signing mediator is not selected now

A mediator could retain one stable Keychain group while checking exact caller identity and epoch on
every signing request. That avoids provisioning/group churn, but it creates:

- an always-running service with direct use of every operational private key;
- a new protocol/parser and exact-peer authorization boundary;
- another update, recovery, availability, and compromise dependency; and
- a dangerous failure mode in which mediator authorization bugs become a signing oracle.

The release-scoped design instead uses an existing OS entitlement boundary and makes cross-release
private-key reachability structurally impossible in the tested case. Its cost is operational:
fresh App ID/profile entitlements, fresh keys, explicit cleanup, and forward repair. That trade is
preferable for v0 unless installed-distribution tests show it is unreliable or administratively
unmanageable.

## Counterevidence and limitations

- The platform transition authorization and epoch records are SQLite model data, not signed
  deterministic-CBOR/COSE `PreparedUpdate`, `KeyAuthorization`, or `InstallationManifest` objects.
- No installation-root Secure Enclave signing ceremony was performed. Public-key fingerprint
  binding was real; its higher-level authorization was modeled.
- The automated platform matrix used background-usable test keys. It did not repeat the already
  observed interactive user-presence Approval signing test at every crash boundary.
- Only the Broker's two real release groups and code identities participated in the macOS worker.
  Daemon/Supervisor component acceptance and process-incarnation replay were exercised in the
  model, not through an installed multi-role XPC topology.
- The cleanup path uses the preserved old-group Broker probe. A product installer/recovery bundle
  must prove how it retains and authenticates a narrowly usable cleanup actor without accepting an
  old component for ordinary work.
- Keychain deletion and SQLite commits were observed across process `SIGKILL`; sudden power loss,
  Keychain database corruption, locked Keychain, disk full, WAL damage, APFS restore, and OS update
  behavior remain untested.
- Development provisioning is not an installed Developer ID package. Profile regeneration,
  installer replacement, launchd activation, session changes, fast-user switching, MDM, and
  migration remain open.
- Release-group proliferation and Apple Developer portal/profile limits were not measured. The
  design requires a fresh group for every identity-changing key-security epoch, not necessarily
  every source commit.
- A privileged local administrator and the macOS security stack remain trusted. This does not
  provide rollback-proof state or defend against coherent restoration of an older complete world.

## Next smallest test

Integrate the same ordering into an installed, Developer ID/notarized per-user Broker/Supervisor
update fixture. Use real authenticated multi-role XPC component acceptance, a signed target-key
authorization, and a retained old-group cleanup bundle. Interrupt the supported installer and
launchd activation before/after every swap and Keychain effect, then add locked-Keychain, disk-full,
WAL damage, APFS restore, logout/login, and power-cut cases before adopting the mechanism.
