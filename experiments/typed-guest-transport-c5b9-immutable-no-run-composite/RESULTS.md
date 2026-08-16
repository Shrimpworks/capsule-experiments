# C5b9 results

Status: `PASSED` for the exact immutable no-run composition scope.

The packet binds six exact retained component roles: host runner, libkrun, libkrunfw, the
100,663,296-byte C5b7 root, the pure C5b3 controller object, and the C5b8 root-bound effect object.
Static inspection proves that the controller supplies both required controller functions, the
runner and effect layer require the same 13 libkrun symbols, and the retained libkrun exports cover
them. The accepted ADR-0041 role remains unchanged: libkrunfw is the sole boot-kernel carrier and
separate firmware is inapplicable.

One undefined symbol remains deliberately and visibly blocked: `_c5b8_controlled_test_operation`.
It has no provider in this packet. Binding a repository test double would fabricate runnable
authority, while a real provider belongs only to the later separately authorized harness.

The no-run plan retains exact source/input frames and a fresh deterministic completion fixture with
the frozen 262,144-byte payload cap, physical caps, completion-last trailer, and ordered
child-tree/runner/root/durable-commit/delivery boundary. Host, guest, and authorization identifiers
remain null; every effect is false. The lost v19/v27 bytes remain unavailable and their identities
are not reused.

All predecessor verifiers, nine unit tests, the closed archive inventory, and fourteen adversarial
mutations pass. No component byte is duplicated into this packet.

This result does not show that any dylib loads, a runner starts, HVF works, a guest boots, transport
survives faults, teardown succeeds on a real process tree, or product admission is warranted.
