# Author Explanation

Author testimony; no independent readiness verdict. Review instance 1 of 3.

## Intent And Success Criteria

Complete the C5b14B benign native-fixture composition: all 24 providers, both
actual durable gates, checkpoints and registration-only driver must work together.
Native retained observations must gate persisted completion; restart without
custody must never grant a fresh spawn or signal target. Production admission and
actual guest execution remain BLOCKED.

## Plan-To-Implementation Traceability

PLAN.md steps 1–3 are implemented. Step 4 has a full verifier, retained material
map, native inventory/reproduction, ordinary/sanitizer/race cases and compiled
mutations. Independent review and archive/canonical PR publication remain in
progress. No intended guest or installed work was silently removed from this
slice; those are explicitly later gates.

## Technical Approach And Flow

A native C main links the Go 1.25.13 c-archive. Native C alone retains successful
posix_spawn PID custody, default-SIGCHLD reaping, pipe/root ownership and transport
bytes. The Go owner serializes a strict one-attempt snapshot under an exclusive
lock. Calls copy bounded scalar requests and byte results; no foreign pointer is
retained. BeforeSpawn and BeforeTeardown persist before native effects. Recovery
17–20 persists each safe cursor before the existing native observations.

The generator freezes one benign executable/root/source/profile/plan and frame
identity shared by C and Go. It derives the C5b11 driver for C5b14B with fixed
registration only. Go store defaults are replaced only in generated native builds.
The private C completion observer requires exit zero, authoritative absence,
removed root, valid exact retained frame and no uncertainty. Go copies and commits
that frame before delivery/replay. Storage replies do not overwrite lifecycle
phase. Copying delivery rechecks the live store, preventing stale cached success.

## Changed-Component Walkthrough

- inputs/: immutable predecessor C sources/payloads, original commit/path hashes.
- source/native/: derived lifecycle, fixed benign child and concrete C providers;
  private native observation adapter and actual store gates/checkpoints.
- source/bridge/: POD ABI, c-archive/Go-main reaper probes, Go request validation,
  durable calls and fixed harness-only provisioning/fault/inspection exports.
- source/store/: derived C5b14A core, explicit native schema/observation identity,
  endpoint-failure terminal state and copied View diagnostics; inherited tests.
- scripts/: identity generation, deterministic ordinary build, strict full verifier.
- tests/: uninterposed C main and native fault/contract assertions. Harness waits
  only reap their captured benign child after assertions; never lifecycle evidence.
- evidence/results.json: current source hashes and verifier observations.
- canonical drafts: resulting scope/limits and next milestone, awaiting exact pin.

## Decisions And Rejected Alternatives

The initial Go-main probe installed a SIGCHLD handler, violating the unchanged
native reaper precondition. That exact entry-point candidate is NO_GO. Native
C main plus Go archive preserves the precondition and existing ADR-0029 topology;
no handler is reset. The standard Go runtime signal documentation corroborates
this library-mode distinction. No helper process or privileged responsibility was
added. No new dependency or product engine is selected.

Storage/native uncertainty is conservatively normalized to indeterminate. Endpoint
failure before process intent records failure 1 / cursor 21 permanently; retrying
endpoints would otherwise regrant an already consumed fixture. Restart restores
only durable bytes/cursor, never PID custody. Missing completion stays unresolved.

## Invariants And Boundary Conditions

Only the fixed benign child and owned local fixtures participate. Native launch
must see durable intent; native SIGKILL must see resume 17 and its exact captured
PID. Lost spawn response cannot adopt an output PID. No process-probing recovery.
Completion bytes and native observations are fixed and validated separately.
Reopen never initializes missing state, rollback is not supported, and corrupt,
orphaned or cross-profile state refuses. The store is bounded to 4 KiB and 32
published generations. The child/harness alarms and 1-second setup/cleanup bounds
remain fixed. Fixture harness exports are trusted controls, never product APIs.

## Verification Performed And Results

Full local verifier: 126 native case records, 17 Go suites / 58 subtests, store
race/vet/build, eight separate native/Go-race cases, 24 provider exports with only
BridgeApply imported by the provider object, and ten compiled mutations. Mutations
must reach their named intended assertion, not merely any abort or compile failure.
Twenty mode-0 ordinary artifacts reproduce in two output directories. Darwin
archive owner/time metadata and physical object-symbol paths needed normalization;
archive member bytes were unchanged. Debug sanitizer/race artifacts are separately
hashed, not included in this ordinary-byte reproduction claim.

ASan/UBSan instrument parent C only; the ordinary Go archive and benign child are
not instrumented by those runs. A separate Go-race archive is tested and its
Apple linker warning is retained. Ordinary verification checks existing materials
before building; --record is reserved for reviewed material updates.

One earlier full run aborted in case 20 nominal setup before the intentional
root-observation mutation. It lacked per-step diagnostics; root cause remains
unclassified. Diagnostics were added without extending deadlines or retrying.
The following full corpus and 30 repeated fresh-directory case-20 runs passed.
This limits timing/load claims; do not report the earlier failure as fixed.

Canonical requirements checks all passed except full golangci-lint's 50 pre-existing
revive documentation findings. Blocking non-revive lint, new-code revive ratchet,
Go tests/vet/build, pinned govulncheck, pnpm install/check/lint/test/schema/ADR checks
passed. Canonical edits are documentation only. Exact command results are retained
in review/CANONICAL_CHECKS.json; re-run proportionately if needed.

## Risks, Tradeoffs, And Maintenance Costs

Derived copies increase synchronization cost; source-origins.json makes that cost
explicit and prior archive files remain unchanged. This uses one serialized native
caller and one trusted exclusive directory, not a concurrent daemon-facing API.
Native cgo embedding/signal compatibility and Darwin build details are exact-host
observations. An unclassified setup refusal remains a testing limitation.

## Deviations, Deferrals, And Known Gaps

No guest/interpreter/backend, installed identity, signing, Keychain, restart process
custody, hostile same-UID race defense, physical disk/power-loss, rollback/restore,
real external delivery, product transaction engine or ADR-0040 performance claim.
Independent candidate review and separately authorized exact guest execution remain
future requirements. Canonical ARCHIVE_COMMIT placeholders and completion statuses
will be filled after archive commit and review, then checked before publication.

## Challenge Points For The Reviewer

Check that Go return values precede actual native effects, no cursor overwrites
native phase, response loss cannot produce fresh authority, completion observation
cannot be set by the caller, store changes invalidate delivery copies, and every
mutation fails for its intended reason. Test that private process custody cannot
be reconstructed from durable intent. Assess whether test/claim boundaries and the
unclassified setup refusal are reported honestly. These points do not limit review.
