# C5b13 native lifecycle and root custody

Status: local construction, checks and independent review `PASSED`.
Complete C5b guest composition: `BLOCKED`. Publication and canonical pin are parent-owned.

## Scope and ownership

User-visible implementation in the existing orchestrator task; one archive PR
and one canonical checkpoint PR. A fresh read-only sub-agent reviews the result.
Defensively validate Supervisor descriptor handoff, direct-child ownership,
one-shot teardown, terminal/absence observations and unlinked-root cleanup using
only the compiled benign fixture program, deterministic 64-KiB root data,
anonymous pipes and disposable local directories/processes on the owned Mac.
No real runner, runtime, libkrun/HVF, VM, guest, signing identity, Keychain,
installed service, external system or user content may be accessed or executed.

Implement bodies for effects 2, 9–11 and 16–20, composed with a mechanically
derived C5b12 transport module. New fixture registration, attempt, plan, profile
and frames bind the actual fixture executable/root; do not relabel the fixture
as C5b11's VMM or reuse C5b11's approved-byte identities. The test program
validates FDs 0–7, consumes fixed payloads and emits a fixed completion; it does
not evaluate JavaScript or load a backend.

The eight durable-store providers remain absent. Two fixed internal store gates
are deliberately undefined in native provider objects: before spawn (durable
may-exist intent), and before teardown (fenced attempt plus safe resume cursor
17 before effect 16). Local tests supply explicitly test-only acknowledgments and
faults for those gates. Those acknowledgments are not durability evidence and
must not count as store implementation. No callbacks or replacement descriptors,
paths, frames, programs, or backend flags are accepted by provider requests.

## Acceptance and implementation order

1. Produce exact fixture/profile bindings, derive the transport/ABI, and retain
   source provenance. Implement root snapshot, descriptor handoff and nominal
   terminal/absence/cleanup; verify a real benign process round trip.
2. Implement one-shot teardown and same-session reconciliation. Test withheld
   durable acknowledgment, post-spawn response loss, wrong identities/fields,
   extra FD inheritance, timeout, nonzero exit, reaping ownership loss, repeated
   teardown and premature root removal. No signal may target a PID inferred from
   a missing record, `kill(pid, 0)`, or a caller replacement.
3. Reproduce objects, check symbols, run native/instrumented cases and compiled
   source mutations. Freeze exact source/test identities for independent review.
4. Publish archive evidence and pin its immutable source commit in canonical
   Capsule documentation, with completed child scope separate from parent gaps.

## Process and custody contract

One serialized owner and exclusive child reaper per process; reject SIGCHLD
ignore/auto-reap/custom handlers. Remember the creating parent PID. A successful
`posix_spawn` produces the sole direct-child PID; while unreaped it cannot be
recycled. Only `waitpid` for that owned child may establish terminal/absence.
After reap or ownership loss, never signal that PID. A nonzero/ambiguous spawn
return never adopts its output PID. Ambiguity retains unresolved state/root;
the test harness independently contains and cleans its exact fixture process.

Root bytes are digest/length checked, copied into an exclusive local file,
reopened read-only, matched by device/inode, and unlinked after writer closure.
The child receives only that descriptor. Root release requires a retained owned
reap observation, or definite refusal before any spawn was attempted. Ambiguous
close or descriptor replacement refuses instead of certifying removal.

The original transport has a 1,000-ms setup-inclusive deadline. Reconciliation
gets a separate fixed 1,000-ms cleanup budget; neither is an admitted guest
resource promise. Tests have an independent bounded watchdog. Completion validity
and exit/absence/root facts remain separate. Nonzero exit cannot become nominal
success even when completion bytes are valid.

Restart recovery cannot reconstruct child custody from a PID alone: lost
in-memory ownership refuses, preserves unresolved cleanup and requires the
future durable/installed identity owner. These bodies close only same-session
fixture mechanics. They do not establish signed runner identity, same-UID
pathname protection, immutable executable launch, a complete nine-provider
product boundary, or crash-recovery admission. Executable preflight is a
point-in-time digest check inside an exclusively controlled fixture directory;
the installed launch-identity/path race remains a blocker.

## Reuse/dependency policy

- Slice: Supervisor fixed runner lifecycle/root custody; existing ADR-0041
  responsibilities only. No new helper, daemon route or product consumer.
- Reuse rows: OS descriptor APIs and supported `posix_spawn` ADOPT-PLATFORM;
  immutable raw-root custody BUILD-NARROWLY; CommonCrypto APL-6 ADOPT-PLATFORM;
  native instrumented checks TEST-ONLY. No new package or persistence engine.
- Candidate: installed Darwin libSystem, CommonCrypto and Apple clang C17.
  Exact OS/SDK/compiler IDs, source/input/executable/object hashes and imports
  are recorded by verification. No independent builder or OS-source audit claim.
- Primary sources: Apple public SDK headers and XNU/libsyscall POSIX spawn,
  waitpid, signal and fcntl documentation; consulted 2026-09-06. Platform API
  licenses remain Apple's; no upstream implementation code is copied.
- Trust: experiment-only native lifecycle/transport code. Authority: owned local
  child creation/termination and disposable fixture filesystem/FD operations;
  no key, network, update, runtime/backend, or user-content authority.
- Bounds: one attempt/child, exact 64-KiB root, fixed payloads and frame caps,
  FDs 0–7 in child, bounded setup/execution and cleanup windows, no retry queues.
- Failure: no durable acknowledgment means no spawn/signal; uncertain spawn,
  wait ownership loss, replaced root or ambiguous close remains unresolved.
- Construction: offline installed compiler plus retained source/bytes; two
  independent output directories. Fixture variants receive distinct profiles.
- Verification: positive/negative/fault cases, frame and identity bindings,
  sanitizers, restored-invalid source mutations, symbol and material inventory.
- Owner: Capsule maintainer. Recheck OS/SDK/compiler advisories and rerun exact
  corpus on upgrades. No product dependency is admitted; remove by reverting
  this unwired archive slice. Source compliance and installed distribution
  remain in their existing workstreams.
