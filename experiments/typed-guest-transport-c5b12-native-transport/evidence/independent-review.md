# Independent review and author response

Date: 2026-09-05. Review instance: 1 of 3.

Status: scoped independent review `PASSED`. Verdict: `Ready with non-blocking follow-up`.
Parent complete-provider composition: `BLOCKED`.

Fresh read-only reviewer had no inherited implementation conversation. Bootstrap
named base `f206e4ef2cd326ee74e5b7b2739c62efe6da7d6d`, branch
`codex/c5b12-transport-providers`, and only the then-untracked C5b12 directory.
Reviewer inspected requirements, plan, code and tests, recorded a preliminary
ledger, then read the separate author explanation. No tracked predecessor changes.

Reviewer independently ran `node scripts/verify.mjs`: 39 native cases, 39
ASan/UBSan cases, six compiled mutations killed by assertions, exact seven
exports/15 imports, and identical objects at
`a9e2c80ce273f19869a5ba496248b66ac9244fc504cee9c341973644673376de`.
No transport correctness blocker or heavy pivot was found. Fixed bindings,
sequential effects, poisoning, bounded retention, deadline handling and completion
facts matched source and predecessor driver. Nonzero provider refusals are
compatible with that driver's indeterminate-outcome handling.

One P3 finding: retain promised source/input/test/script hashes alongside object
hash, since test-only changes could otherwise leave object identity unchanged
while evidence becomes stale. Author response: **Accept**. Verifier now records
the closed ten-file material inventory, rejects non-regular/extra material files,
and checks retained material and object hashes on ordinary verification. Full
native/instrumented/mutation suite reran after that change. Provider/test source
and resulting provider object did not change after review; this mechanical
evidence change did not require another review instance.

Residual limits explicitly reviewed: fixture threads access private state;
post-create failure cleanup is harness-owned. Close/pthread failures, races,
cancellation/restart, cross-host reproduction, runner FD transfer, complete
composition and guest behavior remain unverified. Remaining 17 providers stay
absent; review does not admit any runtime/profile/product control.
