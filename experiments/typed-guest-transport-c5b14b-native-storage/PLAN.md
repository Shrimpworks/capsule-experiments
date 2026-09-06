# C5b14B native durable-owner integration

Status: `IN_PROGRESS — TRENDING_GOOD`. Installed boundary, actual guest execution
and product admission remain `BLOCKED`.

## Assignment and authorized defensive scope

User-visible retained implementation owned by this orchestrator; archive branch
`codex/c5b14b-native-storage` and canonical branch `codex/c5b14b-checkpoint`.
Defensively validate durable-before-effect gates, native observation binding and
recovery/replay using only this archive's fixed benign child, anonymous pipes,
64-KiB deterministic root, Go/C local test processes and owned disposable directories
on the owned Darwin/arm64 Mac. No guest, interpreter, libkrun/HVF, installed service,
signing, Keychain, user content, PID adoption or unrelated target participates.

## Contract and ordered acceptance

1. Bind the native front end to one in-process Go owner. Freeze copied scalar ABI
   fields and exact fixture identities; no retained cross-language pointers or
   daemon authority. Prove the native reaper's SIGCHLD precondition with Go linked.
   Persist spawn intent through the actual C gate before the sole fixed spawn.
2. Complete eight storage provider bodies (12–15, 21–24), teardown gate and
   checkpoints 17–20. Native private retained terminal/absence/root/completion
   facts supply completion evidence; no caller-supplied observation setter.
   Normalize recovery uncertainty conservatively, never upgrade certainty. Record
   pre-process endpoint failure as permanently unresolved, never fresh state.
3. Link a fixture-specific descendant of the registration-only 24-provider driver.
   Exercise nominal completion, failure cleanup, pre/post-publication faults,
   lost responses, reopen and exact stored replay. Assert no spawn/signal redrive;
   restart without same-session custody retains unresolved state and performs no
   PID-based recovery. Keep child containment and test deadlines bounded.
4. Retain ordinary/race/native-sanitizer evidence where supported, exact material
   and import/export identities, reproducible builds and compiled restoration
   mutations. Fresh independent review (at most three instances), archive PR and
   canonical checkpoint pinned to an immutable commit.

## Reuse and dependency-policy checklist

Input commits: C5b13 `6dc12dca10c9cb88370bf3f16d0e3d6305b7fd7f`; C5b14A
`c4d25e2beec0bc2e886a1df29135dea534b53626`. Original paths/hashes are retained in
`inputs/source-origins.json`; previous experiments remain unchanged.

Reuse map: fixed-snapshot semantic oracle/F1–F5, GO-3 standard SHA-256, TEST-1 Go
and fault tests, ADOPT-PLATFORM Darwin owner lock/process primitives, narrowly built
archive composition. No new package dependency or production DB selection. Go
1.25.13 stdlib/cgo (BSD), Apple clang/SDK and CommonCrypto already underpin retained
inputs. Exact versions, source/build hashes, faults and removal/reproduction are
consuming checks here. Maintainer owns upgrades/removal and reruns this corpus.

ADR-0029 retains one native-fronted Go owner; ADR-0041 retains Supervisor lifecycle
responsibility. No new role, privileged helper, daemon path, authority API or product
format. ADR-0040 admission limits and ADR-0042 product transaction selection remain
unchanged. Fixture snapshot identities/schema must distinguish these native facts
from C5b14A test testimony and existing FakeBackend records.

## Limits and evidence boundaries

One trusted exclusive fixture directory, one registered attempt and serialized
native caller. The bridge verifies exact native fields before translating them to
the bounded Go store. Reopen is existing-state only; unknown/corrupt/orphan state
refuses. No filesystem rollback/restore, power-loss, installed identity, hostile
same-UID pathname race or authenticated client delivery claim. A copied test return
can prove exact stored bytes, not external delivery. New fixture profile/plan/frames
must bind the actual benign executable and bridge/store source identities. Separate
review and exact authorization remain prerequisites for any later guest attempt.

## First observed compatibility result

`PASSED`: a native C entry point linked with Go 1.25.13 `-buildmode=c-archive`
preserves the default SIGCHLD reaper precondition. The Go-main entry-point candidate
with unchanged lifecycle checks is `NO_GO`: its runtime installs an asynchronous
handler. No handler is reset or bypassed. This selects the already planned native
front end with in-process Go library. The installed Go source `src/os/signal/doc.go`
("Non-Go programs that call Go code") documents this distinction; the retained
probe and exact local compile/run corroborate it. No process reaping was delegated.

## Integration checkpoint

`PASSED`: native C front end and Go archive complete the nominal 24-provider benign
flow and replay after owner reopen. All eight native store bodies, the two durable
gates and checkpoints 17–20 are linked. Go copies scalar requests and completion
bytes synchronously; private native state supplies observations. Snapshot keys and
frames derive from the generated C5b14B fixture profile, not C5b14A's isolated test
identity. The native provider keeps its phase separate from storage cursor replies.

Recovery failures are conservatively normalized to indeterminate. Endpoint failure
before a process intent retains failure 1 / cursor 21 as permanently unresolved;
the derived driver recognizes that terminal refusal without retrying endpoints.
Missing completion stays unresolved at 22. Native lifecycle custody is never
reconstructed from the store; a restarted process with consumed intent refuses
native reconciliation and retains unresolved state without PID probing or signaling.

Observed first corpus includes ordinary completion/replay, three spawn publication
faults, three completion faults, endpoint failure, lost wait/spawn response, lost
completion/delivery response, three teardown faults, normal timeout cleanup,
nonzero-exit refusal, native observation/binding refusals and abrupt-process reopen.
Full retained corpus, reproduction and restoration mutations `PASSED`: 126 native
case records, 17 Go suites / 58 subtests, eight Go-race integration cases and ten
compiled intended-assertion mutations. Independent review and publication remain
`IN_PROGRESS — TRENDING_GOOD`.


## Reproduction metadata

Initial two-directory comparison found identical archive member bytes but different
Darwin ar timestamps/owner metadata and Mach-O object-symbol archive paths. Normal
builds now set `ZERO_AR_DATE=1` and normalize linker `-oso_prefix` against the
physical output directory (including macOS `/tmp` and `/var` aliases); Go retains
`-trimpath`, disabled VCS embedding and an empty build ID. A focused two-directory
check reproduces both the Go archive and linked native executable. No debug code,
reaper check, validation guard or runtime behavior was removed to obtain equality.
Full exact-material evidence is regenerated after this build correction.

## Setup-refusal diagnostic limitation

One pre-freeze full run refused in case 20 nominal setup before the intended
root-observation mutation. Earlier output did not identify the step or remaining
time, so cause is unclassified. The next full corpus passed with per-step/deadline
diagnostics added. Preserve the existing one-second setup and cleanup limits,
four-second child alarm and no-retry verifier; make no timing/load-tolerance claim.
Compiled mutations now require each named intended assertion, so an unrelated
setup refusal cannot falsely count as mutation sensitivity.

A focused repetition of case 20 using the diagnostic-enabled ordinary binary
completed 30/30 fresh-directory runs with no refusal. This narrows no root cause
and does not erase the earlier failed run. The full verifier remains fail-fast.
