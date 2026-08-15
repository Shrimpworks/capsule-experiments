# C5b8 controlled-test effect layer

Status: `IN_PROGRESS — TRENDING_GOOD` pending retained independent review.

## Question

Can the accepted C5b3 pure controller and C5b5 descriptive adapter drive a smallest complete,
fail-closed operation layer without giving the caller a raw action mask, callback, path, flag,
image, mount, endpoint, backend configuration, replacement plan, or runtime-loading surface?

## Defensive authorized scope

This experiment validates Capsule's deny-by-default controlled-test operation boundary in this
owned `Shrimpworks/capsule-experiments` repository using a deterministic C test double. It must not
access any other system, identity, credential, or data. It does not load libkrun or HVF, launch a
VM, guest, process, or backend, perform signing or Keychain operations, or execute a live harness.

## Method

- Copy the exact retained C5b3 controller and C5b5 adapter inputs from the historical archive.
- Accept one Supervisor-owned descriptor, copy its attempt, registration, plan/profile digest,
  root identity, and exact nonempty C5b0 typed source/input frames into opaque session storage, and
  require an exact owner enrollment result before initialization succeeds.
- Own the C5b3 controller state inside that opaque session. The public API requests a closed event
  observation but accepts neither facts nor controller actions. Exact per-event facts come only
  from the fixed typed operation port.
- Translate only controller-issued actions with the accepted C5b5 adapter.
- Invoke one fixed, typed, link-time operation symbol. The caller supplies no function pointer or
  opaque value. The production object remains unlinked and unexecuted; only the test double defines
  that symbol.
- Require exact attempt/registration/plan/profile/sequence/effect echoes, exact per-effect resource
  deltas, and closed operation outcomes. A malformed post-call reply is indeterminate and fences.
- On a failed effect, feed a fault back through C5b3 before requesting teardown. On an
  indeterminate effect, use C5b3's store-indeterminate transition and fence behavior.
- Require completion-last, teardown-before-absence, absence-before-root-removal, and explicit
  writer/context reconciliation.

## Exact accepted inputs

- C5b0 accepted archive merge
  `b357d0c0fb29100c180494e67cebd7809aabe3c5`; copied source frame SHA-256
  `c8d035b02af814c2df23916bb060018c50412dd208131ec37a65f87c94ce8173` and input frame
  SHA-256 `c4b66bba6dd33af06760118f34955b637308538d300ace79aa68381ae3f7f2c2`;
  their retained no-run plan/profile bindings are
  `5a806ac1628537c999e73b07b0d73d1a96a31507d1e91fd0f9a0535787e6fb64` and
  `c0a2d0ec6337d4cb4ed52e8a930a54a59ec3e677d4ad9da1a602c4cd7124f04b`.
- C5b3 accepted archive merge
  `60234e22674e46a42e8e5c382d85217a930c2c13`; copied controller contract SHA-256
  `36285d7fa3f27a992fda413afb38c1ed05a3af30f496c5784b2165d5b2f90e59` and header SHA-256
  `0ae153a47d5a2d0cdfbae7e149139b72abbd35f7f1223dd5745f03df86cadd12`.
- C5b5 accepted archive merge
  `3cfe7db16c55894be444d4c783659043dbd25c95`; copied adapter object SHA-256
  `852234b318772651d1e4feda6c016dbaa860c061be4db4b160c6c91f573abd0b` and contract SHA-256
  `396d7e4d0d4ded1d072aac0040609c2cff39624dc56012896dc8663e0766f6f7`.
- Historical C5b7 effect merge `c3264cb6c1f524622cf09519ed43b7a2e07a971c` was reviewed as a
  predecessor only. Its raw-action/callback API is not reused.

## Deliberate non-composition

The accepted C5b5 profile fixes a 128 MiB root. The separately retained C5b7 runtime-root archive
uses 96 MiB. This experiment does not rebind that mismatch, compose either root, load runtime
bytes, or grant execution authority. C5b9 remains the first possible composition slice, subject to
its own exact inputs, independent review, and authorization.

## Run

```sh
./scripts/build.sh
node scripts/verify.mjs
node scripts/test-mutations.mjs
git diff --check
```

The native test executable is a repository test double. The deterministic arm64 production object
is compiled twice and compared byte-for-byte, but it is never linked, loaded, or executed.
