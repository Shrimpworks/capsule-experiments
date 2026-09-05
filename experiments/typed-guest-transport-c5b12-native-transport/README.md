# C5b12 native transport providers

Status: local transport implementation/checks and independent review `PASSED`.
Parent complete-provider composition and C5b guest
execution: `BLOCKED`.

Question: can seven C5b11 Supervisor transport declarations gain actual bounded
Darwin pipe behavior without introducing replacement inputs or a second backend
owner? This slice supplies effects 1 and 3–8. It adds no lifecycle, root-custody,
durable-store, signing, backend, or guest implementation. See [PLAN.md](PLAN.md)
for ownership of all 24 interfaces and the dependency-policy record.

## Retained source and input identity

`source/transport.c` contains the seven providers, private one-attempt state,
deadline-bound I/O, and one continuous completion/stderr drain. `source/frames.h`
is generated from the exact C5b11 known-answer frames. `inputs/` copies the ABI,
attempt bindings, and three frames from experiments merge
`f206e4ef2cd326ee74e5b7b2739c62efe6da7d6d`; the old archive is unchanged.

The provider object reproduces as SHA-256
`a9e2c80ce273f19869a5ba496248b66ac9244fc504cee9c341973644673376de`.
It exports exactly seven provider symbols and imports the 15 system/compiler
symbols recorded in [verification.json](evidence/verification.json). No libkrun,
spawn, process-kill, filesystem-path, database, crypto, or loader import exists.
Objects and local test executables are built in disposable directories and
removed; no full driver/runner composition is linked or invoked.
The evidence also pins the closed ten-file source/input/test/script inventory.
Ordinary verification refuses changed materials or a different reproduced object;
an intentional source update requires fresh tests and explicit evidence recording.

## Verification

From this experiment directory, with the C5b11 predecessor materialized:

```sh
node scripts/generate.mjs --check
node scripts/verify.mjs
```

Use `node scripts/verify.mjs --record` only when intentionally refreshing local
evidence. Node 22.22.1, Apple clang 21.0.0, macOS 26.6.2 build 25G83, SDK 26.5,
arm64. Observed on 2026-09-05:

- Two unlinked provider builds were byte-identical; exact export/import checks
  passed, and copied ABI/bindings matched the immutable predecessor.
- 39 native cases and the same 39 cases under AddressSanitizer/UBSan passed.
  Cases include exact round trip, all request-field refusals, null requests/results,
  source hash/cap/order refusals, start-before-input and reused-attempt refusal,
  wrong/absent readiness, actual closed pipe and blocked writes, forced EINTR,
  fragmented/zero writes, partial pipe-creation cleanup, malformed/empty/truncated/
  wrong-attempt/trailing completion, stalled completion, excess readiness, stderr
  flood before READY, and cap+1 saturation with continued drain beyond capacity.
- Six deliberate source mutations compiled and failed targeted assertions:
  registration, plan, request cap, payload comparison, trailer-last length, and
  readiness trailing bytes. Compile errors/timeouts are not counted as kills.
- Harness descriptor counts returned to baseline. No runner, libkrun/HVF,
  dylib, VM, guest, signing, Keychain, installation, protected state, or external
  network operation occurred. Only transport source was linked into local tests.

## Limits and next owner

These are actual native transport operations, but only in a fixed local fixture
composition. The peer is a test thread, not the runner or a guest; it accesses
private state through test-only source inclusion. The module has no public setup,
reset, replacement descriptor, frame, path, or callback API. Future lifecycle
implementation must supply reviewed Supervisor-only FD transfer and close parent
peer copies; this slice does not claim that composition exists.

One serialized caller and one attempt per process are assumptions. Reopening,
durable cursors, fencing and cancellation are absent. Post-start failure cleanup
in these tests is harness-owned; only partial endpoint-creation cleanup is a
provider implementation. Ambiguous `close` consumes its FD slot and refuses;
authoritative reconciliation remains another owner, and close-error injection
has not been tested. No ASan result proves absence of races or OS/kernel bugs.

The fixed 1,000-ms transport budget begins at endpoint creation, including setup;
it is stricter than and does not establish the approved guest execution deadline.
Completion validation accepts only the exact retained 259-byte known answer,
including header, payload, digest, and final trailer. It neither implements a
general canonical JSON parser nor proves that any guest executed. EOF, readiness,
and valid completion never yield lifecycle, absence, root-removal, or durable
success facts. The remaining 17 provider symbols are genuinely unresolved.

Next: fixed runner lifecycle and immutable-root custody, composed with durable
attempt/recovery storage; then independently reviewed complete immutable bytes.
Cross-host reproduction, kernel preferred-form source compliance, installed
identity/protected-state composition, separate exact guest authorization and all
runtime/profile/product admission remain `BLOCKED`.
