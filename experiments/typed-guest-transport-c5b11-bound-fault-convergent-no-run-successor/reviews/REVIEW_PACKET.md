# C5b11 C5b-S1C fresh independent-review packet

Review status: `PENDING`. Use a fifth brand-new context/worktree at the exact draft-PR head. Do not
inherit conclusions from reviewed heads `d4a805ab6fc6fb700d06f57896a2775680755d0f` or
`5a671198a61280ce343e2ba03787430da27fc1b7`.

## Required questions

1. After independently parsing every source/input/completion frame field and completion trailer,
   do extracted payload length, SHA-256, and exact bytes match the attempt-plan declarations and
   retained payload files? Are input/completion valid repository-canonical JSON and source exact?
2. Do payload mutations that recompute frame payload/trailer hashes, generated C bindings, outer
   references, packet references, and archive inventory still fail when the plan is unchanged?
   Do invalid/noncanonical JSON and plan length/digest/path/form substitutions fail directly?
3. Are `recovery_step` and `durable_resume_step` independently defined and validated? Does startup
   require exact path-specific pairs, `(0,0)` for fresh state, reject missing/invalid/non-monotone
   pairs, and dispatch only from `result.durable_resume_step`?
4. Is teardown step 16 modeled consistently everywhere as a one-shot request with durable pair
   `(16,17)` whose every provider outcome continues through step 17–20 reconciliation? Is step 16
   absent from the generic immediate-unresolved cross-product and never blindly redriven?
5. Does the independent oracle derive exactly 65 primary, 50 generic recovery/failure, 11 reopen,
   and five teardown-outcome cases without candidate imports? Do AST checks prove the exact cursor
   member expressions and dispatch, not merely token order?
6. Do executable mutations reject runtime-bundle and C5b4 recovery-manifest substitutions, as well
   as all earlier runtime/snapshot/root/provenance/SBOM/notice and driver substitutions?
7. Do the single-libkrun-owner, registration-only entry, fixed authority, caps, completion-last,
   closed 34-file inventory, predecessor immutability, and total no-run properties remain exact?
8. Are C5b4 source compliance, provider behavior/provenance, cross-host/installed composition,
   runtime/profile admission, and product admission still explicitly `BLOCKED`?

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

Independently inspect both unlinked objects, all frames/payloads, the attempt plan/profile, literal
oracle/matrix, source and Clang AST verifier, and all 95 restored-invalid mutations. Verify C5b10,
`d4a805a…`, and `5a67119…` remain unchanged ancestors.

Return `PASSED`, `BLOCKED`, or `NO_GO` for the exact new head, separately state parent/admission
status and all trusted inputs/limitations. Do not link/load/execute any object or dylib, call
libkrun/HVF, start a runner/VM/guest, touch credentials/services/product state, or request execution
authorization.
