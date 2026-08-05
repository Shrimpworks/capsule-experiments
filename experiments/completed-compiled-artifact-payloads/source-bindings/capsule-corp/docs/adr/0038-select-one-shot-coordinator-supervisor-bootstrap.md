# ADR-0038: Select a one-shot Trust Coordinator to authorize Supervisor-created protected state

- Status: Proposed
- Date: 2026-08-04
- Refines if accepted: ADR-0012, ADR-0018, ADR-0021, ADR-0029, ADR-0033, and ADR-0037

## Context

I0 froze an inactive one-application/seven-role profile and I1A constructed its unsigned bytes.
ADR-0033 selected a pre-created enrolled sibling plus lifetime BSD `flock`, but assigned root and
lock creation to a trusted containing application/installer. The installation plan identified a
narrower competing composition: the Supervisor creates inside its own App Sandbox container after
an authenticated setup authority authorizes the operation. No decision selected the authority,
the signed request/record, or the descriptor-relative root/store sequence.

The containing visible app must not gain Supervisor-state authority merely because it owns setup
UI. Conversely, the Supervisor must not create an installation-root key and self-authorize the
record that defines its own state and trust epoch. The daemon, Broker, updater, bundle replacer,
package, permanent helper, and root service are all prohibited owners. Normal startup may never
infer that missing state means a fresh installation.

Current Apple public interfaces provide a bounded candidate: `SMAppService` registers and starts a
per-user LaunchAgent; an embedded XPC service is on-demand and separately sandboxed; App Groups can
name Mach/XPC communication between sandboxed roles while also granting a real shared container
and potential Keychain namespace; peer requirements and launch constraints can bind exact enrolled
code; and the operating system associates a sandboxed app or launch agent with its container. The
exact Capsule composition still requires Apple-signed installed evidence.

## Proposed decision

### Platform-research reconciliation

The post-I1B
[Apple-platform semantics research](../MACOS_INSTALLATION_PLATFORM_RESEARCH.md) is `PASSED` in its
research scope; this ADR remains Proposed and installed I2B remains `BLOCKED`. The visible app
must first verify the installed bundle, register the Supervisor, and read back an enabled
`SMAppService` status. If approval is required or denied, it stops without invoking the
Coordinator or creating a key, request, root, or store. Only after the Supervisor is enabled may
the app invoke the Coordinator.

The Coordinator needs the interactive user's Keychain and LocalAuthentication services. Its I2B
candidate therefore tests an embedded XPC service with `JoinExistingSession=true`; the documented
`false` default is not assumed to work. Peer authentication must use the public
`NSXPCConnection`/`NSXPCListener` code-signing-requirement APIs available from macOS 13, or the C
`xpc_connection_set_peer_code_signing_requirement` API available from macOS 12. The unrelated
typed `xpc_connection_set_peer_requirement` API available only from macOS 26 is not the candidate
floor.

The bootstrap App Group is the narrow supported direct Coordinator-to-Supervisor route found, but
the members' shared-container, preferences, IPC, and potential Keychain namespaces cannot be
structurally removed. They remain residual authority whose Capsule-created contents must be
tested empty. An older Coordinator with the same admitted Keychain access-group entitlement is
also not revoked by Keychain policy merely because its release or CDHash is stale. The current
Supervisor peer requirement can refuse that process, and missing or changed key/ledger state can
fail to repair-required, but complete stale-signer fencing remains an installed I2B stop
condition.

### Authority and process placement

Add one separately signed Trust Coordinator XPC service at
`Capsule.app/Contents/XPCServices/CapsuleTrustBootstrap.xpc`, signing identifier
`com.capsulecorp.capsule.trust-bootstrap.v1`. The visible app may invoke this private service and
register the Supervisor LaunchAgent, but is not a bootstrap signer or state owner.

The Coordinator is an on-demand unprivileged process. It owns the user-presence-gated,
nonexportable installation-root key reference and a closed create-once bootstrap ledger in its own
Keychain group. It has no Approval key, Supervisor evidence key, Supervisor state/container,
network, update, replacement, backend, runtime, or guest authority. It accepts no generic signing
operation.

