# Results

## Scoped status

`PASSED` — the deterministic C5b5 compile-only effect-adapter construction and static/model
verification are complete.

Parent C5b controlled execution: `BLOCKED`.

Complete composition, runtime/profile admission, installed composition, and product admission:
`BLOCKED`.

## Observed

- Two independent builds produced byte-identical arm64 Mach-O `MH_OBJECT` files.
- The objects have no entry point or dylib load command.
- Global exports are exactly `c5b5_validate_immutable_profile` and
  `c5b5_translate_controller_actions`.
- Undefined imports are exactly the 13 reviewed libkrun symbols already required by the accepted
  C2B v4 runner call plan.
- Fifteen model vectors cover the complete action mapping, cap/copy ordering, fault teardown,
  absence/cleanup, completion-last durable publication, response-loss replay, fencing, and unknown
  action refusal.
- Nineteen independent immutable-profile mutations refuse, as do an absent profile and an unknown
  action bit.
- The copied C5b3, C5b2, and C5b4 interface/evidence inputs match their pinned byte identities.

## Not observed

No object or dylib was linked, loaded, or executed. No effect implementation was called. No path
was discovered, no process launched, no Hypervisor operation occurred, and no VM or guest existed.
No network target, credential, signing identity, Keychain item, service, installed state, product
state, or admission decision was accessed or changed.

This result proves only deterministic, fail-closed interface translation and static closure. It
does not prove real descriptor behavior, libkrun behavior, transport, teardown, guest absence,
runtime integrity, containment, completion, recovery, or product safety.
