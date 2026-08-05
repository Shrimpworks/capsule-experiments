# ADR-0037: Freeze the passive one-application macOS installation I0 contract

- Status: Accepted
- Date: 2026-08-04
- Protected-root bootstrap refinement: ADR-0038 on 2026-08-04
- Refines: ADR-0012, ADR-0029, ADR-0033, and ADR-0036
- Decision scope: passive Slice I0 no-guest identities, layouts, and refusal semantics only

## Context

The reviewed macOS installation plan selects one visible Swift `Capsule.app` as the user-facing
product direction while preserving the daemon, Broker, Supervisor, and two role-separated Source
Validator boundaries. Those documents did not yet provide one machine-checkable contract that
could reject missing, mixed, or extra installed roles before I1 builds signed application bytes.

Several values cannot honestly be activated. G3 found that the available certificate's display
name suggests Team `W4QUR9FUL4`, while its subject OU, signed-byte `TeamIdentifier`, and all cached
profiles are Team `3DDR84M4JS`. The protected Supervisor-root bootstrap owner was unresolved in I0;
Proposed ADR-0038 subsequently selects an on-demand Trust Coordinator authorization plus
authenticated Supervisor-created private-container composition without changing these historical
I0 known answers. ADR-0029's pairwise App Group/private-service residual authority, the product
store, and complete replacement authority are also unselected. Reusing either Team value, an ad-hoc
signature, R2's unsigned bytes, or a prose placeholder as an active profile would create false
installed identity evidence.

I0 needs to freeze what is already coherent without signing, installing, registering, launching,
or creating security state. The Source Validator R1 identities and R2 unsigned bundle/resource
paths provide the two validator subtrees. ADR-0029 provides the Supervisor role and its two closed
Mach service names. ADR-0033/G2 provides the no-create owner-lock ordering and exact `0600`,
single-link object policy, while G3 defines the installed blockers.

## Decision

### One visible application and seven required roles

Accept `capsule.macos-installation.no-guest/i0` as the only passive I0 profile. It has one visible
application at `Capsule.app`, with bundle/signing identifier
`com.capsulecorp.capsule.broker`. It contains exactly these required role paths:

| Role | Passive exact path | Identity |
| --- | --- | --- |
| Approval Broker application | `Capsule.app` | `com.capsulecorp.capsule.broker` |
| daemon per-user agent | `Capsule.app/Contents/Library/Helpers/CapsuleDaemon.app` | `com.capsulecorp.capsule.daemon` |
| Execution Supervisor per-user agent | `Capsule.app/Contents/Library/Helpers/CapsuleSupervisor.app` | `com.capsulecorp.capsule.supervisor` |
| daemon Source Validator launcher | daemon app `Contents/XPCServices/CapsuleSourceValidatorDaemon.xpc` | `com.capsulecorp.capsule.source-validator.daemon.v1` |
| daemon parser child | daemon launcher `Contents/Resources/capsule-mjs-source-validator-daemon` | `com.capsulecorp.capsule.source-validator-parser.daemon.v1` |
| Broker Source Validator launcher | `Capsule.app/Contents/XPCServices/CapsuleSourceValidatorBroker.xpc` | `com.capsulecorp.capsule.source-validator.approval-broker.v1` |
| Broker parser child | Broker launcher `Contents/Resources/capsule-mjs-source-validator-approval-broker` | `com.capsulecorp.capsule.source-validator-parser.approval-broker.v1` |

The daemon and Supervisor service-management candidates use their exact bundle identifiers as
service labels, with descriptors at `Capsule.app/Contents/Library/LaunchAgents/` under those exact
names. Each validator launcher retains its R2 `Contents/Resources/resource-policy-inactive.bin`
path. The Supervisor exposes only
`com.capsulecorp.capsule.supervisor.daemon.v0` and
`com.capsulecorp.capsule.supervisor.broker.v0`. The validator launchers expose only their R1
role-private service and method identities. Every I0 service projection is inactive because I0
does not establish supported reachability, enrollment, or process lifecycle.

Runner, update verifier, Trust/bootstrap coordinator, Bundle Replacer, Source Preparer, runtime,
backend, and guest roles are absent and explicitly excluded. Adding one is not a compatible I0
bundle.

The physical paths above are an exact passive candidate for I1, not proof that Apple supports the
intended `SMAppService.agent` and private-XPC composition at those paths. I1/R3 must prove that
exact layout using supported public interfaces. If either containing role cannot reach or register
its exact child through that layout, this exact candidate stops; implementation does not silently
move a launcher into the visible app, widen a service, or add an App Group/helper.

