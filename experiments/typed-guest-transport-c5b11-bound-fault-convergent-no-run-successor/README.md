# C5b11 bound, fault-convergent no-run successor

C5b-S1A scoped status: `PASSED`. Parent C5b, runtime/profile admission, and product admission:
`BLOCKED`.

## Question and predecessor disposition

Can a fresh immutable successor preserve C5b10's positive single-owner and closed-effect evidence
while closing the two Important findings from its independent review: stale C5b8 attempt binding
and incomplete post-creation fault convergence?

This experiment starts from capsule-experiments `origin/main`
`ecc3e5efb835931d2d2113d1bc20831a35aba8b4`, the merge of PR #30. C5b10 commit
`6eb030130734882de4529e647a5a0ac29af362f6` is an immutable reviewed predecessor, but is **not
accepted evidence** because of those findings. Its bytes are unchanged.

## Defensive no-run scope

The experiment uses repository source, deterministic compilation to unlinked Mach-O arm64 objects,
static `nm` inspection, exact frame parsing, deterministic fixtures, and disposable restored-invalid
mutations. It does not link, load, or invoke a candidate object, libkrun, libkrunfw, HVF, runner,
process effect, VM, guest, network target, credential, Keychain item, signing identity, service,
product state, or consumer. The packet records host, guest, execution authorization, and every
performed effect as absent.

## Design

- `contracts/attempt-runtime-profile.json` binds the exact runner source/object, libkrun,
  libkrunfw, and 100,663,296-byte runtime root. Its SHA-256 is carried by every source, input, and
  completion frame and every effect request/result echo. The verifier derives it from bytes and
  explicitly rejects stale C5b8 digest
  `06079eea39ce9a2e0547837555a6953787d8c32d614f0ec7b9b07ef408de04cd`.
- `contracts/attempt-plan.json` binds the fixed RegistrationID, AttemptID, runtime profile, and
  exact payload identities. Execution accepts only the RegistrationID.
- The attempt profile excludes the Supervisor driver to avoid self-reference. The outer
  `fixed-runner-profile.json` separately binds the driver source, ABI, generated bindings, and
  object, proving the complete composition without a branch-name claim.
- One fixed runner remains the only libkrun owner. The Supervisor driver imports zero libkrun
  symbols and 23 closed typed providers; provider implementations are absent.
- Every post-creation error, `NOT_APPLIED`, `INDETERMINATE`, echo mismatch, or fact mismatch enters
  fenced/reopened lookup; requests teardown once; reconciles its outcome without redrive; then
  reconciles terminal state, authoritative absence, and fixed-root removal in order. An interruption
  records durable unresolved cleanup.
- Commit or delivery response loss fences and reopens the attempt/store, then returns only the same
  stored completion bytes. It never recommits or reruns.

`fixtures/reconciliation-matrix.json` contains all 65 nominal-effect/failure-kind combinations,
all recovery-step interruptions, and teardown outcomes. Its verifier derives the full expected
matrix rather than accepting text ordering alone.

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

The result is construction evidence only. Fresh independent review is required; this task does not
request execution authorization.
