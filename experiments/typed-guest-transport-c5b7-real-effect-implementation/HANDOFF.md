# C5b7 handoff

Work item: compile-only real C5b effect implementation.

Scoped status: `PASSED`.

Parent C5b controlled composition: `BLOCKED`.

Product admission: `BLOCKED`.

The retained object is an inert effect implementation, not an executable runner or authorization
profile. It directly encodes the exact C5b5 profile, fixed call sequence, strings, FDs, caps,
context lifecycle, bounded writes, authorization byte, and request ordering. Real libkrun and OS
I/O are unresolved in the object; the executed test double cannot resolve real libkrun.

Do not assemble a composite from this object and the C5b7 96-MiB root. The root sizes differ. The
next exact task must create a versioned 96-MiB successor profile, adapter, and implementation,
rebind all immutable component identities, and independently verify the no-run composite. Stop
again for owner authorization before linking/loading libkrun or executing a runtime, HVF, VM, or
guest.
