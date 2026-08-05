# V2 local process-profile observations

Date: 2026-08-04

Status: exact V2 candidate **BLOCKED**. This record separates observed local facts from inference.

## Authorized environment

- macOS 26.5.2 build `25F84`
- Darwin kernel 25.5.0 `RELEASE_ARM64_T6000`
- Apple arm64 host
- Apple clang 21.0.0 (`clang-2100.1.1.101`)
- Go 1.26.5 darwin/arm64
- exact retained V1 artifact SHA-256
  `ba2a6b38be6b4eea8c067887cf80988756e2f4a551d128bf2dabdaf7f2ecb600`
- exact retained artifact-profile identity
  `cfadcedc3e983377b964e0465c1f7127a307acbfda15ad8a02d7a302e82b4ce7`

All child data and mutations used the repository or Go-owned temporary directories. Fixture
JavaScript was passed only as parser input to the exact V1 artifact and was never executed.

## Commands

```sh
shasum -a 256 artifacts/mjs-source-validator-v1/dist/capsule-mjs-source-validator-aarch64-apple-darwin
codesign -d --verbose=4 artifacts/mjs-source-validator-v1/dist/capsule-mjs-source-validator-aarch64-apple-darwin
codesign -d --entitlements :- artifacts/mjs-source-validator-v1/dist/capsule-mjs-source-validator-aarch64-apple-darwin
otool -L artifacts/mjs-source-validator-v1/dist/capsule-mjs-source-validator-aarch64-apple-darwin
go test -v ./artifacts/mjs-source-validator-v2
```

Inside the Codex filesystem sandbox the Go test used a task-specific cache under
`/private/tmp/capsule-v2-go-cache`; this changes no test input or child authority.

Local platform-source checks also read the installed macOS 26.5 SDK `sandbox.h`, `spawn.h`,
`sys/spawn.h`, and `sys/resource.h`, plus the installed `sandbox-exec(1)` and `setrlimit(2)` manual
pages. No private API was called.

## Observed facts

### Retained artifact

- The V1 Mach-O remained 1,146,656 bytes at the expected SHA-256 before and after every test.
- Its signature is linker ad hoc, has no Team identifier, and has no entitlements.
- Its only reported dynamic dependency is `/usr/lib/libSystem.B.dylib`.
- Ad hoc signing a temporary copy with the exact App Sandbox child inheritance entitlements changed
  the temporary copy digest to
  `a0213350f2eaad3bbbba7ab257570cc857c5c91df80efcbec4f8f12e9f64f5dc` on this run. The retained
  V1 object was not modified. The mutated digest is an observation, not a new known answer or
  artifact profile.

### Strict launch

- The bootstrap successfully closed inherited FDs and lowered core, CPU, and file-size limits.
- `setrlimit(RLIMIT_AS, 256 MiB)` returned `EINVAL` and the bootstrap exited 75 before `execve`.
- Separate read-only shell probes from 256 MiB through 16 GiB also returned `EINVAL`. Those shell
  probes did not run the validator or modify state.
- No V1 output existed on the strict path.

### Explicit diagnostic-only unbounded-memory mutation

The remaining observations were collected only after compiling the bootstrap with
`ALLOW_UNBOUNDED_MEMORY_FOR_MECHANISM_TEST=1`. This name is intentionally explicit: the mutation is
not V2 and cannot be used as admission evidence.

- The ordinary and exact-maximum canonical V0 requests each produced one verified 138-byte result
  within the 2-second candidate deadline.
- The child environment had zero entries and the post-exec FD inventory was exactly 0, 1, and 2.
- After deliberately closing role FDs, the controlled probe could read an owned sentinel outside
  cwd, create IPv4 and Unix socket descriptors, chmod the owned cwd, and create/remove an empty
  file. Neither socket connected anywhere.
- `fork` failed with `EAGAIN` under `RLIMIT_NPROC=0`.
- A 512 MiB anonymous mapping succeeded, confirming the diagnostic path had no memory ceiling.
- A one-byte regular-file write terminated with `SIGXFSZ` under `RLIMIT_FSIZE=0`; empty-file and
  metadata mutation remained possible.
- A busy loop terminated with `SIGXCPU` under `RLIMIT_CPU=1`.
- Wall deadline and cancellation sent `SIGKILL` to the fresh child process group and waited for
  reap.
- A 69-byte partial result refused. Duplicate output reached 276 bytes before reap; trailing and
  oversize probes reached 139 bytes. All crossed or failed the exact 138-byte requirement and
  refused.
- `SIGABRT`, `SIGSEGV`, and partial input produced no usable result.
- A later fresh exact V1 invocation succeeded and the retained artifact digest still matched.

### Supported versus deprecated sandbox path

- The installed `sandbox.h` says the interface is deprecated and directs developers to App
  Sandbox. Its `sandbox_init` declarations are marked “No longer supported.”
- The installed `sandbox-exec(1)` manual labels the tool deprecated and likewise directs developers
  to App Sandbox.
- Apple's supported embedded-tool documentation requires the child signature to contain exactly
  `com.apple.security.app-sandbox=true` and `com.apple.security.inherit=true` for inheritance.
- Applying that supported child signature shape changes the exact fixed V1 bytes. No App Sandbox
  process was launched, no sandbox container was created or accessed, and no App Sandbox denial is
  claimed.

## Inferences bounded by those observations

- Fixed copied I/O plus external kill/reap provides crash isolation and deterministic refusal.
- The partial launch mechanism can bound CPU, file growth, descriptor count, child creation, output,
  and wall time on this host.
- Those mechanisms do not deny filesystem, sockets, Keychain/Supervisor state, or durable metadata
  authority after child compromise. The Keychain/Supervisor cases remain untested rather than
  inferred safe.
- The exact unchanged V1 artifact cannot satisfy the documented supported App Sandbox child-signing
  shape. Re-signing or rebuilding must create and review a new artifact profile.
- A supported exact memory/address-space mechanism remains unknown. Missing it makes the strict
  candidate `BLOCKED`; the explicit unbounded mutation is counterevidence, not a fallback.

## Limitations and unresolved questions

- The bootstrap is compiled into a temporary directory and is not signed, assessed, enrolled, or
  retained as executable bytes.
- The test uses a build-fixed pathname plus before/after digest verification. macOS exposes no
  reviewed descriptor-relative `exec` in this slice, so same-UID replacement resistance depends on
  future enrolled protected-bundle custody.
- No App Sandbox launch, installed identity, container, clean host, alternate macOS version, or
  independent builder participated.
- No Keychain or Supervisor state was probed because those stores and identities were outside the
  authorized data scope.
- No proof exists that App Sandbox can meet the stricter no-durable-write requirement; its supported
  app container is writable by design.
- V1 independent provenance, installation signature/enrollment, and vulnerability owner/SLA remain
  separate blockers.
- V3/V4 consumers, V5 broader grammar evidence, and V6 runtime no-loader evidence remain absent.

The later
[supported-profile replacement review](../../docs/MJS_SOURCE_VALIDATOR_MACOS_PROFILE_REPLACEMENT.md)
does not reinterpret these observations. It passes its scoped design question, rejects direct App
Sandbox inheritance for preserving parent rights, and keeps the product blocked on a distinct
launcher topology, writable-container disposition, and honest hard-memory/resource policy.