The Coordinator and Supervisor alone join bootstrap App Group
`3DDR84M4JS.com.capsulecorp.capsule.bootstrap.v0` and use service
`3DDR84M4JS.com.capsulecorp.capsule.bootstrap.v0.supervisor`. The group is IPC-only. Capsule creates
no shared-container entry and ignores any platform-owned metadata there; the shared container and
potential Keychain namespace remain empty of Capsule keys, files, defaults, sockets, source, state,
migration, and authority material and are tested as residual capability. The visible app and daemon
are not members.

I2B2 freezes the Coordinator-only installation-root group as
`3DDR84M4JS.com.capsulecorp.capsule.trust-bootstrap.installation-root.epoch-1` and the Supervisor
bootstrap-anchor group as
`3DDR84M4JS.com.capsulecorp.capsule.supervisor.bootstrap-anchor.epoch-1`. These are unsigned,
inactive profile inputs only. They confer no Keychain access and require fresh exact profiles,
keys, negative cross-group checks, and separately authorized I2B3 installed evidence.

The Supervisor exposes only two setup messages on that service: prepare/observe one protected-root
bootstrap and finalize it with the installation-root-signed record. Exact Coordinator and
Supervisor Team, signing ID, active CDHash/profile/entitlements, EUID, audit session, debug state,
purpose, audience, protocol, and message checks precede body copy. After completion, prepare is a
fixed no-state already-enrolled refusal. ADR-0029's two ordinary services/four calls remain a
separate disabled product surface.

### Signed-byte ownership

The Coordinator exclusively constructs and signs `SupervisorBootstrapRequestV0` for purpose
`capsule.installation.bootstrap.request` and audience
`capsule.execution-supervisor.bootstrap`. It binds installation/root-key/Supervisor identity,
expected UID, component and manifest/epoch candidate digests, epoch sequence one, closed root/lock/
store names and mechanism identities, a 32-byte nonce, an at-most-five-minute initial admission
window, and explicit attempts-disabled/no-guest values.

The Supervisor exclusively creates and observes the fixed root, lock, request copy, and fixed-v1
no-guest store inside its private container. It returns a bounded typed observation on the
authenticated live connection. It never signs the final record with its own key and never supplies
bytes wholesale to a generic Coordinator signing operation.

The Coordinator validates the observation, constructs `SupervisorBootstrapRecordV0`, and signs it
for purpose `capsule.installation.bootstrap.record` and audience
`capsule.execution-supervisor`. The record binds the exact request payload/envelope digests,
installation/root public key, epoch-one/component/manifest candidate digests, root and owner
device/inode/type/UID/mode/link facts, closed store name/format/genesis digest, immutable retained
request/record policy, and transition `protected-root-validated-disabled`.

Both objects use ADR-0019's bounded object-specific deterministic-CBOR/COSE_Sign1 shape. Apple code
identity authenticates the processes and handoff; it does not authorize either Capsule object.
Only the Capsule installation-root signature authorizes the request and record. The local genesis
requires both controls plus explicit user presence and create-only readback.

### Protected-root creation and ordinary startup

The Supervisor obtains its own container URL from the platform API. No request contains a path.
It opens the container and fixed hierarchy descriptor-relative with no symlink following. During
the one authorized transaction only, it exclusively creates fixed `supervisor.state` mode `0700`,
pre-creates `supervisor.owner` mode `0600`/link count one, acquires nonblocking BSD `flock`, then
creates and fully verifies the fixed-v1 no-guest genesis and exact retained request.

Every temporary regular file is mode `0600`, synced, closed, reopened no-follow, fully verified,
and published without replacement using `renameatx_np(..., RENAME_EXCL)` before its directory is
synced. A fixed request-bound pending journal below `Application Support` commits before the exact
private parent/staging root is created; a fixed publish-intent entry commits before the staging-to-
root rename. The staging root is fully synced and exclusively renamed before the private parent is
synced and the final root is reopened. The signed record is then retained as
a mode-`0400`, single-link root entry and one create-only exact-byte Supervisor epoch Keychain
anchor. Only after both read back exactly may the pending journal complete.

