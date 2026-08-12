# Authenticated local IPC S3 native XPC C2b0

This directory retains the inert construction inputs for a future, separately
authorized C2b native XPC experiment. It is pinned to Capsule commit
`e7220e523bc43ba8867122a1233e1625f2c1c164` and capsule-experiments baseline
`067fe2beb40361bb714507cab1331004e0a656fa`.

The scoped construction result is **PASSED**. C2b execution, native XPC delivery,
OS peer enforcement, installed identity, and product admission remain
**BLOCKED**.

## Scope

The future executable method scope is exactly:

1. `SubmitMainMJSV0`
2. `RegisterPlanV0`
3. `GetRegisteredPlanV0`

`SubmitApprovalV0` and `RequestAttemptV0` are retained only as passive
foreign-tag collision and deadline/response-loss references. The source does not
implement either C4 method as an endpoint.

The imported Capsule fixtures retain their canonical bytes. Experimental Mach
service names are a one-to-one alias map outside those fixtures, recorded in
`experiment-profile.json`; this preserves fixture identity while preventing a
disposable experiment from claiming product service names.

## Retained inputs

- `experiment-profile.json`: immutable Capsule pins, method partition, names,
  aliases, limits, and the disabled activation state.
- `fixtures/`: byte-for-byte Capsule conformance and body fixtures.
- `generated/`: deterministic C headers and a construction-only case plan.
- `include/` and `src/`: bounded C/Objective-C harness source.
- `scripts/generate-contract.mjs`: deterministic generator from the imported
  contract.
- `scripts/verify.mjs`: independent closed-world verifier.
- `scripts/mutation-tests.mjs`: negative checks proving the verifier rejects
  scope, pin, ordering, source, and manifest drift.
- `scripts/build-unsigned.sh`: two clean compilation passes and byte comparison;
  it does not execute an artifact.
- root `manifest.json`: closed hash/size/mode inventory of retained files.
- `evidence/2026-08-11/construction-result.json`: bounded construction result and
  explicit no-effect readback.

`.build/` is disposable and ignored. Compiled binaries are deliberately not
retained as archive inputs; their reproducible hashes are recorded in the
construction result.

## Verification

From this directory:

```sh
node scripts/generate-contract.mjs
node scripts/update-manifest.mjs
node scripts/verify.mjs
node scripts/mutation-tests.mjs
sh -n scripts/build-unsigned.sh
./scripts/build-unsigned.sh
git diff --check
```

The build requires macOS, Xcode command-line tools, and the system XPC, Security,
and CoreFoundation SDK surfaces. It passes `-Wl,-no_adhoc_codesign`; it neither
signs nor runs the output. Reproducibility is scoped to the recorded host and
toolchain and is not a cross-toolchain reproducibility claim.

## Safety boundary

Do not run any produced executable from this retained construction checkpoint.
Every client and the server also require the exact future gate
`CAPSULE_C2B_AUTHORIZATION_V1`, but that gate is defense in depth rather than
authorization. `FUTURE_EXECUTION_AUTHORIZATION.md` lists the facts and exact
owner approval required before any native XPC row may run.
