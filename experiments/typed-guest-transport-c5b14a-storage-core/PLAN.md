# C5b14A bounded durable provider-state core

Status: storage-core construction and local verification `PASSED`; independent
review/publication `IN_PROGRESS — TRENDING_GOOD`. Native provider integration and complete
storage milestone: `BLOCKED` on later C5b14B composition.

## Assignment and exact scope

User-visible implementation in the current orchestrator task, with an archive PR
and canonical checkpoint PR. Defensively validate durable-before-effect intent,
fencing, safe recovery cursors and immutable completion replay using only this
repository's storage-only fixtures, owned temporary files/directories, and local
Go test subprocesses on the owned Mac. No native runner, guest, backend, signing,
Keychain, installed service, user content or unrelated asset participates.

First coherent increment of the storage milestone: a Go core for the logical
operations behind effects 12–15 and 21–24, before-spawn/before-teardown gates, and
cursor checkpoints for remaining reconciliation steps. It is not a C ABI
implementation or a linked 24-provider driver. C5b13's existing integer gate mocks
remain unchanged until the separately reviewed bridge can bind real observations.
The fixture uses new storage-only plan/profile/attempt identities; no VMM or
C5b13 child execution is inferred from them.

## Decisions and reuse checklist

- Existing registrationstate and completioncomposer stores deliberately encode
  FakeBackend-specific records and evidence. Never reinterpret those records as
  native-child evidence or change their formats for this fixture.
- Reuse their Go standard-library bounded snapshot discipline: exclusive owner,
  strict bounded/canonical decoding, complete temp write, file sync, atomic
  publication, directory sync, indeterminate-handle fence and explicit reopen.
  Storage-only conformance record is not a second selected product database.
- Applicable roadmap rows: Phase 2 fixed snapshot/F1–F5 semantic oracle;
  ownership lock ADOPT-PLATFORM; archive semantics BUILD-NARROWLY; GO-3 standard
  SHA-256; TEST-1 local tests/race. DB-1 SQLite remains SPIKE-FIRST and unadmitted.
- No new package dependency. Exact Go toolchain from Capsule go.mod (1.25.13),
  standard BSD-licensed Go APIs and OS file/lock primitives; record build/OS and
  material hashes. Upgrade/removal owner: Capsule maintainer, rerun exact corpus.
- Existing ADR-0029 retains in-process native front end plus Go authority core;
  ADR-0041 retains Supervisor-owned durable-before-effect responsibility. No
  helper, daemon path, production format, role or admitted authority changes.
- ADR-0040's installed owner/limits/retirement obligations remain future consumer
  gates. This one-attempt fixture has no installed root, rollback defense,
  archive/restore, multi-user, APFS power-loss or external-beta durability claim.

## Ordered increments and acceptance

1. Fixed one-attempt snapshot and exclusive owner: initialize without overwrite,
   open only existing valid state, refuse second owner, corrupt/missing/unknown
   state, bind every byte to fixture identity, and fence uncertain publication.
   Test pre/post publication faults before adding provider transitions.
2. Durable intent and recovery: before-spawn persists may-exist before returning;
   fence exact failure; persist safe cursor 17 before teardown 16; forbid signal
   redrive; checkpoints advance monotonically; unresolved cleanup remains fenced.
   Restart with consumed intent never returns fresh or manufactures child custody.
3. Immutable completion: require bound fixture terminal/absence/root observations,
   commit fixed completion before returning delivery bytes, reject changed replay,
   reopen/replay exact committed bytes after lost response with no effect authority.
   Native observation validation and external delivery remain bridge obligations.
4. Retain focused, race, subprocess/reopen and restoration-mutation evidence;
   fresh independent review; publish archive and immutable canonical checkpoint.

## Interfaces and limits

Constructor receives only an owned test directory; request methods accept typed
identities and closed operation/cursor values, never replacement paths/programs.
One existing owner lock, one live state snapshot, at most one bounded staging file.
Missing live state is never recreated during Open. Unexpected directory entries
or stranded staging state refuse; no automatic deletion or rollback recovery.

Fixture observation values are explicitly supplied by trusted test code. They do
not prove native exit, absence or root cleanup. C5b14B must replace this seam with
a fixed in-process view of C5b13's retained facts, wire all recovery checkpoints,
freeze exact C/Go ownership and build identities, and test the whole driver before
claiming native storage providers. Storage output bytes returned to the test are
not evidence of delivery over an authenticated client channel.

## Observed closure and integration limits

Items 1–3 implemented; item 4 local checks pass (16 top-level tests, 58 subtests,
race/vet/build, two-directory reproduction, nine assertion mutations). Independent
review and publication remain separate closure evidence. Missing completion can
remain durably unresolved at cursor 22 without manufacturing bytes.

Logical requests deliberately are not ABI-compatible: native endpoint failure
without process intent, the driver's recovery-outcome translation, frame-field
conventions and observation ownership must be reconciled and tested in C5b14B.
This increment does not claim full C5b11 oracle or native-provider conformance.
