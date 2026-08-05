# ADR-0036: Select role-separated Source Validator launchers and reactive footprint policy

- Status: Accepted
- Date: 2026-08-04
- Refines: ADR-0018, ADR-0029, and ADR-0035
- Decision scope: Source Validator R0 architecture and resource-policy boundary only
- Internal-alpha gating refined: ADR-0040 on 2026-08-05

## Context

Accepted ADR-0035 selects exact Oxc parsing in a disposable process before daemon planning and,
independently, before Approval Broker rendering or key use. Its historical V0 passive frames, V1
unwired parser artifact, and V2 failed direct-child process profile cannot become the supported
macOS product profile. The retained supported-profile review found two blockers that require an
architecture decision rather than an implementation workaround:

1. a directly spawned App-Sandboxed helper inherits the daemon's or Broker's static sandbox
   authority, so it is not a lower-authority parser boundary; and
2. the reviewed public macOS interfaces provide no usable unprivileged hard address-space or
   physical-footprint ceiling. Sampling a child's physical footprint and killing after an observed
   watermark is reactive and may overshoot.

App Sandbox also grants each sandboxed service a private writable container. The prior absolute
"no store" wording was therefore incompatible with the only plausible supported lower-authority
composition. This ADR decides the topology, residual filesystem authority, and honest resource
claim before any new bytes are built or signed.

## Decision

### Two role-specific private launcher services

Select two distinct, unprivileged, separately App-Sandboxed private XPC launcher services:

| Consumer role | Enrolled containing bundle | Private XPC service bundle/service identity | Parser-child signing identity | Closed method identity |
| --- | --- | --- | --- | --- |
| daemon planner | `com.capsulecorp.capsule.daemon` | `com.capsulecorp.capsule.source-validator.daemon.v1` | `com.capsulecorp.capsule.source-validator-parser.daemon.v1` | `capsule.source-validator.validate-mjs-source.daemon/v1` |
| Approval Broker | `com.capsulecorp.capsule.broker` | `com.capsulecorp.capsule.source-validator.approval-broker.v1` | `com.capsulecorp.capsule.source-validator-parser.approval-broker.v1` | `capsule.source-validator.validate-mjs-source.approval-broker/v1` |

Each service is embedded privately in its own role's containing signed application/package and is
reachable only from that enrolled containing role through the supported private-XPC mechanism.
If the user-visible main app also hosts daemon UI/installation behavior, the daemon execution role
still runs from the nested/separate enrolled `com.capsulecorp.capsule.daemon` bundle; the main app
or installer is not an alternate validator peer. The Broker service remains inside
`com.capsulecorp.capsule.broker`.
The service identifiers are also the package boundary: there is no global Mach service, app group,
shared Keychain group, temporary Mach lookup exception, shared container, daemon-or-Broker peer
requirement, generic validator service, or generic XPC/JSON/Codable/RPC bus.

Each launcher embeds or binds only its matching role-specific parser child and complete signed
artifact profile. The two profiles may be produced from the same reviewed source and lock, but
their role, service, parser signing identity, parent/responsible/self constraints, entitlements,
and profile digest are distinct. A daemon result is structurally unacceptable to the Broker and a
Broker result is structurally unacceptable to the daemon. No accepted result, cache, parser
instance, request identifier, profile digest, or service state crosses roles.

This topology does not add a Supervisor service or helper. It does not modify ADR-0029's two
Supervisor Mach services and four closed authority calls. The Source Validator launchers own no
Supervisor store, Approval or evidence key, content store, registration, attempt, backend, runtime,
guest, install/update, quarantine-clear, or repair authority. The daemon still has no route to the
Broker launcher and neither launcher has a route to the Supervisor or backend.

Private-XPC reachability is an implementation gate, not an assumption. Before construction, the
passive slice must map each containing bundle, embedded service, code requirement, and supported
caller route. If official Apple public documentation/SDK evidence proves either role cannot reach
its own private service with this exact packaging, implementation stops and reports the smallest
role-local alternative for architecture review. It must not substitute a shared service, global
Mach lookup, app group, helper, or widened peer requirement.

### New v1 protocol and profile families

The supported profile uses new closed identities defined by the
[passive v1 implementation boundary](../protocol/MJS_SOURCE_VALIDATOR_PASSIVE_BOUNDARY_V1.md):

- `capsule.source-validator.protocol/v1`;
- the two role-specific method, request, and result identities;
- `capsule.source-validator.macos-xpc-parser-child.daemon/v1` and
  `capsule.source-validator.macos-xpc-parser-child.approval-broker/v1`;
- `capsule.source-validator.artifact-profile.daemon/v1` and
  `capsule.source-validator.artifact-profile.approval-broker/v1`; and
- `capsule.source-validator.reactive-footprint-policy/v1`.

