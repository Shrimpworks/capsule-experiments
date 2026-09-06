# C5b13 native lifecycle fixture checkpoint

Date: 2026-09-05 (verification continued September 6 UTC).

Status: local native construction, fixture lifecycle and fault checks `PASSED`.
Independent review: `PASSED` / `Ready` (review instance 2 of 3).
Complete nine-provider product lifecycle, durable storage, guest composition,
installed identity and product admission: `BLOCKED`.

## Question and result

Can the Supervisor's private transport state hand fixed descriptors to one real
benign child, keep direct-child custody, distinguish completion from successful
termination, and refuse uncertain teardown/root removal?

The local fixture passes. `source/lifecycle.c` implements effects 2, 9–11 and
16–20 with the seven mechanically derived C5b12 transport bodies. The native
object exports exactly 16 providers and imports exactly two still-undefined
store gates plus the closed Darwin/CommonCrypto/compiler surface recorded in
`evidence/verification.json`. There is no linked 24-provider registration driver
or durable implementation. The retained C5b11 ABI/driver inputs are provenance;
only the ABI and transport are derived for this fixture. No original experiment
bytes or approved VMM identities are changed.

| Effects | Observed local behavior | Limit |
| --- | --- | --- |
| 2 | Fixed executable/root hashes; read-only unlinked 64-KiB copy; private peers mapped to FDs 0–7; empty spawn environment; no inherited extra test FD | Executable digest is point-in-time in an exclusive fixture directory, not signed or immutable installed launch |
| 9–11 | Exact owned child reaped; nominal exit zero required; absence receipt precedes descriptor/root release | Direct benign child only; no descendant/process-tree or guest-resource absence proof |
| 16–17 | Store acknowledgment before one-shot SIGKILL; persist-cursor contract 17 before effect 16; repeated request never signals again; reconcile owned reap | Store acknowledgment is a test mock; restart custody cannot be reconstructed |
| 18–20 | Same-session terminal/absence/root receipts; uncertainty withholds facts; verified root-removal receipt is idempotent | No installed or crash-recovery admission |

The owner accepts only fixed ABI identities, effects and recovery fields. It
rejects child-custody loss, a non-default/auto-reaping SIGCHLD disposition, calls
from a forked owner, mismatched identities/cursors, replaced root descriptors and
ambiguous close. A failing spawn status never supplies usable PID authority.
Tests inject post-effect response loss beyond the documented ordinary spawn
error contract and independently contain that exact fixture child.

Before any attempted spawn, a definite refusal can reconcile to the no-child,
no-root state. In that case the terminal fact means no outstanding child, not an
observed exit. After attempted spawn, terminal/absence require the retained
exclusive waitpid receipt; uncertainty remains unresolved. Completion bytes do
not establish exit zero, absence, cleanup or durable delivery.

## Verification

Run on the owned arm64 Mac with installed Apple clang/CommonCrypto and Node 22+:

```sh
node scripts/verify.mjs
```

`--record` deliberately refreshes retained evidence after an implementation
change; ordinary verification rejects source/test/script/input and generated
material drift. Four separately compiled benign variants have distinct exact
executable/profile/plan/frame identities: normal, pre-ready wait, valid completion
then exit 23, and corrupted completion. The runner only validates descriptors and
fixed data; no interpreter, runtime, libkrun/HVF, VM, guest, network or credentials.
Its own four-second alarm bounds containment if a test parent aborts. Parent
watchdog is five seconds; setup and cleanup budgets are each fixed at one second.
These are fixture bounds, not an admitted guest timing policy.

Two separate build directories reproduce each executable, provider object,
profile, plan, frame, binding header and generated source byte-for-byte. Native
and ASan/UBSan parent tests run the same four ordinary child artifacts. Children
are not sanitizer-instrumented. Verification freezes all 16 exports and the full
import list. No cross-host reproduction or independent toolchain audit is claimed.

27 native and 27 ASan/UBSan cases cover:

- normal FD/root/protocol/terminal/absence cleanup and descriptor-count restoration;
- withheld spawn/teardown store acknowledgments and a spawn gate exceeding deadline;
- pre-ready timeout, corrupted completion, and valid completion followed by exit 23;
- post-spawn response loss, lost reaper ownership and lost signal acknowledgment;
- repeated teardown, premature root release and idempotent cleanup receipt;
- replaced root FD, ambiguous root close, wrong registration/attempt/safe cursor;
- ambiguous SOURCE/START writer close, including a retained-open FD: no retry or cleanup receipt;
- inherited extra FD, forked owner, SIGCHLD ignore, mismatched root/executable;
- recovery with no surviving in-memory custody.

Nine compiled mutations restore invalid spawn/teardown gate bypasses,
registration/cursor bypasses, root-before-absence, nonzero-exit acceptance,
signal-after-reap and a post-store deadline bypass. Each must fail an assertion;
compile failure or timeout is never a successful mutation kill. The test signal
wrapper refuses a signal after the fixture's reap before calling the real OS API.

## Provenance and reuse

- C5b12 source: archive accepted merge `ad5217fc17b97b3c3cac44d383e6b296c111d310`,
  reviewed source `0e83da32657a0190a7efd17ce203acf3503c905b`,
  `experiments/typed-guest-transport-c5b12-native-transport/source/transport.c`.
- C5b11 ABI, driver and payloads: archive merge
  `f206e4ef2cd326ee74e5b7b2739c62efe6da7d6d`,
  `experiments/typed-guest-transport-c5b11-bound-fault-convergent-no-run-successor/`.
- `scripts/generate.mjs` retains the explicit derivation: new C5b13 namespace and
  fixture identities; owner PID check; readiness requires actual spawn stage;
  recovery results echo their bound cursor fields; shared close uncertainty survives consumed slots. The payload generator builds
  the child before hashing it into profile/plan/frames, avoiding circular bindings.
- The plan retains the dependency-policy checklist: OS descriptor/process APIs
  and CommonCrypto reused; narrowly built root custody; no package or database
  dependency, new privileged helper, daemon bypass or new Supervisor role.

Primary references: Apple's [spawn contract](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/posix_spawn.2.html),
[wait contract](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/wait.2.html),
and installed public `spawn.h`, `sys/spawn.h`, `sys/wait.h`, `sys/fcntl.h` and
`sys/signal.h` from the SDK version recorded in evidence. Public headers define
`POSIX_SPAWN_CLOEXEC_DEFAULT`; child FD checks exercise it on this host.

## Next decision

Retain these experiment-only same-session mechanics as an input to the durable
attempt/completion owner. Its eight providers and the two fixed internal gates
must implement durable-before-effect records, fencing, unresolved cleanup,
completion-before-delivery and restart replay before full composition. Installed
runner identity/path custody, restart process identity, approved timing,
preferred-form kernel/libkrunfw source compliance, raw v19/v27 evidence recovery,
and complete immutable composition review remain separate blockers. No guest
execution or product admission follows from this checkpoint.

Canonical decision: `capsule-corp/docs/C5B_NATIVE_LIFECYCLE_PROVIDER_CHECKPOINT.md`
(published by the parent task with an immutable archive source/evidence link).
