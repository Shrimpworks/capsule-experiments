# C5b15 immutable runner reconciliation

Status: static exact-input audit and refusal tests `PASSED`. Independent review and
publication `IN_PROGRESS — TRENDING_GOOD`; later closure is retained under `review/`.
Immutable runnable composition, installed lifecycle, guest execution and product
admission remain `BLOCKED`. This audit supplies no execution authorization.

## What this closes

The C5b14B benign lifecycle/store integration is complete in its own scope. It does
not replace the retained C5b11 VMM candidate. This audit connects their exact source
and evidence identities and records the remaining obligations before another native
slice is selected. The exact path “substitute unchanged C5b14B providers into retained
C5b11” is `NO_GO`: root size, argv, symbol namespace and plan/profile identities differ.
That disposition does not abandon either predecessor or the broader runner workstream.

| Observed fact | Exact retained evidence | Consequence |
| --- | --- | --- |
| Root is 65,536 bytes in benign fixture; 100,663,296 bytes in VMM candidate | C5b14B profile versus C5b11 source/profile | Rebind a versioned composition; do not widen a constant and reuse old identity |
| `fixture-runner` versus `capsule-c5b11-fixed-runner` | Native argv and runner preflight | Executable/argv/launch inputs must close together |
| Same 24 logical roles, different C symbol namespaces and generated profiles | Byte-equal input ABI, retained exports, profile digests | Source lineage permits deliberate derivation, not binary substitution |
| Setup clock starts at endpoint creation | C5b12 transport input used by C5b14B | Its one-second budget includes setup; no separate measured guest-wall claim |
| Cleanup clock starts after durable teardown gate returns | C5b14B `request_teardown` source order | It excludes waiting in that gate; no bound from initial action follows |
| Unfenced consumed spawn intent without completion publishes unresolved resume 17 | C5b14B `LookupRecovery` source and retained corpus | Safe incomplete-attempt refusal is complete; installed restart custody/reconciliation is not |

Restart lookup is conditional: already-fenced state returns its existing cursor;
unfenced state without spawn intent is fresh; unfenced consumed intent with stored
completion publishes fenced resume 22 for replay; unfenced consumed intent without
completion publishes unresolved resume 17. The last two branches return a cursor
only after successful publication. These are store lookup outcomes, not observations
that a live process has been recovered.

The clock statement is a source-order observation, not a measured hang, timeout or
proof that the earlier setup refusal had this cause. C5b14B's earlier refusal remains
unclassified. Its 126 cases, 17 Go suites and ten mutations are retained testimony;
this slice does not rerun native fixtures or promote their evidence.

## Remaining obligations and owners

| Gate | Status | Required evidence / existing owner |
| --- | --- | --- |
| Versioned composition | `BLOCKED` | Supervisor driver/provider, native/Go bytes, fixed runner/root, libraries, frames and store identities in a non-self-referential manifest; C5b11/C5b14B owners |
| Launch identity and root custody | `BLOCKED` | Supervisor-owned enrolled executable/code identity, exact descriptor/root handoff, replacement/debug/wrong-role refusal; reuse APL-2/APL-3 and installed work, without assuming XPC identity alone proves launch custody |
| Restart custody | `BLOCKED` | Attempt-bound installed startup reconciliation before admission, durable may-exist state, authoritative custody/absence or unresolved refusal; no PID/path probe promoted to authority; existing Supervisor/G1/G2 ownership |
| Timing | `BLOCKED` | Explicit clock origins and bounds covering setup, publication, execution, cancellation and absence; controlled stall evidence with durable gates intact; C5b16 probe first |
| Provenance and source obligations | `BLOCKED` | Fresh exact composed artifacts, toolchain/import/load closure and review. Existing kernel preferred-source, raw v19/v27 and cross-host gaps retain their own owners; this audit supplies none |
| Candidate review / controlled execution | `BLOCKED` | Independent review of exact candidate and then separate authorization naming host, owned disposable guest and immutable manifest; no authorization inferred here |

## Next bounded executable slice: C5b16 timing/fault baseline

Use a versioned derivative of the C5b14B benign child/C/Go fixture in owned local
temporary directories. Do not start a VMM, interpreter, guest or installed service.
Keep its existing one-second clocks and four/seven-second child/harness containment;
new instrumentation and fault hooks require new source/profile identities.

Acceptance:

1. Retain monotonic phase timestamps for endpoint setup, executable/root verification,
   durable spawn intent, child readiness/start, frame/terminal observation, teardown
   request, durable gate return, signal and authoritative absence. Record only fixed
   labels and bounded numbers. Preserve a refusal's exact phase; do not infer its cause.
2. Inject finite controlled delays before/after publication, including a delay longer
   than the selected initial-action bound, and retain both the clock-local and total
   elapsed intervals. Assert no retry, no extra spawn/signal, no completion or custody
   fabrication, and no limit widening. Missing timing evidence remains unresolved.
3. Compare observed behavior with the exact approved clock anchors/limits and retained
   C2A/ADR-0041 semantics; report which candidate mechanisms satisfy or fail them.
   Rerun affected native/refusal/mutation checks and independent review. If a remedy
   needs a different authority, durability order or architecture, retain that decision
   gate for explicit human review instead of weakening the control in the probe.

This probe resolves feasibility and measurement uncertainty before committing to
installed composition. It is not a promise that existing synchronous storage can
meet every deadline, nor an implementation of the eventual remedy.

## Verification and provenance

Node.js 22+ standard library only; no package install needed:

```sh
node scripts/verify.mjs
```

Ordinary verification checks frozen source/evidence hashes, all 13 copied input
identities, selected C5b11/C5b14B internal provenance edges, report consistency and
21 positive/substitution/false-report tests. `--record` retains evidence after an
explicit material update; it cannot bless a changed origin ledger. Origin entries
name exact repository, commit, full repository-relative path, size and SHA-256.
Review separately verifies those bytes against immutable local Git objects.

Only the Node audit/test tools run. Copied C, Go and generator source is data and is
never imported, compiled, linked, loaded or executed. No runtime artifacts are built
or selected. Input substitution tests exercise this audit, not underlying native
security controls. The regex extracts are checks on exact known sources, not a C/Go
parser or proof of arbitrary program semantics. Remaining-gate labels are reviewed
planning judgments, not an exhaustive automated security assessment.

README/PLAN and scripts are frozen with evidence; review artifacts are separate.
Canonical decision: `capsule-corp/docs/C5B_RUNNER_RECONCILIATION_CHECKPOINT.md`, pinned
to the published archive commit. No product code, schema, control-evidence state,
ADR lifecycle, approval or resource authority changes.
