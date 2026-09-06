# Independent review 1

Review instance: 1 of 3. Verdict: **Not ready**.
Source: fresh-context internal reviewer `/root/c5b16_review`.
This is a condensed transcription of the returned review, not a verbatim transcript.
Target: c7b4eba2d7de11209c06765df0a4a27127b0fcd9 plus BOOTSTRAP_1/FROZEN_1 packet.

Evidence publication is `BLOCKED` on one artifact-provenance gap. Fresh experiment
checks `PASSED`; parent alpha `IN_PROGRESS — TRENDING_GOOD`; installed/guest/product
admission `BLOCKED`. No P0/P1, authority, custody, durable-order or deadline regression.

## Findings

- **P2: Retain exact sanitizer timing executable identities.** timing-verify.mjs
  compiles timing-sanitized but omits its digest while reporting 19 sanitizer runs.
  PLAN.md requires artifact identities and canonical prose claims artifact binding.
  Retain per-mode digests and associate sanitized runs with them. Debug binaries
  may remain outside deterministic reproduction, as in the regression verifier.
- **P3: Reject missing refusal diagnostics.** Removing every T_REFUSED event from
  teardown-no-delay was accepted by analyze(), returning a null firstRefusalEffect
  with PASSED status. Require observations for failed drives and mutation coverage.
  Frozen traces themselves contain the correct events; this was non-blocking.

## Plan, claims and verification

Ordered scope, bounded tracing, one-use delay, first refusal, three publication edges,
unchanged clocks and containment separation match requirements. All canonical timing
ranges independently recomputed. Missing sanitizer identity leaves increment 3 incomplete.
512-entry/serialized/errno-preserving observation, no drain-thread tracing, exact
durable gates and clocks, corrected expiry acceptance and preserved initial failure
were confirmed. Pending canonical publication fields were explicitly excluded.

Reviewer ran ordinary timing verifier (38 cases/eight mutations) and ordinary full
regression verifier (126 native cases, 17 Go suites/58 subtests, eight Go-race cases,
ten control mutations and 22 reproduced artifacts). Initial timing run stopped at
sandbox-denied sysctl before fixture execution; authorized escalated run passed.
All 41 frozen file hashes and predecessor ORIGINS objects were independently checked
via Git source objects. All 38 retained traces and canonical ranges were reanalyzed;
the missing-refusal in-memory probe established the P3 finding. Frozen source remained
unchanged. Parent canonical suite was not duplicated.

High confidence in named fixture/source scope. Preliminary concerns preceded
AUTHOR_1.md, but required CCE recall exposed brief implementation history, partially
contaminating the blind pass. No product, installed, real guest, power-loss or load
claim follows. No retained edits, commits or PRs were made by reviewer.

## Parent disposition

Accept P2 and P3. Bind each run to its exact ordinary/sanitizer executable digest;
require failed-drive refusal observation and add wrong-artifact/missing-refusal
mutations. No native behavior, time limit, authority or durability-order change.
Refresh evidence and use review instance 2 of 3 for the bounded correction.
