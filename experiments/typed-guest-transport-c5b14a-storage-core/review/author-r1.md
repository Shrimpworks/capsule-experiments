# Author Explanation

## Intent And Success Criteria

Persist intent before a future effect, refuse unsafe fresh-state reconstruction,
retain cursor 17 before one-shot teardown, and replay exact stored completion after
local process loss. Storage-only conformance is the acceptance boundary; no native
provider closure is claimed.

## Plan-To-Implementation Traceability

PLAN items 1–3 implemented. Item 4 local test/race/build/restoration checks pass;
fresh review and publishing remain pending. The native bridge is the separately
named next gate C5b14B, not a hidden assertion that the whole milestone passed.

## Technical Approach And Flow

Store owns a flock and a canonical one-attempt snapshot. Every method locks the Go
mutex, verifies request and current disk/owner identities, then publishes a whole
bounded snapshot through pending-file sync, rename and directory sync. Prepublish
injection removes owned staging; postpublish uncertainty fences the handle. Open
refuses missing or extra state and never bootstraps. Existing consumed intent
becomes unresolved after reopen; existing result gets replay cursor 22.

## Changed-Component Walkthrough

files.go owns bootstrap/open, identity checks and publication. types.go owns closed
snapshot shape and canonical validation. transitions.go owns intent, fencing and
cursors. completion.go owns immutable completion and copied returns. Tests include
owned subprocess exits and every mutating route's three publication edges. The
verifier binds material hashes, runs tests/race/vet/build, checks two-directory
binary reproduction and requires intended assertion failures from nine mutations.

## Decisions And Rejected Alternatives

Existing FakeBackend storage records cannot be relabeled as native evidence.
Reuse their bounded standard-library snapshot pattern in an isolated experiment;
do not select a new product DB or introduce SQLite. Go preserves ADR-0029's native
front end / Go core direction. The fixed test observation seam keeps this increment
reviewable before native ownership and C ABI composition are designed.

## Invariants And Boundary Conditions

Missing/unknown/corrupt state refuses; no caller-supplied executable, PID, guest path
or replacement binding enters requests. Intent never returns fresh after consumption.
Teardown gate cannot redrive. Completion stays fixed, bound, copied and last. Durable
fencing/unresolved state never clears. Test root is trusted and exclusively held;
point-in-time inode/path checks are not same-UID adversarial filesystem protection.

## Verification Performed And Results

16 top-level tests plus 58 subtests passed; race, vet and build passed. Two copied
build directories produced identical trimmed test binaries. Nine compiled source
mutations reached intended test assertion failures. evidence/results.json retains
source hashes, exact test names, tool versions, binary hash and mutation details.
No physical disk or power-loss fault was executed. Initial verifier attempt inside
sandbox could not access Go cache; authorized cache access allowed it to complete.

## Risks, Tradeoffs, And Maintenance Costs

One new fixture-specific snapshot format must remain archived, not become a second
product database. One-attempt bounds and a trusted test observer intentionally
simplify custody. No installed owner, lifecycle watcher or migration exists. A
stranded staging file refuses on reopen and requires a future explicit handling
policy; this harness does not erase it automatically.

## Deviations, Deferrals, And Known Gaps

Logical request fields are not native ABI layout/conformance. Native endpoint
failure with no process intent, driver recovery-outcome translation and frame-field
conventions must be reconciled at C5b14B. The eight actual native storage providers,
two native gates, real observation ownership, full driver and native fault/reopen
evidence remain blocked. No C5b13 mocks, existing product stores or ADR statuses
changed. Installed identity, restart process custody, source compliance and guest
execution remain further gates.

## Challenge Points For The Reviewer

Review stale-state detection, bootstrap mutation, file failure classification,
uncertain-handle fencing, monotonic cursors, missing completion, exact replay and
whether tests establish the stated scope. Check source-restoration mutation validity
and evidence freshness. Apply equal skepticism to the plan's deferred ABI contract
and any wording that might be mistaken for native or product admission.