The parent owns the fixed copied request until XPC has synchronously copied the one bounded data
value. The launcher owns that copy, independently predecodes and recomputes its length/digest, and
copies it into one fixed parser-input pipe. The parser owns no parent buffer. The launcher
continuously drains the fixed result pipe through cap-plus-one and treats the zero-byte diagnostic
pipe as an error on its first byte. A successful parent reply is a new defensive copy made only
after the child exit and cleanup conditions below. Parents independently decode the copy,
recompute every binding, derive the policy disposition, and retain no launcher-owned pointer or
accepted reusable result.

Every request/result binds the consumer role, protocol/method version, correlation value,
installation, trust epoch, source length/digest, exact role-specific artifact-profile digest, and
exact reactive-resource-policy digest. The result additionally contains only the closed parse,
policy, classification, and bounded-count facts. There is no source in the reply, arbitrary
diagnostic, path, profile selector, option, package, loader, endpoint, file descriptor, or
authority-bearing identifier.

V0 passive request/result/candidate/profile bytes, the exact V1 unwired Mach-O and its V0 profile,
and every V2 fixture/result remain byte-for-byte historical evidence. They are never relabeled,
resigned in place, accepted by a v1 decoder, or treated as a partial v1 profile.

### Update and mixed-version refusal

The installation manifest and trust epoch bind the complete daemon-consumer/service/parser/profile
tuple and the complete Broker-consumer/service/parser/profile tuple. Source validation is enabled
only when both tuples are accepted at protocol generation v1 in one active epoch. Update disables
new planning and approval validation, drains or fails current calls, installs and verifies both
role tuples, performs mandatory container cleanup, and then activates the new epoch atomically.

Old/new consumer, service, parser, entitlement, constraint, profile, policy, operating-system, or
epoch combinations refuse. There is no dual-version compatibility window, automatic service retry,
result migration, stale result acceptance, downgrade, or old-service fallback. An interrupted or
mixed update remains `repair-required`; it does not choose whichever role happens to start.

### Residual private-container authority and cleanup

The launcher's private App Sandbox container is accepted as residual scratch authority. "No store"
now means the launcher and parser create no persistent Capsule product state, cache, source log,
diagnostic log, reusable validation result, queue, request journal, or cross-request artifact. It
does not mean a compromised parser is structurally incapable of writing inside its role-specific
private container.

Normal operation uses copied pipes and requires no scratch file. Any container write is treated as
residue. Before accepting the first request at startup, after every request or cancellation, after
a child crash, after launcher restart, and before and after update activation, the launcher or
installation workflow must enumerate and remove all non-platform container residue through a
fixed container-root capability. Failure to establish the expected empty inventory refuses new
work and enters the fixed quarantine/repair path. Cleanup evidence records only bounded inventory,
counts, byte totals, fixed result codes, and before/after digests in the authorized test corpus; it
never records source, paths derived from source, parser diagnostics, or reusable results as product
state.

Cleanup is defense and evidence, not confidentiality proof. A compromised parser may read data it
wrote during the same compromise, and deletion does not prove bytes were absent from filesystem
history, swap, backup, or forensic recovery. The accepted claim is bounded residual authority plus
tested cleanup/refusal, not zero filesystem authority or secure erasure.

### Reactive resource policy

Replace the unavailable hard memory ceiling with a quantified reactive physical-footprint
watermark. Each launcher admits at most one validation request and owns exactly one direct parser
child for that request; descendants are forbidden. With two independent role launchers, the
installation-wide supported-host corpus must assume and test at most two simultaneous parser
children. Parents also retain bounded source, reply, in-flight-byte, connection, queue, and
deadline accounting; a rejected capacity request is never queued without bound.

The launcher samples the direct child's public physical-footprint observation at one fixed cadence.
Crossing the signed observed watermark, missing a sample, losing child identity, exceeding any
other fixed resource/deadline/output bound, or encountering system pressure causes the same
fail-closed termination path. This is not a hard peak, exact memory cap, allocation quota, resident
set limit, or host-availability guarantee. A compromised parser may allocate and touch additional
memory between samples and before kill completes.

The threshold, sampling interval, measured baseline, maximum observed overshoot, kill latency, and
supported-host/concurrency results are intentionally **not chosen in this ADR**. They must be
derived from the later separately authorized signed confinement/resource corpus, bound into the
role-specific profiles, and accepted in a profile review before either consumer activates. No
passive fixture or implementation may invent production values or turn an observation into a hard
limit claim.

### Deadline, kill, drain, and reap

Admission starts a launcher-owned monotonic deadline that the parent cannot extend. Exactly one
child is started in a fresh process group with fixed absolute enrolled bytes, fixed argv, empty
environment, fixed cwd, reset signals, role-specific launch/library constraints, fixed descriptor
actions, and close-on-exec default. Only the copied request, fixed result, and zero-byte diagnostic
pipes survive. The launcher does not reply on EOF alone.

