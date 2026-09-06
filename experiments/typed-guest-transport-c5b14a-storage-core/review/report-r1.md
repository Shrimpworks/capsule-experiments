# Independent review: C5b14A

Review instance: **1 of 3**. Internal read-only assignment.

## Findings

**No actionable findings.** Storage-only implementation and retained evidence
support the stated scope. Preliminary concerns were recorded with the parent
before the author explanation: publication uncertainty, teardown redrive,
consumed-intent recovery, immutable completion and native-evidence overclaiming.
Inspection and verification closed them within the documented fixture limits.

## Plan Review

`PASSED` for PLAN items 1–3 and item 4 local verification. Publication remains
parent-owned. Complete native storage milestone remains `BLOCKED`.

- Exclusive ownership, strict decoding and fail-closed reopen implemented in
  `store/files.go` (`Initialize`, `Open`, `readExisting`).
- Intent persists before return; teardown retains step 16 / resume 17 and rejects
  redrive. Recovery never grants fresh authority after consumed intent
  (`store/transitions.go`).
- Completion requires exact fixture testimony, commits before return and preserves
  copied immutable replay (`store/completion.go`).
- PLAN explicitly defers ABI mapping, observation ownership, eight native providers,
  two gates and whole-driver verification to C5b14B. These are substantive remaining
  dependencies, accurately represented.
- Architecture remains consistent with ADR-0029's native-fronted Go owner,
  ADR-0041's Supervisor responsibilities and ADR-0042's bounded completion oracle.
  No product database selection, helper or authority expansion found.

## Author-Claim Reconciliation

| Author claim | Evidence inspected | Status | Review consequence |
| --- | --- | --- | --- |
| Existing state never becomes fresh through bootstrap/reopen | Initialize/Open/readExisting; bootstrap, corrupt-state, restart tests | Confirmed | Missing/corrupt/orphan state refuses without repair |
| Requests bind exact fixture and operation fields | begin, snapshot validation, binding mutation | Confirmed | No replacement executable, PID or path enters requests |
| Publication uncertainty fences handle | publish; 13 routes × three edges; uncertain-handle mutation | Confirmed | Postpublication failure requires reopen |
| Teardown persists safe cursor and cannot redrive | BeforeTeardown; direct/reopen/subprocess tests; mutation | Confirmed | Resume 17 precedes successful gate return |
| Consumed intent cannot recover fresh | LookupRecovery; restart/subprocess tests; mutation | Confirmed | Lost custody represented as unresolved |
| Completion stays fixed, bound and copied | CommitCompletion/Deliver/Replay; lost-response/concurrent tests; mutations | Confirmed | No bytes returned before publication |
| Native observation and external delivery remain unproved | Observation comments, fixed values, README/PLAN exclusions | Confirmed | Review supplies no native/product admission |
| Retained evidence reproduces | Ordinary verifier independently executed | Confirmed | Evidence matches frozen materials |
| Initial author run needed cache permission | Author packet only; reviewer required no escalation | Unverified historical detail | No effect on independently passing checks |

## Verification Performed

From the exact experiment directory:

```sh
node scripts/verify.mjs
```

`PASSED`: 16 top-level tests, 58 named subtests, ordinary/race suites, formatting,
vet, build, two-directory reproduction and nine compiled mutations reaching the
intended assertion failures. Test-binary SHA-256:

```text
cc272f6fbc88b78d1320000a93fa2b7102a486b2910ff2aefbcaadd8d03bf6ab
```

Final readback confirmed all 13 frozen materials unchanged against
`evidence/results.json`. Archive HEAD `44dca5cf73159f6e32764984fc23b7babcc05bfe`,
branch `codex/c5b14-storage-core`, matched the declared untracked experiment
boundary; no staged/tracked diff. Canonical initial HEAD
`a367b8c5691ead869005b0e70a42fa36a4e441ac`, branch
`codex/c5b14-storage-checkpoint`, matched bootstrap.

CCE recall/search checked. Existing registrationstate/completioncomposer publication
patterns inspected. Reviewer edited no files, created no branches, published no
commits and dispatched no further reviews.

## Open Questions And Residual Risks

- Process exits and edge injections prove neither physical power-loss durability
  nor comprehensive syscall-failure coverage.
- Trusted exclusive fixture root required; no same-UID concurrent pathname attack,
  rollback or installed custody guarantee.
- Native observation ownership, outcome translation, no-process endpoint failure
  and frame conventions require C5b14B design and evidence.
- One-attempt 4-KiB/32-generation oracle; no migration, orphan recovery, production
  engine, authenticated delivery or performance admission.
- Canonical documentation and eventual publication commits lie outside this frozen
  implementation review boundary.

Confidence high for tested storage-only behavior; broader claims unsupported.

## Verdict

**Ready.** Scoped storage-core review `PASSED`. Native provider integration and
complete storage milestone remain `BLOCKED`.

## Recommended Next Actions

Parent retain review, publish archive and pin canonical checkpoint to its immutable
commit. Preserve C5b14B integration gates and storage-only claim boundary. No
implementation correction or additional review needed for unchanged materials.

## Parent response

Accept. No findings require changes. Reviewed materials remain unchanged; this
report is retained outside the source hash map. Publication identifiers will be
recorded by the archive PR and canonical checkpoint.
