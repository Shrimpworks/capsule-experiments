# C5b11 bound, fault-convergent no-run successor

C5b-S1C scoped construction/static status: `PASSED`. Exact-head independent review, parent C5b,
runtime/profile admission, and product admission: `BLOCKED`.

## Question and predecessor disposition

Can a normal immutable C5b11 descendant close C5b-S4's four Important findings—plan-to-payload
binding, distinct cursor validation, a truthful one-shot teardown model, and two missing immutable
reference substitutions—while preserving all prior single-owner, fixed-authority, and no-run
properties?

The experiment started at capsule-experiments `origin/main`
`ecc3e5efb835931d2d2113d1bc20831a35aba8b4`, the merge of PR #30. C5b10
`6eb030130734882de4529e647a5a0ac29af362f6` remains byte-identical and is not accepted evidence.
C5b11 review heads `d4a805ab6fc6fb700d06f57896a2775680755d0f` and
`5a671198a61280ce343e2ba03787430da27fc1b7` remain normal immutable ancestors; each review's
findings are corrected only in later commits.

## Defensive no-run scope

The experiment uses repository source, deterministic compilation to unlinked Mach-O arm64 objects,
static `nm` and Clang AST inspection, exact frame/payload parsing, deterministic fixtures, and
disposable restored-invalid mutations. It does not link, load, or invoke any candidate object,
libkrun, libkrunfw, HVF, runner, process effect, VM, guest, network target, credential, Keychain
item, signing identity, service, product state, or consumer. Host, guest, execution authorization,
and every performed effect remain absent in the immutable packet.

## Design

- `contracts/attempt-runtime-profile.json` binds exact runner/root/runtime/snapshot and predecessor
  provenance identities. Its SHA-256 is
  `829bdd048210c14d67f4cfcb659c39db69fe5ed2ff4edb74f3f2d9f3c869f82d`.
- `contracts/attempt-plan.json` binds the fixed RegistrationID, AttemptID, runtime profile, and the
  exact source/input/completion payload length and SHA-256. Its SHA-256 is
  `891359ad03c420b658f0ce66769fd9996eae0022bdd0ea92a3884a8c7723bf29`.
- Source is checked as exact opaque bytes. Input and completion use repository canonical JSON form:
  valid UTF-8 JSON object, lexicographically sorted object keys, recursively canonical values, and
  no BOM, whitespace, or trailing bytes. All frame header/trailer semantics remain independently
  parsed, then extracted payloads are compared to the retained plan declarations and payload files.
- One fixed runner remains the only libkrun owner. The Supervisor driver imports zero libkrun and
  exactly 24 closed typed providers; provider implementations are absent.
- `recovery_step` names the provider transition last attempted/observed.
  `durable_resume_step` is the independently persisted safe restart cursor used for dispatch.
  Startup validates both against literal allowed pairs; fresh state requires `(0,0)`.
- Teardown step 16 is one-shot. Before the request, the provider contract persists safe cursor 17.
  Every provider error, `NOT_APPLIED`, `INDETERMINATE`, echo mismatch, and fact mismatch proceeds to
  step 17 reconciliation; none becomes immediate unresolved cleanup and teardown is never redriven.
  Failures in later reconciliation steps retain durable unresolved state.

The independent literal oracle derives 65 nominal/failure crossings, five ambiguous-spawn cases,
50 generic recovery-step/failure crossings (step 16 deliberately excluded), 11 cursor reopen/resume
paths, and five teardown outcomes that all continue through steps 17–20. Clang AST checks verify the
exact cursor member expressions and durable-field dispatch as well as state/call structure. This is
exhaustive only over the retained no-run model, not absent provider or platform behavior.

## Verification

```sh
./scripts/build.sh
node scripts/generate-bindings.mjs --check
node scripts/generate.mjs --check
node --test scripts/verify-profile.test.mjs
node scripts/verify.mjs
node scripts/test-mutations.mjs
git diff --check
```

C5b4 preferred-form kernel source remains incomplete and distribution source compliance remains
`BLOCKED`. Exact identity does not imply source, licensing, dependency, provider-provenance,
cross-host reproducibility, installed-composition, runtime/profile, or product admission. Fresh
independent review is required; this task does not request execution authorization.
