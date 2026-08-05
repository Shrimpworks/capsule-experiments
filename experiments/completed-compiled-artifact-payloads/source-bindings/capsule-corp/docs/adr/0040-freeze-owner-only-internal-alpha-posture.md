# ADR-0040: Freeze the owner-only internal alpha posture

- Status: Accepted
- Date: 2026-08-05
- Refines: ADR-0011, ADR-0028, ADR-0031, ADR-0034, ADR-0035, ADR-0036, and ADR-0038
- Decision scope: first fixed-guest checkpoint and first owner-only hostile-`.mjs` internal alpha

## Context

Five independent read-only audits reviewed Capsule's architecture, governed runtime and guest
composition, installed macOS topology, protocol and approval flow, and persistence/recovery
posture after the F5 and governed-fork milestones. They agree that the smallest internal alpha is
technically credible, but the existing plans mix later distribution requirements into that path
and contain two blocking contradictions.

First, ADR-0035 and ADR-0036 place an Oxc Source Validator before planning and independently before
approval. The signed inactive R3 composition passed its exact scope, but the active R4-v1
candidates stopped before parser spawn and are `NO_GO`. A separately spawned parser child has no
reviewed, supported parent-death guarantee, and R4-v2 has not been executed. The admitted guest
runtime, not the host parser, is the security boundary against source-controlled filesystem,
network, process, environment, native, and module-loading authority.

Second, ADR-0031 deliberately forbids product consumers from activating on its fixed archive
oracle. F2-F5 now provide strong local fixed-store mechanics, but F6 production-engine selection,
restore activation, installed APFS/power-loss evidence, and continuity remain incomplete. An
owner-only disposable alpha does not require those production claims, but using the fixed store
without an explicit exception would contradict ADR-0031.

This ADR narrows the alpha claim instead of weakening either boundary. It does not admit a runtime,
backend, guest, installed profile, store, IPC service, approval key, or product consumer.

## Decision

### Two distinct checkpoints

The **first fixed guest** is a controlled engineering checkpoint using one fixed benign source,
input, and expected result in an owned disposable development guest. It may bypass the public
submission and approval flow only through a sealed test fixture. It is not a product alpha and
does not authorize arbitrary or user-supplied source.

The **first internal alpha** is an owner-only, manually installed development profile on one named
Apple-silicon Mac. It accepts exactly one byte-exact UTF-8 file named `main.mjs`, at most 262,144
bytes, plus bounded inline JSON input and output. Every approved attempt creates a fresh disposable
Linux/arm64 guest; guests are never reused across attempts and concurrency is one.

The internal alpha uses exact Apple Development-signed bytes, App Sandbox, Hardened Runtime, the
Hypervisor entitlement only on the enrolled runner, no `get-task-allow` or debug/library-loading
exception, exact peer requirements and component identities, protected Supervisor state, and a
native human Approval Broker. Developer ID distribution, notarization, automatic update,
clean-host and minimum-OS matrices, public support, and the production archive engine are external-
alpha work.

### Host Source Validator is not an internal-alpha admission gate

The internal alpha does not claim that a host Oxc parser proved syntax, dependency freedom,
semantic equivalence, or module absence before approval. The Broker instead renders and approves
the exact Supervisor-retained source bytes, digest, length, input binding, output cap, and exact
runtime/profile identity. Syntax errors and every static, dynamic, computed, `eval`, or generated-
code module-loading attempt must deterministically refuse inside the admitted guest runtime.

The runtime must physically omit host filesystem, network, process, environment, FFI/native,
package, inspector, and module-loader authority. `--jitless` is not string-code-generation denial;
the admitted profile must separately disable code generation from strings and restoration-test
both controls. Success requires the completion commit trailer last plus independent Supervisor
lifecycle, teardown, and authoritative process-tree absence. EOF or exit status alone is never
success.

ADR-0035 and ADR-0036 remain accepted designs for a later defense-in-depth and approval-
understanding control. Their V0-R3 evidence remains valid in its exact scope. Product R4/R5 is
`BLOCKED`, not abandoned, while the exact R4-v1 candidates remain `NO_GO`. R4-v2 must not use
"writes outside per-request scratch" as an automatic rejection because ADR-0036 already accepts
the launcher's whole private container as residual scratch authority. Any resumed validator path
needs a new, internally consistent acceptance contract and retained evidence.

