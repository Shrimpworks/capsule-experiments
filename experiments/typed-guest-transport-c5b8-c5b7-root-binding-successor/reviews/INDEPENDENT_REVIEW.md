# Independent review: C5b8/C5b7 root-binding successor

Status: `PASSED` for immutable candidate
`d004ed3136b9a5b46937ff6b1c9b982f731fda42` (tree
`0017ab61db0e1b54bd70ebc45d74dc1ef826c1ab`).

Baseline: `e83614af34d5c39c12a4a3d6e6cda8dcf0304030`.

Branch: `codex/c5b8-root-size-successor`.

Earlier candidates `c8e8a63572ae493a6ca7c337be602738afcffb0d` and
`e739c9ec23816e806067b85f2003e50471552ac7` are `NO_GO` evidence predecessors, not accepted
candidate identities. The first misstated component-code execution and did not retain a
baseline-range whitespace gate. The second corrected structured evidence but retained one generic
no-process claim in the README. Candidate `d004ed3` corrects both defects.

## Defensive scope and method

The reviewer inspected the complete baseline-to-candidate diff and ran only deterministic
construction, static inspection, repository test doubles, and mutation/restoration checks in an
isolated `git archive` copy under a task-owned `/private/tmp` root. The permitted repository
test-double process exercised statically linked successor and sealed C5b8 component code. It did
not load or invoke libkrun, HVF, a retained dylib, backend, runtime artifact, VM, or guest; sign;
access Keychain or LocalAuthentication; register/install a service; or access any unrelated system,
identity, credential, or data.

## Results

No findings remained. The candidate is acceptable as retained independent-review evidence for the
exact deterministic no-run root-binding successor slice.

- C5b7 root: 100,663,296 bytes, SHA-256
  `5ad18f20cbc97c7a70ead3e795fd3649672513323041e913b0eb55b7acc88775`.
- Historical 134,217,728-byte profile, successor-size substitution, and descriptor-size
  substitution: refused.
- Sealed C5b8 object: 8,728 bytes, SHA-256
  `b15c4eb6abfbf0bf6ff6d1bf860081be0378273af7c14a9f9a24fd65ffe941ce`.
- Byte-equal successor objects: 7,776 bytes, SHA-256
  `3d5650a11c8cbf920357af7d7fabbb8880fc96197ad3baec52db34526191821e`.
- Byte-equal composite objects: 15,255 bytes, SHA-256
  `2eaaef8a5480e0e6f9d416afef7bc9d467f25c0c4f6122d8e365e90ab3e40d94`.
- Plan/profile/descriptor/frame bindings matched their actual bytes.
- Copied C5b7 and C5b8 predecessor inputs matched baseline blobs byte-for-byte.
- The public and composed symbol surfaces added no caller-selected authority.
- All 10 independent verifier mutations were refused and the original candidate passed after each.

## Commands

```sh
./scripts/build.sh
node scripts/generate-profile.mjs --check
node scripts/generate-evidence.mjs --check
node scripts/verify.mjs
node scripts/test-mutations.mjs
./scripts/check-range-whitespace.sh
git diff --check e83614a..d004ed3
```

All commands passed. Additional `cmp`, `file`, `otool -l`, `nm -g`, `shasum -a 256`, and byte-count
inspection confirmed predecessor equality, object type, absence of dylib/runtime load commands,
closed symbols, and the recorded hashes and sizes.

## Confidence and limitations

Confidence is high for the exact deterministic no-run/root-binding scope. The retained root was
size/hash verified, not rebuilt. The review did not validate a real backend/runtime effect,
VM/guest launch, installation, complete C5b9 composition, parent C5b admission, or product
admission.