Ordinary startup reads and verifies the fixed Keychain anchor, opens the fixed private hierarchy
and enrolled root without creation, compares the root record byte-for-byte, opens/acquires/rechecks
the enrolled owner, then opens the store `O_RDWR|O_NOFOLLOW|O_CLOEXEC` relative to the retained
root without create/truncate/append. Root, record, and owner identities are enrolled; the mutable
store inode is not. The fixed name, file policy, decoded installation/Supervisor/epoch/format, and
store digests/cross-links bind each opened store generation.

The retained private-parent descriptor is part of the trusted root capability. Every held-owner
check reopens the root name from that parent and the owner name from the root, detecting post-open
rename or replacement before another store operation. Store/coordinator use one owner-session ID,
recovery remains sorted `AttemptID`-only, and `FakeBackend.CreatesGuest() == false` is mandatory.

Missing, corrupt, linked, relocated, replaced, wrongly owned, wrongly permissioned, wrong-session,
stale, mixed, rollback-uncertain, or indeterminate state is repair-required and attempts-disabled.
No ordinary path creates, normalizes, rewrites, deletes, or adopts it.

### Replay, death, and update semantics

The exact request is durably journaled before root creation. Before that commit, death has no
bootstrap effect. After it, only exact envelope replay may resume. Request expiry limits initial
admission but does not force a new request after durable admission. Concurrent exact replays
converge; a different payload, envelope, nonce, key, installation, Supervisor, component profile,
or epoch refuses.

The Coordinator retains the exact request and record envelopes before delivery because ECDSA
signature bytes are not assumed reproducible. Death or response loss after finalization returns
the same retained envelope and never creates a second key, root, owner, store, installation, or
epoch. A missing root after a publication-intent checkpoint is repair-required, not permission to
recreate it.

Ordinary whole-bundle updates preserve the root/owner identity and require an authorized forward
epoch for changed component/profile/store authority. The bootstrap Coordinator may participate in
a later closed trust transition, but this ADR defines no update, repair, restore, abandonment, or
replacement method. A stale same-Team binary's access to a current container/Keychain/root is an
installed stop condition unless the exact profile denies access or every mutation is detected and
fenced without authority recovery.

## Rejected alternatives

- **Visible app/installer creation:** rejected because it grants Broker or shared-container state
  mutation authority.
- **Supervisor self-bootstrap:** rejected because the execution authority would mint the root that
  authorizes its own installation and epoch.
- **Daemon, Broker, updater, replacer, or package signing:** rejected because none is Capsule
  installation-root authority.
- **Permanent privileged helper/root service:** rejected because no host-root operation is needed
  and the extra authority/recovery surface is unjustified.
- **Caller path or create-on-start sentinel:** rejected because path choice and plausible empty
  recreation violate the installed state boundary.
- **Unsigned/Apple-only handoff:** rejected because Apple code signing authenticates code, not the
  Capsule request/record's installation-root purpose and bindings.

## Consequences and blockers

- ADR-0033's bootstrap responsibility changes: the Coordinator authorizes and enrolls; only the
  Supervisor creates the root/lock/store in its own private container.
- I2 adds an eighth installation-only role and one bootstrap-only residual App Group/service. I0
  and I1A fixtures remain historical inactive seven-role contracts; later active profiles must use
  a new version rather than mutate those known answers.
- The design keeps the installation-root private key outside the visible app, daemon, Supervisor,
  updater, and replacer while avoiding a permanent agent or privileged helper.
- I2B1 passive objects and I2B2 unsigned construction are `PASSED` in their exact scopes.
- Installed I2 remains `BLOCKED` on exact Team-3DDR Coordinator/bootstrap profiles, production
  wrapper review, separately authorized test-only signing/Keychain/App Group/SMAppService
  mutations, same-user/stale/debug/session/update evidence, and descriptor-relative G2 composition.
- The exact I2A decision slice is `PASSED`; this ADR's lifecycle remains Proposed and no installed
  security-control evidence advances.
- Product-store selection, production signed corpus, archive F4B+, ordinary authenticated IPC,
  operational-key activation, update/repair/backup/restore, rollback anchor, attempt activation,
  runtime, backend, evidence, and guest remain outside this decision.

The exact object fields, ordering, faults, test oracles, and dependency-ordered I2B1-I2B5 slices
are in the
[I2A protected-root bootstrap decision and I2B fault plan](../MACOS_INSTALLATION_I2A_PROTECTED_ROOT_BOOTSTRAP_DECISION.md).
