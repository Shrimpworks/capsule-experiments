# C5b5 compile-only effect adapter

This archive defensively constructs the smallest deterministic bridge between the pure C5b3
controller action contract and the exact reviewed C2B v4 libkrun call surface. It is a
user-visible research/experiment implementation task, not product code.

The scoped construction is `PASSED`. Complete executable composition, controlled C5b execution,
runtime/profile admission, installed composition, and product admission remain `BLOCKED`.

## Immutable inputs

- Capsule contract commit `22acf665797e248028c2625586322f698bc2ba74`, with Accepted
  ADR-0040, ADR-0041, and ADR-0046.
- C5b3 controller commit `d3020c660c98efebe45f213ed1591220c70c180f`. Only its exact
  controller contract and header are copied; their byte identities are independently checked.
- Accepted experiments baseline `5a2f835e8c9df8279237f940f5af757e119593bd`. Only the exact
  C2B v4 `libkrun.h` and static Mach-O inspection are copied. The accepted libkrun artifact is
  pinned at SHA-256 `055d9d18dc964fec4aba21948c4a344cb7a51cb48a2c70017484b718eae12f9f`.
- C5b4 recovery commit `ea2aa55130fb105c6b283cf24454c1efbf5b9680`. Its recovery and
  static inspection records pin libkrunfw SHA-256
  `0b14f4b8005dafd33c38df5935b9efdb6381c724224b3967ba1cecbecf10b6e9` as the sole runtime
  boot-kernel carrier. The 24 MiB dylib is not copied or loaded here.

The commits are provenance pins, not Git ancestry requirements. The copied interface files must
match their named source bytes exactly.

## Adapter boundary

`source/effect_adapter.c` produces an arm64 Mach-O `MH_OBJECT` with no entry point. It:

- fails closed when the immutable profile is absent or any controller, header, dylib, descriptor,
  cap, root, or resource binding differs;
- translates all C5b3 action bits into a closed ordered description;
- freezes root FD 4, source/input/completion FDs 5/6/7, close-from 8, launcher FDs 3/4/5,
  one vCPU, 256 MiB, the 128 MiB root, transport caps, exact port roles, and `R`/`G` handshake;
- retains exactly 13 reviewed undefined libkrun symbols for static ABI inspection; and
- exports only profile validation and action translation.

Translation never invokes an operation. The output explicitly says execution is unauthorized.
There is no operations implementation, path discovery, dynamic loading, runtime library link,
process launch, Hypervisor call, VM/guest action, authorization profile, or caller configuration.

## Verification

```sh
scripts/build.sh
node scripts/generate.mjs --check
node scripts/test-model.mjs
node scripts/test-mutations.mjs
node scripts/verify.mjs
git diff --check
```

The build makes two byte-identical relocatable objects. The Node model and verifier independently
check action ordering, fault convergence, response-loss replay, completion-last publication,
profile mutation refusal, exact imports/exports, Mach-O load-command absence, and closed archive
identity. No adapter object or prerequisite dylib is linked, loaded, or executed.

## Stop boundary

Do not turn this object into a runnable composition. A successor still needs retained governed
`deno_core` executable bytes, a rebuilt runtime root, an exact composite manifest, an independently
reviewed effect implementation, and a separately owner-authorized run profile. That later task
must reverify every immutable input and stop before execution unless the exact owned host, guest,
fixture, process names, mutations, cleanup, and evidence destination are authorized.
