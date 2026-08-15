# C5b8/C5b7 root-binding successor

Status: `PASSED` for the exact deterministic, no-run root-binding successor slice.

## Question

Can the exact sealed C5b8 controlled-effect object be bound to the exact retained C5b7
100,663,296-byte root without changing historical C5b5, C5b7, or C5b8 evidence and without adding
caller-selected authority?

## Defensive authorized scope

This experiment validates Capsule's immutable profile/root-size boundary in an owned local
`Shrimpworks/capsule-experiments` clone using copied repository fixtures, static inspection,
deterministic construction, and repository test doubles only. It launches the permitted local
repository test-double process, which exercises statically linked successor and sealed C5b8 code.
It does not load libkrun, HVF, a retained dylib, backend, or runtime artifact; launch a backend,
VM, or guest; sign; access Keychain or LocalAuthentication; register or install a service; or clean
host paths outside task-owned temporary roots.

## Method

- Pin the exact C5b7 root identity: 100,663,296 bytes and SHA-256
  `5ad18f20cbc97c7a70ead3e795fd3649672513323041e913b0eb55b7acc88775`.
- Pin and preserve the exact C5b8 object from merge `e83614a`, SHA-256
  `b15c4eb6abfbf0bf6ff6d1bf860081be0378273af7c14a9f9a24fd65ffe941ce`.
- Preserve the 240-byte C5b5 ABI while requiring a new magic/version and the exact C5b7 size.
- Generate a private, renamed copy of the exact historical C5b5 implementation. The wrapper
  normalizes only that private copy for historical validation and translation, then requires
  exactly one historical root operation and mechanically replaces only its byte count.
- Rebuild the plan, profile, descriptor, and both frame digest bindings from their actual bytes.
- Compile the successor and statically compose it with the sealed C5b8 object twice. Compare both
  builds byte-for-byte. Statically link the component objects into only the permitted repository
  test-double process and exercise their entry points; do not load a retained dylib, backend, or
  runtime artifact.
- Run a local operation double whose libkrun stubs abort if called, plus independent verifier
  mutation/restoration checks.

## Run

```sh
./scripts/build.sh
node scripts/generate-profile.mjs --check
node scripts/generate-evidence.mjs --check
node scripts/verify.mjs
node scripts/test-mutations.mjs
./scripts/check-range-whitespace.sh
```

## Security-claim boundary

The result proves deterministic construction, exact static binding, refusal behavior, and
test-double sequencing only. It does not prove any real backend effect, runtime composition, VM or
guest launch, descriptor custody, crash recovery, concurrency, installation, or product admission.
C5b9 remains the first possible separately reviewed complete composition slice.
