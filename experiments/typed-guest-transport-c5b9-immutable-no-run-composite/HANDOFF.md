# C5b9 handoff

- Scoped status: `PASSED` for the immutable no-run composite.
- Parent controlled C5b execution: `BLOCKED` on separate exact authorization and real evidence.
- Runtime/profile admission and product admission: `BLOCKED`.
- Defensive scope: owned repository files and local static/test processes only; no libkrun/HVF,
  runner, VM, guest, network, credential, installation, or product state.
- Verification: `node --test scripts/verify-profile.test.mjs`; `node scripts/generate.mjs --check`;
  `node scripts/verify.mjs`; `node scripts/test-mutations.mjs`; `git diff --check`.
- Retained evidence: `contracts/`, `fixtures/`, `evidence/2026-08-16/`, and the closed archive
  manifest.
- Limitation: this is construction/static evidence, not controlled execution or admission.
- Required next dependency: separately authorize and bind a real fixed operation provider; the
  `_c5b8_controlled_test_operation` placeholder remains null and `BLOCKED` here.
- Integration destination: after reviewed merge, Capsule must pin the immutable experiment commit
  and update C5b8/C5b9 canonical status without weakening issue #309's retained-evidence blocker.
