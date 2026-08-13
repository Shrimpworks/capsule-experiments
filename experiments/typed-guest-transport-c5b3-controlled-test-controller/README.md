# C5b3 deterministic no-run controlled-test controller

Date: 2026-08-13

Scoped controller construction: `PASSED`

Complete executable successor and controlled C5b execution: `BLOCKED`

Runtime/profile and product admission: `BLOCKED`

## Question

Can Capsule retain a reviewed controller state machine for the exact C5b copy, cap-plus-one,
stall/reset/cancel, response-loss, completion-last, process-fault, teardown, authoritative-absence,
and cleanup obligations without creating a runnable composition or activating libkrun/HVF/a guest?

Yes in this pure no-run scope. The packet retains complete C source and two byte-equal arm64 Mach-O
relocatable objects. They have no entry point, imports, effect adapter, authorization profile, or
runnable composition. The object can request abstract actions only; it cannot perform them.

## Defensive boundary

This experiment is defensive, local-only, deterministic, and construction-only. It is rooted at
`capsule-experiments` commit `5a2f835e8c9df8279237f940f5af757e119593bd` and the accepted passive
C5a contract at Capsule commit `22acf665797e248028c2625586322f698bc2ba74`.

No controller object was linked or executed. No libkrun or libkrunfw byte was loaded, no Hypervisor
API was called, no runner/process/VM/guest was started, and no network, credential, Keychain,
service, signature, installed state, product state, or admission state was accessed or changed.

## Retained packet

- `source/` contains the dependency-free pure C17 state machine.
- `dist/` contains two independently built, byte-equal arm64 `MH_OBJECT` files.
- `contracts/controller-contract.json` freezes fixed paths, caps, states, events, facts, actions,
  fault handling, completion-last, response-loss, cleanup, and the absent future-adapter boundary.
- `fixtures/state-vectors.json` retains 20 ordered success/fault/replay/cleanup cases.
- `scripts/test-state-machine.mjs` runs only a JS test double; it never loads the C object.
- `scripts/verify.mjs` independently validates closed maps, source/artifact identities, raw Mach-O
  shape and zero imports, the state vectors, evidence, and archive inventory.
- `scripts/test-mutations.mjs` proves nine semantic/archive mutations refuse.
- `manifests/controller-profile.json` keeps every missing runtime/composition/authorization input
  explicit instead of guessing bytes.

## Verification

```sh
sh scripts/build.sh
node scripts/generate.mjs --check
node scripts/test-state-machine.mjs
node scripts/verify.mjs
node scripts/test-mutations.mjs
git diff --check
```

See [RESULTS.md](RESULTS.md) and [HANDOFF.md](HANDOFF.md) before any later composition work.
