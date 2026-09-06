# C5b16 bounded timing/fault probe plan

Status: implementation, verification and review PASSED; publication owned by parent.
Parent owner-only alpha: IN_PROGRESS — TRENDING_GOOD.
Installed lifecycle, guest execution and product admission: BLOCKED.

## Question and authorized scope

Defensively validate the relationship between durable publication, Supervisor-owned
benign child teardown, and the selected total absence bound. Only this owned archive,
fixed C/Go benign children, and disposable local Darwin/arm64 directories are targets.
No guest, interpreter, backend, service, key, user content, or third-party system.
This task owns one archive PR and one canonical decision PR; no product edits.

Canonical baseline: cf835768c3cb04bf6ad9ad3cb2ed8e90ab313db5.
Archive baseline: cbfef30751f0a2dd8d8a71356c6b975b52d3e752.
C5b14B source: 294559e78b410f4b25e0e25fcf373ec0c7d1cfb5.
`inputs/ORIGINS.json` records exact predecessor bytes; copied inputs stay unchanged.
The native/Go namespaces and profile/plan/frame identities are versioned C5b16.

## Ordered increments and acceptance

1. Add fixed-capacity CLOCK_MONOTONIC phase observation and a private one-use finite
   delay at existing publication fault edges. Record setup, executable/root checks,
   spawn intent, readiness/start, frame/terminal, teardown request/gate, signal and
   absence. Verify normal native build and trace chronology before expanding.
2. Execute the existing pre-publication teardown refusal first. Require one spawn,
   no signal, unresolved cursor 17, no completion and self-alarm-only containment.
   Then compare finite 800/1200/1600-ms teardown publication delays, including
   refused publication, against no-delay controls and delayed spawn intent.
   An 800-ms spawn delay may leave insufficient startup time: retain its actual
   success or completed conservative refusal, with exact first refusal phase.
   The zero-delay normal case must still succeed. Preserve separate gate,
   post-gate, total teardown and full drive intervals;
   preserve absent observations as null. No retry, widened limits, invented
   custody/completion, changed durable ordering or extra lifecycle effect.
3. Rerun affected full predecessor-derived native/refusal/compiled mutation corpus,
   Go race checks, two-directory reproduction and timing-observer mutations.
   Retain raw traces and artifact identities; ordinary verification validates
   retained evidence without expecting repeated wall-clock measurements to match.
4. Freeze materials, perform independent review (maximum three instances), retain
   canonical results and exact archive commit links, run required canonical gates,
   publish both PRs and hand off. Any architecture remedy remains a decision gate.

## Clock interpretation

Setup clock is 1000 ms from endpoint creation. Cleanup clock is 1000 ms after the
before-teardown gate returns. Child alarm remains 4 seconds; harness alarm remains
7 seconds, with verifier timeout 9 seconds. The comparison initial action is entry
to request_teardown after its request checks and before durable publication.
This is a fixture-local anchor, not evidence of actual guest wall/cancel dispatch.
C2A requires wall action at 1000 ms and immediate cancellation, with forced absence
within 1000 ms and 1200 ms maximum from initial action. We measure both local and
total time without changing either contract. Scheduled delay is not exact elapsed
sleep: observed monotonic intervals are retained, including scheduler overhead.

## Reuse/dependency checklist

Capability: C5b16 test-only phase observation and finite fault injection.
Reuse rows: native quality/security tests (TEST-ONLY); fixed transport and
Supervisor lifecycle (BUILD-NARROWLY); platform clocks (ADOPT-PLATFORM).
No package dependency, new privileged primitive, or product responsibility.
Reuse exact C5b14B Go 1.25.13 standard-library/time and Darwin CLOCK_MONOTONIC;
Node 22+ standard libraries drive owned fixtures. Compiler/OS/SDK recorded by verifier.
Existing licenses/notices and source custody preserved. Authority: same fixed
local files/process fixture as predecessor; no network/key/guest authority.
Closed 512-entry trace, fixed numeric events, one serialized caller; no drain-thread
logging, no rich user/guest strings, one 0..1600-ms delay armed before drive.
Faults preserve existing durable refusal/fencing/recovery. All inputs copied and
hash-pinned; ordinary build offline with already available toolchain cache.
Positive/refusal/delay/bounds/restoration mutations retained. Owner: Capsule
maintainer; remove or replace whole experiment only through a new version with
canonical evidence linkage. Unknown installed identity, power-state and host-load
behavior stay BLOCKED; test adoption grants no product admission.