Success requires the exact result and no extra byte, empty diagnostics, zero child exit, matching
role/version/installation/epoch/source/profile/policy bindings, direct-child reap, established
absence of any surviving child-group member through the supported mechanism, and successful
post-request container cleanup. On cancellation, disconnect, deadline, watermark, sample failure,
malformed/partial/duplicate/trailing/oversize result, diagnostic byte, crash, signal, unexpected
child, or cleanup failure, the launcher closes input, sends `SIGKILL` to the process group,
continues bounded drain through cap-plus-one, reaps the direct child, discards every result, performs
cleanup, and returns only a fixed refusal if the channel still exists. It never automatically
retries. Launcher death or XPC interruption is a parent refusal; `launchd` restart cannot convert
the failed call to success.

The signed installed corpus must prove the exact orphan-prevention/recovery behavior when the
launcher dies at every spawn, I/O, kill, drain, and reap boundary. If supported mechanisms cannot
establish bounded termination of a child after launcher death without persistent state, wider
authority, or private API, this profile stops.

## Stop conditions

The selected path stops, reports `BLOCKED` or the exact candidate `NO_GO` as appropriate, and
returns to architecture review if any of these occurs:

1. either consumer cannot privately reach only its own embedded XPC service through supported
   public mechanisms;
2. implementation requires a shared/generic service, cross-role result or cache, app group,
   Keychain group, global/temporary Mach exception, privileged helper, or new Supervisor route;
3. the launcher or parser can read a parent/Broker/Supervisor store or key, escape its private
   container through filesystem authority, use network/IPC beyond the closed parent call, inherit
   an ambient descriptor/Mach/bootstrap capability, or retain state across requests;
4. native/JIT/unsigned loading, debugger/task-port access, DYLD injection, or dynamic library
   loading beyond the exact reviewed closure remains reachable;
5. a parser can create a descendant, survive launcher death or the bounded kill/drain/reap path,
   or prevent mandatory cleanup without the profile refusing and fencing later work;
6. any mixed-version/profile/epoch/update combination is accepted or old V0/V1/V2 bytes must be
   reinterpreted to make the path work; or
7. the measured baseline, maximum overshoot, two-role concurrency, kill latency, or system-pressure
   behavior exceeds the later explicitly accepted supported-host availability profile. The result
   may not be rescued by calling the watermark a hard cap or omitting adverse hosts.

No fallback is automatic. In particular, failure does not authorize direct inherited helpers,
private APIs, `sandbox-exec`, Endpoint Security, a privileged helper, or a generic shared bus.

## Sequential delivery slices

1. **R1 — passive contracts and fixtures:** freeze role-specific v1 nominal identities, fixed
   request/result/profile/resource-policy layouts, copied ownership, refusal classes, aggregate
   caps, field-authority classifications, cross-role and cross-version refusals, and known answers.
   Preserve all V0/V1/V2 evidence unchanged. No service or parser runs.
2. **R2 — unsigned launcher/parser construction:** build the two smallest role-specific launcher
   services and parser children from the reviewed source/lock with no product consumer. Prove
   offline construction and static closure only; do not sign, install, or use credentials.
3. **R3 — separately authorized signing and installation:** only an explicitly authorized task may
   use matching Apple identities/profiles to sign the new bytes and verify private reachability,
   entitlements, constraints, Gatekeeper/notarization as applicable, and update placement.
4. **R4 — confinement, reactive-resource, and residue corpus:** run fixed benign parse-only evidence
   plus authority-denial, death, restart/update/startup cleanup, combined two-role concurrency, and
   measured footprint/overshoot/kill-latency cases. Select values only from this signed corpus and
   stop on any condition above.
5. **R5D — daemon consumer:** implement only the daemon-facing v1 client, fresh validation, fixed
   refusal mapping, and pre-plan binding after R1-R4 pass. It cannot reach the Broker service.
6. **R5B — Approval Broker consumer:** independently implement only the Broker-facing v1 client,
   fresh Supervisor-fetched-byte validation, fixed rendering, and proof of zero Approval-key
   operations on refusal after R5D passes. It cannot accept daemon results or reach the daemon
   service.
7. **M2/S1 checkpoint:** only after both consumers pass, reconcile JobProposal narrowing,
   registration/fetch field authority and fixtures, then decide whether the authenticated
   Supervisor IPC slice may resume. Runtime no-loader evidence remains a separate later gate.

The architecture-decision work recorded by this ADR is `PASSED`. The product Source Validator is
`BLOCKED` until R1-R5B, the signed installed evidence, the measured resource/residue corpus, and
both independent consumers pass. The rejected direct embedded-helper path is `NO_GO`; the Source
Validator capability is not.

## Consequences

The two private services preserve role separation and keep parser memory outside the daemon and
Approval Broker, at the cost of two signed package/profile/update surfaces and a supported-host
availability dependency. App Sandbox narrows authority to a private container but does not provide
zero filesystem authority. Reactive monitoring bounds detection and response only after evidence
selects values; it cannot bound peak memory or guarantee host availability. Refusing mixed updates
may temporarily block both planning and approval validation, which is preferred to accepting a
partially coherent validation boundary.

No product endpoint, XPC service, signed binary, entitlement, Apple credential use, persistent
store, runtime, backend, guest, hard memory claim, custom sandbox/private API, Endpoint Security,
or privileged helper is created or authorized by this ADR.
