# Results

## Decision

`PASSED` for the exact deterministic no-run C5b3 controller construction.

`BLOCKED` for a complete executable successor, controlled C5b execution, runtime/profile
admission, installed composition, and product admission.

## Observed result

The retained controller is a pure monotonic state machine. It binds an exact future profile,
authorization, artifacts, and absent fixed root before requesting endpoint creation. It then
orders drains before runner start, source/input copy before launcher/child acceptance, trailer-last
before frame observation, terminal facts before durable commit, and stored completion before
delivery. Cap-plus-one, stall, reset, short write, reader death, cancellation, deadline, binding
mismatch, and process faults converge on external teardown. Store indeterminacy fences. Response
loss before commit creates no authority; response loss after commit requests byte-identical stored
replay.

The state machine does not implement the requested effects. Both retained builds are arm64 Mach-O
relocatable objects, not executables. Independent raw parsing confirms `MH_OBJECT`, no load/main/
signature commands, no undefined symbols/imports, and only the two closed public functions.

Twenty static/test-double cases and nine mutation cases pass. The controller object itself was
never linked, loaded, or executed.

## Exact blocker map

| Input | Current disposition |
| --- | --- |
| Governed `deno_core` bytes | `BLOCKED`; identity known, bytes absent |
| `libkrunfw.5.dylib` boot-kernel carrier | `BLOCKED`; identity known, bytes absent |
| Extracted kernel | `EVIDENCE_ONLY`; no separate runtime path authority |
| Separate firmware path | `INAPPLICABLE` under Accepted ADR-0041 |
| Runtime root containing the governed runtime | `BLOCKED`; not constructed |
| Composite manifest | `BLOCKED`; absent |
| Exact C5b run authorization profile | `BLOCKED`; absent and digest `null` |
| Effect adapter that performs requested actions | `BLOCKED`; absent |

The current C5b2 libkrun and host-runner identities remain bound as available predecessor inputs.
They were not copied, loaded, or run here.

## Limitations

- Static state-machine agreement is not behavioral transport, libkrun, HVF, teardown, process-tree,
  or guest evidence.
- A future adapter could be security-critical and requires its own code review, exact immutable
  composite, owner authorization, controlled fault corpus, and cleanup evidence.
- Fixed temporary/artifact paths are proposed for that one controlled experiment only. They are
  not product paths or authority.
- This result changes no Capsule ADR, control status, runtime/profile admission, or product path.
