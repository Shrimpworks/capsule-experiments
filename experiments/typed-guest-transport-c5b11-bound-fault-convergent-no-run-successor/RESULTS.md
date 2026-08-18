# C5b11 results

C5b-S1C construction/static verification: `PASSED`. Exact-head review and parent/admission states:
`BLOCKED`.

## Observed

- Attempt runtime profile SHA-256:
  `829bdd048210c14d67f4cfcb659c39db69fe5ed2ff4edb74f3f2d9f3c869f82d`.
- Attempt plan SHA-256: `891359ad03c420b658f0ce66769fd9996eae0022bdd0ea92a3884a8c7723bf29`.
  Every frame carries both bindings.
- Source, input, and completion payloads are retained as separate immutable fixtures. Frame-extracted
  lengths/digests/exact bytes match the plan. Input/completion parse as canonical JSON; source bytes
  remain exact. Completion parsing covers all 21 header/payload/trailer fields.
- Two builds produced byte-identical unlinked objects. `fixed-runner.o` alone imports the exact 13
  libkrun symbols. `supervisor-effect-driver.o` imports zero libkrun, 24 closed providers, and
  exports only the registration-ID entry.
- The independent oracle derives 65 primary cases, five ambiguous-spawn cases, 50 generic
  recovery-step/failure crossings, 11 reopen/resume paths, and five teardown outcomes. Step 16 is
  absent from the generic immediate-unresolved cross-product; all its outcomes continue to step 17.
- AST checks verify that startup passes `result.recovery_step` and
  `result.durable_resume_step` as distinct ordered arguments, validates path-specific pairs,
  dispatches using only the durable cursor, and checks both fields are zero for fresh state.
- All 95 restored-invalid mutations refuse. New cases include fully rehashed-but-plan-stale payloads,
  invalid/noncanonical JSON, internal payload length/digest changes, plan declaration substitutions,
  cursor swaps/missing/invalid/non-monotone states, both contradictory step-16 interpretations,
  runtime-bundle substitution, and C5b4 recovery-manifest substitution.

## Four retained contradictions

| Contradiction | C5b11 resolution |
| --- | --- |
| Runner/root identity | Attempt profile binds runner/root/runtime/snapshot/provenance; attempt plan additionally binds exact frame payloads. |
| Effect sequencing | Spawn ambiguity converges deny-by-default; one-shot teardown always proceeds to reconciliation; terminal precedes absence and root cleanup. |
| Per-effect ABI | 24 providers carry distinct current-transition and durable-resume fields; startup validates exact pairs and dispatches from the durable cursor. |
| Duplicate libkrun ownership | Only the fixed runner imports libkrun; the Supervisor imports none. |

## C5b-S4 findings

The verifier now closes plan-to-frame payload binding after complete frame parsing. Cursor semantics
are explicit in ABI comments, contracts, oracle, source, AST checks, unit tests, and mutations. The
step-16 matrix contradiction is removed: provider outcomes always reconcile and are never immediate
unresolved failures. Runtime bundle and C5b4 recovery-manifest substitutions are executable retained
mutations included in the self-checking inventory.

## No-run proof and limits

Contracts record `host: null`, `guest: null`, `executionAuthorization: null`,
`executionAuthorized: false`, and every performed effect false. Only generation, compilation to
unlinked objects, hashing, parsing, AST/`nm` inspection, and disposable source/metadata/frame
mutation occurred.

The oracle is exhaustive only for its literal no-run C model. It trusts the verifier, Node JSON and
UTF-8 behavior, Clang AST, retained predecessor bytes, and repository tooling. Provider behavior,
real crash recovery, C5b4 source compliance, provider provenance, cross-host reproducibility,
installed composition, controlled execution, runtime/profile admission, and product admission
remain unproved and `BLOCKED`.
