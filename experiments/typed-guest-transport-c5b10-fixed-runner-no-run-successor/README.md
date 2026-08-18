# C5b10 fixed-runner no-run successor

Scoped status: `PASSED` for this exact immutable construction/static-verification slice.

Parent C5b controlled execution: `BLOCKED`.

Runtime/profile admission and product admission: `BLOCKED`.

## Question

Can one versioned no-run successor resolve all four contradictions retained by the C5b
compatibility preflight at capsule-experiments merge
`7fc3af9c46895b340c3118a96cb50abb26b1d977` while preserving one fixed host-runner process as the
sole libkrun owner and limiting the Execution Supervisor to closed process, transport, lifecycle,
absence, cleanup, commit, and delivery effects?

## Defensive intent and authorized scope

This experiment defensively validates Capsule's single-libkrun-owner and Supervisor effect boundary
using only source, deterministic arm64 object construction, static symbol inspection, retained
fixtures, and restored-invalid mutations in the owner-controlled
`Shrimpworks/capsule-experiments` repository clone. The exact experiment base is
`7fc3af9c46895b340c3118a96cb50abb26b1d977`; the canonical Capsule context is
`748fd0ef7a8fbf81a5c80f099c7592b88369d684`.

No native candidate artifact is linked, loaded, invoked, or mutated. No libkrun or libkrunfw dylib
is loaded; no Hypervisor.framework call, runner, process effect, VM, guest, network target,
credential, Keychain item, signing identity, installed service, product state, or product consumer
is accessed or changed. Host, guest, execution authorization, and every performed-effect field are
explicitly absent in the immutable packet.

## Exact construction

- `source/fixed_runner.c` is a new fixed runner source. It binds the exact 100,663,296-byte C5b7
  root at SHA-256 `5ad18f20cbc97c7a70ead3e795fd3649672513323041e913b0eb55b7acc88775`,
  accepts only descriptors 0 through 7, creates the closed libkrun configuration, writes one `R`
  ready byte, requires exact `G` plus EOF, and only then enters libkrun.
- `source/supervisor_effect_driver.c` accepts only the fixed registration ID. It calls thirteen
  distinct nominal Supervisor provider symbols in fixed order and one fault-only teardown symbol.
  Each request/result is attempt-, registration-, plan-, profile-, sequence-, and effect-bound.
- `source/supervisor_effect_abi.h` exposes no callback, function pointer, host path, flag, image,
  mount, backend configuration, environment, argv, or executable-byte field.
- `dist/fixed-runner.o` and `dist/supervisor-effect-driver.o` are deterministic unlinked Mach-O
  arm64 objects built twice and compared byte-for-byte. Only the runner object imports libkrun.
- Source, input, and completion fixtures preserve the exact C5b8/C5b9 attempt bindings. The
  completion verifier proves the 64-byte `CPEND001` trailer is last.

The fourteen provider implementations are intentionally absent. That is the no-run boundary: this
packet closes the versioned ABI and ownership contradiction without becoming an executable harness.

## Four resolved contradictions

1. Runner/root byte identity: the new runner source/object binds the exact C5b7 root; the
   historical 134,217,728-byte root and digest are rejected and absent from the runner source.
2. Effect sequencing: source and input frames are bounded and written at effects 4 and 5, their
   writers close at 6, and the start byte is effect 7. Completion validation, terminal join,
   authoritative absence, fixed-root removal, durable commit, and stored delivery follow in that
   order.
3. Per-effect ABI: fourteen distinct typed Supervisor-owned symbols replace the historical single
   `_c5b8_controlled_test_operation` port. The fixed runner neither exports nor imports that ABI.
4. Duplicate libkrun ownership: the runner object alone imports the exact thirteen libkrun
   symbols. The Supervisor driver imports none, and the historical root-bound effect object is not
   linked into the successor.

## Verification

Run only these construction/static checks:

```sh
./scripts/build.sh
node scripts/generate.mjs --check
node --test scripts/verify-profile.test.mjs
node scripts/verify.mjs
node scripts/test-mutations.mjs
git diff --check
```

`build.sh` compiles unlinked objects only. `verify.mjs` uses hashes, parsers, source checks, `nm`,
and the static predecessor verifiers. `test-mutations.mjs` mutates disposable metadata copies and
reverifies the unchanged original after every case; it never mutates or invokes a native candidate.

## Observed result and inference

Observed: deterministic objects, exact root constants, closed object import/export surfaces,
thirteen nominal effects plus fault teardown, frame caps, completion-last framing, closed archive
inventory, and seventeen restored-invalid mutation refusals verify independently.

Inference: these static facts are sufficient to replace the incompatible direct-provider candidate
with a reviewable fixed-runner successor design. They do not prove any provider, platform effect,
completion claim, process-tree teardown, authoritative absence mechanism, libkrun/HVF behavior,
guest behavior, installed composition, or product security control.

## Replacement condition

Retain this experiment as immutable evidence until a separately reviewed and separately authorized
successor binds exact Supervisor provider implementations and a final execution manifest, then
collects real process/transport/completion/terminal/absence/cleanup evidence without changing these
historical bytes. Any different runner, root, ABI, ordering, provider, descriptor topology, cap,
or authorization requires another version.
