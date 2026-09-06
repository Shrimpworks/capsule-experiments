# C5b14A storage-only durable provider-state core

Local storage construction and verification: `PASSED`.
Independent review is recorded separately in `review/`; this source summary does
not supply its own readiness verdict.
Parent native durable owner and complete 24-provider composition: `BLOCKED`.

Question: can a bounded Go state owner persist intent and safe recovery cursors,
refuse uncertain state, and replay immutable completion after local process loss?
This is the first storage increment after C5b13. It supplies logical storage
operations, not the eight native C provider bodies or their linked driver.

## Exact defensive scope

Only this module, fixed storage fixture bytes, owned disposable directories and
Go test subprocesses on the owned Darwin/arm64 Mac participate. Fixture IDs derive
from explicit C5b14A storage-only strings. Completion is fixed JSON, not VMM output.
No native child runner, guest, backend, signing, Keychain, installed service, user
content or unrelated asset is accessed. Capsule product code must not import this
experiment. See PLAN.md for requirements, reuse decisions and consumer gates.

## State and control flow

`Initialize` is trusted test bootstrap into an empty owner-only directory. `Open`
requires exactly an existing owner lock and canonical bounded snapshot. A flock
permits one owner. Every request checks fixture identities, exact logical operation
fields, retained snapshot bytes and inode/lock/directory identity. Unknown entries,
missing/corrupt state and orphan staging refuse; they are never repaired into fresh
state. No path, replacement program, PID or guest authority enters a request.

`BeforeSpawn` publishes consumed intent before returning. `Fence` and `LookupFenced`
retain failed-attempt state. `BeforeTeardown` publishes step 16 / resume 17 before
returning once. Steps 17–20 persist observation intent without certifying outcomes.
`RecordUnresolved` retains uncertainty, including a missing completion at step 22.
A consumed intent reopened without completion becomes unresolved at resume 17;
existing completion reopens at 22 and replays at 23 without spawning or recommitting.

`CommitCompletion` requires exact bound trusted fixture terminal/absence/root
observation values. These booleans are test testimony, not an OS observer. Complete
fixed bytes, SHA-256 and the storage-only observation scope are published together.
`Deliver` and `Replay` return defensive copies. Returned bytes prove no external
client-channel delivery. Failure before publication removes only owned staging and
returns aborted. Uncertainty after publication fences the handle until reopen.

## Verification

Use Go 1.25.13, Node 22 or newer, Darwin/arm64:

```sh
node scripts/verify.mjs
```

First evidence generation or reviewed material updates use `--record`. Ordinary
verification refuses stale material hashes before running tests. It runs ordinary
and race tests, vet/build, two-directory trimmed test-binary reproduction, and
compiled restoration mutations whose intended test must fail by assertion. It
retains test names, source/plan/verifier hashes, tool versions and mutation findings
in `evidence/results.json`. No binary or mutable test directory is archived.

Retained run: 16 top-level tests and 58 named subtests, ordinary and race suites,
vet/build, two identical trimmed test binaries, and nine compiled assertion
mutations. Test counts include their parent suites and are not independent
security controls.

Tests cover publication boundaries across all 13 mutating operation routes,
process exits before/after publication, orphan staging refusal, intent consumption,
teardown non-redrive, completion-before-return, immutable replay, owner/identity
loss, strict canonical decoding, missing/corrupt state and concurrent copied reads.
The process-exit cases are abrupt `os.Exit(73)` fixtures, not power-loss tests.

## Limits and next gate

This is a one-attempt conformance oracle (4-KiB snapshot cap, generation at most 32),
not the selected product store, a performance result or ADR-0040 admission. File and
directory sync calls run locally; injected edge errors do not simulate every OS
syscall failure or establish APFS power-loss durability. A trusted exclusive test
root is required; pathname checks do not resist a concurrent same-UID adversary,
restore/rollback, alternate hardlink aliases or a privileged attacker. Identity
checks detect tested substitutions; they do not close every pathname race.

C5b14B must bind C5b13's private retained observations to the Go owner, implement the
actual eight C providers and two gates, reconcile logical request/ABI differences
(including no-process endpoint failure and recovery outcome translation), wire all
cursor checkpoints, and verify the whole benign driver with independent native
fault/reopen evidence. The existing C5b13 mocks remain non-durable. Installed launch
identity, restart process custody, timing/provenance and separately authorized guest
execution remain further gates. No ADR lifecycle or product/control claim changes.
