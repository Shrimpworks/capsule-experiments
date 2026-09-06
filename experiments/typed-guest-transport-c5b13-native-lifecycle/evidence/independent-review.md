# Independent review ledger

Review instance 1 of 3: `Not ready` (2026-09-05 local).
Reviewer: fresh read-only `c5b13_lifecycle_review` agent; no implementation history.
Scope: untracked C5b13 experiment against archive HEAD
`ad5217fc17b97b3c3cac44d383e6b296c111d310`; exact reviewed material/generated hashes
retained in `review-1-verification.json`. Reviewer inspected implementation before
author explanation and ran ordinary verification: 24 native, 24 ASan/UBSan,
eight assertion mutations and four reproduced variants passed. All six original
provenance inputs matched their immutable Git sources byte-for-byte.

## R1 finding and author response

P2: effects 6 and 7 consume failed close slots without retaining close uncertainty.
Later lifecycle cleanup could observe only `-1` slots and issue a root-removal
receipt despite unresolved transport descriptor cleanup. Original C5b12 delegated
this cleanup to its harness; native lifecycle composition exposes the gap.

Author response: **Accept**. Explicit transport derivation now records every
ambiguous close in shared private state. Root-removal acknowledgment checks that
state before releasing root custody. Added SOURCE/START writer-close faults plus
a fault that deliberately leaves the exact fixture FD open. Providers never retry
that descriptor, and effect 20 withholds cleanup. The test-only harness retains
and closes its deliberately open descriptor after checking refusal. Added a
compiled mutation removing the shared-state check; assertion must fail.

Reviewer found no architecture pivot necessary. Residual limits: exclusive
reaper/controlled directory; recovery metadata from trusted caller, not durable
validation; uninstrumented children; no process-tree, installed/restart custody,
durability or cross-host evidence. Publication remained pending.

## R2 final review

Review instance 2 of 3: `Ready` for scoped experiment publication (2026-09-05 local).
Work item review `PASSED`; complete guest/product composition `BLOCKED`.
Reviewer: fresh read-only `c5b13_lifecycle_review2` agent, no implementation history.
Neutral bootstrap `review-bootstrap-2.md`; preliminary code/test concerns recorded
before reading author explanation or prior review. No actionable findings remained.

The close-uncertainty fix was confirmed in generated close_slot, remove_root,
scenarios 24–26 and the compiled restoration mutation. Fixed descriptor/root
handoff, direct-child custody, one-shot teardown, completion/exit/cleanup separation,
material identity and narrow claim boundaries matched the author explanation.

Ordinary `node scripts/verify.mjs` exited zero: 27 native cases, 27 ASan/UBSan parent
cases, nine assertion-killed mutations, four reproduced variant pairs, exact
material/generated/object hashes and 16-provider symbol inventory. All six original
inputs independently matched immutable Git sources. One initial provenance lookup
used an incorrect directory; corrected paths matched. No retained edits or evidence
refresh, additional dispatch or heavy pivot occurred.

Plan steps 1–3 supported. Parent owns archive publication and immutable canonical
pin. Residual assumptions/gaps remain as in R1: serialized exclusive owner/reaper,
controlled directory, trusted caller recovery metadata, uninstrumented children,
no durable/native store, installed pathname/restart custody, descendant absence,
guest, cross-host or product evidence. Original C5b12 corpus was not rerun.

Author response: **Accept**. Publish reviewed experiment and canonical checkpoint;
no further implementation changes after R2. No third review instance required.