### Exact inactive entitlement projection

Every role requires App Sandbox and absence of `get-task-allow`, library-validation disablement,
JIT, unsigned executable memory, and Hypervisor authority. Validator roles additionally require
absence of Keychain groups, App Groups, user-selected file access, and network client/server
entitlements. The no-guest inline profile also omits Broker user-selected-file access; a later file
capability slice requires a new enrolled profile/epoch. Parser-child inheritance remains an
inactive R3/R4-dependent value. The daemon has no Keychain or user-selected-file entitlement.
Broker and Supervisor operational Keychain groups,
and daemon/Supervisor plus Broker/Supervisor App Group or private-service values, remain explicitly
inactive and unset.

No Team, distribution channel, provisioning-profile set, CDHash set, or signed entitlement-digest
set is active. An otherwise exact role tree therefore returns `signing-profile-inactive`. The
profile never substitutes W4, 3DDR, ad-hoc, wildcard, or unsigned R2 values.

### Bootstrap and owner/store boundary

The passive bootstrap contract fixes:

- Supervisor-private App Sandbox state-root class;
- closed sibling names `supervisor.owner` and `supervisor.store`;
- owner-lock mode `0600`, link count one, and the ADR-0033 Darwin `openat`/`flock` mechanism;
- ordinary startup as open-without-create;
- attempts disabled through journal, identity, service, protected-root, component-verification,
  epoch-commit, and owner/store/recovery steps; and
- the only readiness edge as clean owner/store recovery after exact epoch commit.

The bootstrap owner and production store format remain inactive. G2 is recorded only as a passed
current-v1/no-guest local mechanic. G3 remains blocked on matching Team/profile material, the
selected protected-root ceremony, a signed per-installation bootstrap record, and descriptor-
relative store opening. Missing/mismatched root, lock, store, inventory, epoch, or recovery input
enters `repair-required`; ordinary startup never creates plausible replacements.
The I0 validator also refuses a caller-asserted active signing/bootstrap profile, so its encoded
readiness edge cannot yield attempt enablement until a later version binds real enrolled evidence.

### Update, repair, and uninstall classifiers

Manual whole-bundle replacement compatibility binds deterministic digests of the complete role,
service, and entitlement sets; the bootstrap contract and store format; Supervisor IPC generation
0; and Source Validator generation 1. Missing, extra, mixed, partial, or signing-inactive tuples
refuse. An invented active release tuple also refuses because I0 has no enrolled active identity.
State-root and owner-lock identity must be preserved; a store-format change needs separate
authorization. I0 performs no replacement.

Repair uses five closed classes: restore current application files while preserving state,
authorized forward trust transition, protected-state repair required, new installation required,
and refuse automatic repair. It never clears history or unresolved cleanup.

Uninstall uses three user choices: remove application while preserving state, remove local data
where safe, and abandon the installation identity. Application bytes and service registrations are
removable. Supervisor state/root/lock, grant-attempt-cleanup history, archive/nonreuse history, and
quarantine/repair state remain retained in I0. Key/content removal is deferred until safety is
proven. Exported receipts, external witnesses, and backups are outside local erasure authority.

### Passive implementation and fixtures

The canonical Go package in `internal/installation/macosplan` returns defensive typed values and
pure deterministic results only. Generated JSON fixtures retain the profile plus missing, mixed,
extra, bootstrap, update, repair, and uninstall cases. The field-authority manifest classifies the
profile, role, entitlement, service, transition, repair, and retention projections. No TypeScript
consumer is added because no current TypeScript product surface consumes installation authority.

## Consequences and blockers

- Slice I0 can be `PASSED` once the generated fixtures, validators, authority manifest, and full
  repository verification pass.
- The parent macOS installation work remains `IN_PROGRESS — TRENDING_GOOD`; this ADR admits no
  installation or product control.
- I1 must build the exact tree with execution disabled and prove supported bundle/service
  composition. Any path or ownership change requires a new ADR rather than fixture mutation.
- I2 remains blocked on the bootstrap-owner decision, matching signing material, protected-root
  evidence, signed bootstrap record, descriptor-relative store opening, and product store choice.
- I3 remains blocked on I2, ADR-0029 transport residual authority, and ADR-0036 R3/R4.
- I4 remains blocked on I2/I3 and replacement-authority selection. I5 and I6 remain later work.

This decision creates no app, signature, profile, entitlement, key, state root, lock, store,
service registration, XPC endpoint, process, update, repair, deletion, runtime, backend, or guest.
