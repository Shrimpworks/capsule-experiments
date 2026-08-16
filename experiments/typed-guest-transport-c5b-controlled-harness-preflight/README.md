# C5b controlled-harness build-only preflight

Status: `PASSED` for the static compatibility preflight. The exact direct binding candidate is
`NO_GO`. Parent controlled execution remains `BLOCKED`.

## Question

Can the exact C5b9 merge `3965e6b5cc87d476da7f431d7ed8a5758011a1b8` be made runnable by
implementing only its unresolved `_c5b8_controlled_test_operation` symbol, without changing the
retained host runner, root, controller/effect ordering, or authority boundary?

## Defensive authorized scope

The owner confirmed `Dylans-MacBook-Pro.local`, Apple silicon, macOS 26.5.2 (25F84), and one fresh
per-attempt Linux/arm64 guest built solely from the exact C5b9 merge as owned and disposable. This
slice uses that confirmation only to prepare and inspect immutable bytes. It performs static file,
source, digest, and Mach-O symbol inspection in the owned repository clone. It does not load
libkrun or HVF, run the retained host runner, start a VM or guest, access a network or credential,
or mutate product state. A later exact execution manifest requires separate final authorization.

## Result

The direct binding candidate is `NO_GO`:

- The retained host runner requires a 134,217,728-byte historical root with SHA-256
  `390a4786a20d45f1c691ec8c203f84f5e9d372a30e98f867cc8309a144ca6798`; C5b9 binds the
  100,663,296-byte C5b7 root with SHA-256
  `5ad18f20cbc97c7a70ead3e795fd3649672513323041e913b0eb55b7acc88775`.
- The sealed adapter's nominal sequence reaches `KRUN_START_ENTER` at operation 19, before source
  and input writes at operations 20 and 21. The host runner owns its complete libkrun setup and
  blocks in `krun_start_enter` only after receiving its start byte.
- C5b8 requires an in-process typed request/result symbol for each effect and observation. The
  standalone host runner exports no such ABI.
- Both the root-bound effect object and host runner import the libkrun create/start symbols.
  Joining both to libkrun would create duplicate execution ownership rather than a truthful bridge.

The required successor must make one fixed host-runner process the sole libkrun owner and expose
closed Supervisor-owned process/transport effects in the correct order: fixed endpoints, fixed
spawn, ready verification, bounded frame writes, writer closure, start authorization, completion
drain/validation, terminal join, absence proof, fixed-root removal, and commit-before-delivery.

## Verification

```sh
node scripts/generate.mjs --check
node scripts/verify-profile.test.mjs
node scripts/verify.mjs
node scripts/test-mutations.mjs
```

These commands do not execute any retained native artifact.
