# C5b11 bound, fault-convergent no-run successor

C5b-S1B scoped status: `PASSED`. Parent C5b, runtime/profile admission, and product admission:
`BLOCKED`.

## Question and predecessor disposition

Can a new immutable C5b11 head preserve the predecessor's positive single-owner and closed-effect
evidence while closing C5b-S3's three Important findings: ambiguous spawn convergence, recovery
oracle independence/exhaustiveness, and explicit runtime/snapshot/provenance binding?

This experiment started at capsule-experiments `origin/main`
`ecc3e5efb835931d2d2113d1bc20831a35aba8b4`, the merge of PR #30. C5b10 commit
`6eb030130734882de4529e647a5a0ac29af362f6` remains byte-identical and is not accepted evidence.
C5b11 review head `d4a805ab6fc6fb700d06f57896a2775680755d0f` is preserved in branch history and is superseded by
this correction because its C5b-S3 review required changes.

## Defensive no-run scope

The experiment uses repository source, deterministic compilation to unlinked Mach-O arm64 objects,
static `nm` and Clang AST inspection, exact frame parsing, deterministic fixtures, and disposable
restored-invalid mutations. It does not link, load, or invoke any candidate object, libkrun,
libkrunfw, HVF, runner, process effect, VM, guest, network target, credential, Keychain item,
signing identity, service, product state, or consumer. The immutable packet records host, guest,
execution authorization, and every performed effect as absent.

## Design

- `contracts/attempt-runtime-profile.json` binds the exact runner source/object, libkrun,
  libkrunfw, C5b7 root/profile/archive identity, governed runtime executable, snapshot, runtime
  bundle, C5b6 provenance/SBOM/notice inputs, and C5b4 source-obligation record. Its SHA-256
  `829bdd048210c14d67f4cfcb659c39db69fe5ed2ff4edb74f3f2d9f3c869f82d` is carried by every
  frame and effect echo; the verifier rejects stale C5b8 digest `06079eea…`.
- `contracts/attempt-plan.json` binds the fixed RegistrationID, AttemptID, runtime profile, and
  payload identities. Its SHA-256 is
  `bab8d7daa7c6444b6b972c18cf6152f1c53c5712f13b4fb4948fdcc9a560947b`. Execution accepts only
  the RegistrationID.
- The attempt profile excludes the Supervisor driver to avoid self-reference. The outer immutable
  profile separately binds driver source/object, ABI, generated bindings, and the whole packet.
- One fixed runner is the only libkrun owner. The Supervisor driver imports zero libkrun symbols
  and 24 closed typed provider symbols; provider implementations are absent.
- Immediately before spawn, the driver enters `PROCESS_MAY_EXIST`. Any untrusted spawn response or
  later fault enters fenced/reopened, non-redriving convergence. Teardown carries current step 16
  and a provider-contract durable resume step 17, after which terminal join, authoritative absence,
  and root cleanup are reconciled in order. A failed recovery step records durable unresolved state.
- Registration retry first looks up the durable recovery cursor. Commit/delivery response loss
  reopens the stored completion and replays the exact bound bytes without recommit or rerun.

`oracles/independent-recovery-oracle.json` is a frozen literal model whose verifier imports no
candidate effect/trace constants. From that oracle, verification derives 65 nominal/failure
crossings, five ambiguous-spawn cases, 55 recovery-step/failure crossings, 11 interruption/reopen
paths, and five teardown outcomes. Clang AST checks confirm key C state transitions and provider-call
structure; exact-source assertions close typed cursor/echo details. This is exhaustive only over the
retained no-run model. Provider implementations and real crash/platform behavior remain unproved.

## Verification

Run only these construction/static checks:

```sh
./scripts/build.sh
node scripts/generate-bindings.mjs --check
node scripts/generate.mjs --check
node --test scripts/verify-profile.test.mjs
node scripts/verify.mjs
node scripts/test-mutations.mjs
git diff --check
```

C5b4 still records incomplete preferred-form kernel source and distribution source compliance as
`BLOCKED`. Exact binary identity does not imply source, licensing, dependency, provider-provenance,
cross-host reproducibility, installed-composition, runtime/profile, or product admission. Fresh
independent review is required; this task does not request execution authorization.