### Narrow fixed-store exception

ADR-0031's fixed-store consumer prohibition is refined only for this owner-only internal alpha.
The exception applies after the consumer enforces all of the following:

- one installation identity, one Supervisor process, one owner lock, local APFS, and one active
  attempt;
- full verification before startup and every attempt, with any unknown, extra, corrupt, missing,
  mixed-generation, owner-mismatched, indeterminate, quarantine, or repair state disabling new
  attempts;
- no restore activation: F5 backups are verified forensic/export artifacts only;
- live-store loss or corruption retires the installation identity rather than recreating or
  rolling authority back;
- no automatic update, referenced-history deletion, secure-deletion claim, continuity promise,
  rollback recovery, or hostile same-UID host-process claim; and
- a fail-closed operational stop at the first of 128 cumulative attempts, 8 MiB active store,
  16 archive segments, startup verification exceeding 2 seconds, or durable-commit p95 exceeding
  250 milliseconds.

These thresholds are alpha policy to implement and test, not evidence that the current store
already enforces them. F6 or an equivalent reviewed production engine becomes mandatory before
restore, automatic update, multiple state-opening processes, non-disposable retained user data,
continuity claims, users beyond the owner, or external alpha.

### Authority and client flow

The narrow alpha client is a bounded development-signed CLI plus the native Broker. The CLI uses a
new authenticated, bounded local IPC adapter; the read-only diagnostic HTTP server never becomes a
mutation or authority surface. An opaque `RegistrationID` may be copied to the Broker only as an
untrusted locator. The Broker fetches and renders Supervisor-owned typed bytes.

Registration must atomically commit the exact plan, complete role bindings, canonical
`SourceManifest`, and exact `main.mjs` bytes. Execute-time APIs accept only Supervisor-issued
identifiers, never replacement source, plan, image, path, mount, resource, or backend flags. The
legacy multi-file JavaScript/TypeScript `JobProposal` and stale receipt scaffold are not alpha
consumers.

Approval uses a fresh nonreused `LAContext`, explicit user-presence/private-key-use access control,
no software-key fallback, and a narrow production COSE verifier with trusted key authorization.
The Supervisor alone consumes the approval, creates the `AttemptID`, drives the guest, reconciles
recovery, and derives the bounded public summary from durable truth.

## Ordered closure

1. Harden governed-fork promotion before consuming another promoted head: stable required checks,
   generic governed-branch workflow filters, administrator enforcement, and a no-rewrite bad-
   promotion runbook.
2. Freeze a successor runnable composition that pins exact source commits, trees, built bytes,
   runner, kernel/libkrunfw role, init, launcher, root, descriptor/port/device inventory, supported
   limits, no-loader controls, teardown, and one composed-profile digest.
3. Run the one fixed benign owned guest as a separately authorized composition experiment.
4. Implement the narrow proposal, atomic source custody, authenticated role-specific IPC,
   production approval signing/verifying, protected installed Supervisor state, fixed-store alpha
   limits, real adapter, recovery, and completion compositor.
5. Run the minimum hostile `.mjs`, authority-denial, transport, root/device, lifecycle, teardown,
   replay, response-loss, and restoration corpus in the exact signed-installed profile.
6. Treat Developer ID distribution, notarization, replacement/repair, multi-host support, F6,
   restore, and public release as a separate external-alpha gate.

## Consequences

- The first internal alpha has one honest, auditable claim: exact approved bytes run once inside a
  fresh governed guest with no ambient host authority and fail-closed lifecycle evidence.
- TypeScript, host AST facts, automatic updates, public distribution, restore, and production
  storage are removed from the internal-alpha critical path without being rejected as future
  features.
- The architecture no longer waits on an unsupported parser-child lifetime promise before testing
  the actual external isolation boundary.
- The fixed store can support a deliberately disposable owner-only alpha, but capacity or integrity
  failure may permanently stop that installation. That limitation must be visible to the owner.
- A fixed-guest success does not admit the profile, and passive/no-guest evidence does not admit a
  runtime, backend, guest, installed authority, or product alpha.
- Revisit this decision if the guest runtime cannot physically deny module/host authority, if
  atomic source custody cannot be closed, if the fixed-store exception needs continuity or restore,
  or if a supported one-shot host-validator composition closes its lifetime and residue contract.
