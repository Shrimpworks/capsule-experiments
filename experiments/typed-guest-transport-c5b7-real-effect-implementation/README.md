# C5b7 compile-only real effect implementation

Status: `PASSED` for the scoped compile-only implementation.

Complete C5b composition and controlled execution: `BLOCKED`.

Product admission: `BLOCKED`.

## Question and result

Can the descriptive C5b5 action plan be implemented as one narrow, directly typed effect layer
without adding loader, path, caller-configuration, store, cleanup, process-launch, or product
authority? Yes, in this no-run scope.

The production result is a deterministic arm64 `MH_OBJECT` with no `main`, dylib load command, or
linkage. It validates the exact C5b5 immutable profile; uses only fixed descriptors, strings,
resource values, frame caps, and libkrun calls; owns context creation/free/consume transitions;
handles partial writes; requires exact `G` plus EOF; stops on the first error; and represents
endpoint, drain, child, teardown, absence, cleanup, durable-store, replay, fence, and stop work only
as closed requests to the owner-supplied harness boundary. The persistent C5b3 controller remains
the ordering authority; the executor accepts each exact controller step independently and retains
no invented cross-call phase state.

The object contains direct unresolved libkrun and Darwin I/O imports. It was compiled and inspected
twice but never linked, loaded, or executed. The separately linked test-double executable resolves
only local deterministic stubs and never resolves or loads libkrun.

## Exact non-composability boundary

This slice preserves C5b5's exact 128 MiB (`134217728`) root profile. The separately constructed
C5b7 runtime root is 96 MiB (`100663296`). A 96 MiB input refuses as `ROOT_IDENTITY`; it is not
silently widened or reinterpreted. The two results are therefore **not composable**. A later
versioned 96-MiB adapter/profile/implementation rebinding is required before any complete composite
can be claimed.

## Defensive scope

No artifact, libkrun, libkrunfw, runtime, HVF, VM, or guest was loaded or executed. No path was
opened or discovered; no root was removed; no process was launched; no durable store was mutated;
no credential, signing identity, Keychain, service, installed state, or product state was accessed.

## Verification

```sh
./scripts/build.sh
node scripts/generate.mjs --check
node scripts/verify.mjs
node scripts/test-mutations.mjs
git diff --check
```

See `RESULTS.md` and `HANDOFF.md` for the retained evidence and limitation boundary.
