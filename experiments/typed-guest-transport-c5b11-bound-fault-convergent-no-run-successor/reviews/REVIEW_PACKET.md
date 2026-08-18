# C5b11 C5b-S1B fresh independent-review packet

Review status: `PENDING`. Review must use a brand-new context/worktree at the exact draft-PR head.
Do not inherit conclusions from C5b-S3 head `d4a805ab6fc6fb700d06f57896a2775680755d0f`.

## Required questions

1. Does the attempt profile bind the exact runner source/object, libkrun/libkrunfw/root, governed
   runtime executable and snapshot, C5b7 profile/archive identity, and C5b6 provenance/SBOM/notice
   inputs? Does every frame/effect carry its derived digest rather than stale C5b8 digest `06079eea…`?
2. Is the layering non-self-referential: attempt profile excludes the driver, while the outer
   immutable profile binds driver source/object/ABI/generated bindings and the complete packet?
3. Before spawn, does source enter process-may-exist? Does every provider error, `INDETERMINATE`,
   echo/fact mismatch, and unproven `NOT_APPLIED` converge without spawn/teardown redrive through
   fence/reopen, teardown reconciliation, terminal join, authoritative absence, and root cleanup—or
   retain durable unresolved ambiguity?
4. Is the recovery oracle genuinely independent of candidate generator constants? Does it cross all
   13 nominal effects and 11 recovery steps with all five failure kinds, plus ambiguous spawn,
   interruption/reopen/resume, and teardown outcomes? Would it reject the former spawn bypass?
5. Do Clang AST checks establish the key state/call structure, and are remaining source/verifier/tool
   trust assumptions described without claiming real provider/platform exhaustiveness?
6. Are all 21 completion fields independently parsed and mutated? Do driver source/object and each
   runtime/snapshot/root/provenance/SBOM/notice binding refuse substitution?
7. Are C5b4 preferred-form source/distribution compliance and all provider, cross-host, installed,
   runtime/profile, and product admission states still explicitly `BLOCKED`?
8. Do sole-libkrun-owner, registration-only entry, fixed-byte authority, caps, completion-last,
   closed inventory, C5b10 immutability, and total no-run properties remain exact?

## Review commands

```sh
./scripts/build.sh
node scripts/generate-bindings.mjs --check
node scripts/generate.mjs --check
node --test scripts/verify-profile.test.mjs
node scripts/verify.mjs
node scripts/test-mutations.mjs
git diff --check
```

Independently parse frames, inspect both objects statically, recompute all binding digests, compare
the candidate matrix against the retained literal oracle, inspect the Clang AST checks, and confirm
all 69 restored-invalid mutations exercise the claimed properties. Verify C5b10 `6eb0301…` and
C5b11 review head `d4a805a…` remain ancestors and unchanged.

Return `PASSED`, `BLOCKED`, or `NO_GO` for the exact new C5b11 head, separately state parent C5b and
admission status, and report all trusted inputs/limitations. Do not link/load/execute any object or
dylib, call libkrun/HVF, start a runner/VM/guest, touch credentials/services/product state, or request
execution authorization.
