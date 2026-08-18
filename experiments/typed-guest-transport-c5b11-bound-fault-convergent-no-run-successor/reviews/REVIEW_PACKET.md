# C5b11 fresh independent-review packet

Review status: `PENDING`. Review must use a fresh-context task/worktree at the exact draft-PR head.

## Required questions

1. Does `contracts/attempt-runtime-profile.json` bind the exact selected runner object/source,
   libkrun, libkrunfw, and runtime root, and do all three frames plus every effect echo carry its
   derived digest rather than C5b8 digest `06079eea…`?
2. Is the layering non-self-referential: attempt profile excludes the driver, while the outer
   immutable profile binds driver source/object/ABI/generated bindings and the entire packet?
3. For every post-creation provider error, `NOT_APPLIED`, `INDETERMINATE`, echo mismatch, and fact
   mismatch, does recovery fence/reopen, avoid redrive, request teardown once, reconcile teardown,
   join terminal state, prove authoritative absence, and only then remove the root?
4. Does every interrupted recovery retain durable unresolved cleanup, and do commit/delivery
   response-loss cases reopen and replay the identical stored completion without recommit or rerun?
5. Are the sole-libkrun-owner, registration-only entry, fixed-byte authority, cap,
   completion-last, closed-inventory, and no-run properties still exact?

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

Independently parse every frame field, inspect both objects with static tooling only, recompute both
binding digests, inspect all reconciliation matrix cases, and confirm all 38 mutations target the
claimed properties. Verify C5b10 commit `6eb0301…` is unchanged and explicitly not accepted evidence.

Return `PASSED`, `BLOCKED`, or `NO_GO` for the exact C5b11 head, separately state parent C5b and
admission status, and report limitations. Do not load or execute any object/dylib, call libkrun/HVF,
start a runner/VM/guest, touch credentials/services/product state, or request execution authorization.
