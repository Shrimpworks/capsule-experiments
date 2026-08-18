# C5b11 results

C5b-S1B construction/static verification: `PASSED`. Parent C5b, runtime/profile admission, and
product admission: `BLOCKED`.

## Observed

- Attempt runtime profile SHA-256:
  `829bdd048210c14d67f4cfcb659c39db69fe5ed2ff4edb74f3f2d9f3c869f82d`; it differs from and
  explicitly rejects the stale C5b8 digest.
- Attempt plan SHA-256: `bab8d7daa7c6444b6b972c18cf6152f1c53c5712f13b4fb4948fdcc9a560947b`.
  All three frames carry both bindings.
- Completion parsing independently checks all 21 fixed header/payload/trailer fields, including
  protocol/method, RegistrationID, status, flags, reserved values, lengths, and digests.
- Two builds produced byte-identical unlinked objects. `fixed-runner.o` alone imports the exact 13
  libkrun symbols. `supervisor-effect-driver.o` imports zero libkrun symbols, exactly 24 closed
  provider symbols, and exports only the registration-ID entry.
- The frozen independently authored oracle derives 65 primary cases, five ambiguous-spawn cases,
  55 recovery-step/failure crossings, 11 reopen/resume paths, and five teardown outcomes. The
  generator has separate candidate constants and the verifier imports none of them.
- Clang AST inspection proves the process-may-exist transition precedes spawn, confirmation follows
  only a trusted spawn result, all process-may-exist failures enter created convergence, startup
  checks the recovery cursor first, and created/completion recovery call the closed providers in the
  required structure. Exact-source and object checks cover typed echoes, cursors, symbols, and bytes.
- All 69 restored-invalid mutations refused, including ambiguous spawn bypass, recovery crossings,
  reopen/resume, runtime/snapshot/root/provenance/SBOM/notice substitutions, driver source/object
  substitutions, every completion field, and the teardown no-redrive cursor.

## Four retained contradictions

| Contradiction | C5b11 resolution |
| --- | --- |
| Runner/root identity | The attempt profile explicitly binds runner/root/runtime/snapshot and predecessor provenance identities; every frame/effect selects that profile. |
| Effect sequencing | Spawn becomes may-exist before invocation; every ambiguous or post-creation fault converges through durable fenced recovery, terminal/absence/root order, or durable unresolved state. |
| Per-effect ABI | 24 typed providers plus echoed failure/recovery/durable-resume fields separate nominal effects, cursor lookup, reconciliation, unresolved cleanup, and exact stored replay. |
| Duplicate libkrun ownership | Only the fixed runner imports libkrun; the Supervisor driver imports none. |

## C5b-S3 findings

The amended source and contract conservatively classify spawn ambiguity before invocation. The
independent oracle is a retained literal object with checked provenance/digest and no import from the
candidate generator. The attempt profile expands the C5b7 root into governed executable/snapshot
identities and binds the relevant C5b6 and C5b4 provenance/source-obligation records. Direct
mutations cover all three findings.

## No-run proof and limits

The immutable contracts record `host: null`, `guest: null`, `executionAuthorization: null`, and
`executionAuthorized: false`; every performed-effect field is false. Static compilation, hashing,
parsing, AST/`nm` inspection, and disposable metadata/source/frame mutation were the only operations.

The oracle is exhaustive only for its literal no-run C model. It trusts Clang's AST, the verifier,
the retained predecessor bytes, and repository tooling; it cannot prove absent provider
implementations or platform behavior. C5b4 preferred-form kernel source remains incomplete and
distribution source compliance remains `BLOCKED`. Provider provenance, cross-host reproducibility,
installed composition, controlled execution, fresh review, runtime/profile admission, and product
admission remain `BLOCKED`.
