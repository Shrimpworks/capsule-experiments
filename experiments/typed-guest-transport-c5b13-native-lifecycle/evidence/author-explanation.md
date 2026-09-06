# Author Explanation

## Intent And Success Criteria

Exercise nine new lifecycle/root bodies with seven derived transport bodies using
a real benign direct child. Scope is same-session mechanics, not a completed
product lifecycle or runnable C5b11 driver. Expected success includes exact FD
handoff, nonzero-exit refusal, durable-gate withholding, no PID adoption on
ambiguous spawn, no signal after reap, and root release only after absence.

## Plan-To-Implementation Traceability

Implementation acceptance steps 1–3 are constructed through native checks;
independent review and publication are pending. Actual fixture identities replace
the VMM identities. No eight-provider store implementation or actual guest exists.
An internal fixed-symbol contract declares two durable gates without faking native
storage in the provider object. The test acknowledgments are explicitly non-durable.

## Technical Approach And Flow

Generator copies exact ABI/transport inputs, derives only named changes and builds
a benign child first. Child bytes/root hash define profile; payloads/profile define
plan; new registration/attempt and frame bytes follow. Private lifecycle owner
snapshots root and builds fixed posix_spawn actions. A store gate precedes spawn.
Only a successful spawn yields child custody. waitpid receipts retain terminal
facts. Teardown calls a separate durable gate before a one-shot signal and bounded
reap. Root release checks absence and descriptor identity before a one-shot close.

## Changed-Component Walkthrough

- source/lifecycle.c: nine providers and private custody; fixed paths only in exclusive test cwd.
- source/fixture-runner.c: no runtime; fixed FD/payload/root validation and fixed completion.
- scripts/generate.mjs: new bindings and explicit C5b12 transformation.
- tests/lifecycle_test.c: test-only fixed store acknowledgments, faults, independent containment.
- scripts/verify.mjs: closed material/import/export inventory, reproducible builds, instrumented tests and mutations.

## Decisions And Rejected Alternatives

No callback/setup API, replacement PID, shell, dynamic backend or path input.
Reuse public Darwin spawn/wait APIs and CommonCrypto. PID/birthtime probing cannot
restore authority here; lost ownership refuses. Production installed launch needs
its own protected identity mechanism. Store primitives stay in their future owner.

## Invariants And Boundary Conditions

Serialized owner; exclusive reaper; default SIGCHLD; one attempt; fixed bytes and
caps; unreaped direct-child PID only; no signal retry; no root release before
absence; close errors/replacement remain unresolved; no durable mock becomes fact.
Pre-spawn refusal can settle no-child/no-root without claiming an observed exit.

First independent pass found lost transport-close uncertainty. Accepted: shared private close state now gates root-removal acknowledgment; three composed fault cases and a targeted restoration mutation were added. See independent-review.md after independent implementation inspection.

## Verification Performed And Results

27 native cases, 27 ASan/UBSan cases, four variant builds reproduced in separate
directories, 16 exports/two undefined store gates, and nine compiled assertion
mutations. Full recorded toolchain/material hashes in verification.json. Child
has independent four-second watchdog; parent five seconds. Child is uninstrumented.

## Risks, Tradeoffs, And Maintenance Costs

Fixture-bound generated source and one private translation unit are deliberate
experiment constraints. No reusable public integration API. Exclusive reaper and
controlled cwd assumptions must not be ported into installed claims. Fixed 1,000-ms
setup includes compilation-independent preflight/spawn; guest timing needs closure.

## Deviations, Deferrals, And Known Gaps

The original C5b11 driver is retained only as input, not derived/linked. The fixture
calls 16 providers directly; eight store providers remain absent. Two fixed gate
imports specify future owner interaction but do not solve durable recovery. No
signed executable/path custody, process-tree absence, restart custody, power-loss,
installed or cross-host evidence. Original 39-case C5b12 corpus is retained at its
own immutable checkpoint, not rerun here; this slice tests composed fixture flow.

## Challenge Points For The Reviewer

Root cleanup on every failure; PID authority after failed spawn/wait; state/stage
bindings; signal and close response-loss handling; tests that might pass without
proving the claimed control; generator/build provenance; overbroad claims.
