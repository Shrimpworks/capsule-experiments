# `.mjs` Source Validator V2 disposable-process profile checkpoint

Status: **BLOCKED**. This directory retains the exact V2 platform stop for the unwired V1 test
artifact plus a Darwin-only diagnostic harness for the process mechanics that remain testable
without weakening the stop.

## Work item

```text
Work item: exact V1 macOS arm64 Source Validator V2 disposable-process profile
Status: BLOCKED
Scope: one unwired V1 artifact, canonical V0/M1 fixtures, controlled local child processes, and
  owned temporary directories on macOS 26.5.2 arm64
Evidence or reason: the strict launcher refuses before exec because RLIMIT_AS cannot be lowered;
  the explicitly unbounded diagnostic mutation then proves fixed I/O/fault mechanics but also
  proves ambient file, socket, and durable-metadata authority remains. Apple's supported embedded
  App Sandbox child configuration requires signature entitlements that change the fixed V1 bytes.
Remaining work: select a supported exact memory/address-space mechanism, produce a newly reviewed
  and enrolled child artifact with the required supported sandbox signature/package, close
  immutable launch identity and zero-durable-write semantics, and rerun the complete V2 corpus.
Blocker and owner: ADR-0035 artifact/platform owners; an installation-signed replacement artifact
  and a reviewed supported macOS resource/confinement design are absent.
Next action: revise the V1/V2 artifact profile only after those owners select the supported
  packaging and memory mechanism; otherwise explicitly reject the macOS process candidate and
  choose a stronger disposable parser boundary.
Parent status: Product Source Validator V1-V5 and downstream M2/S1 are BLOCKED. ADR-0035 remains
  Proposed; the artifact profile remains not enrolled and no product consumer exists.
```

Follow-on: the
[supported macOS replacement review](../../docs/MJS_SOURCE_VALIDATOR_MACOS_PROFILE_REPLACEMENT.md)
is `PASSED` in its research/design scope and does not change this checkpoint's `BLOCKED` status.
It rejects direct parent-sandbox inheritance, identifies only a separately sandboxed XPC-launcher/
fresh-parser-child candidate, and retains a public-SDK footprint-limit denial. R0 remains blocked on
launcher topology, App Sandbox writable-container policy, and a hard-memory or explicitly revised
reactive-resource decision. V1/V2 bytes remain unchanged.

## Defensive scope and claim boundary

The harness parses but never executes the retained fixture JavaScript. It touches only the Capsule
repository, the exact V1 artifact, canonical fixed frames, controlled local child processes, and
owned temporary directories. The adversarial probe opens only an owned sentinel, creates and
removes only owned temporary files, creates unconnected local socket descriptors, and attempts one
controlled `fork` that the resource limit refuses. It connects to no network or socket, reads no
Keychain item, opens no Supervisor state, starts no runtime/backend/guest, and performs no key or
Approval operation.

This checkpoint distinguishes four things:

1. **Crash isolation:** the exact V1 parser runs in a fresh process and abnormal exit has no result.
2. **Local mechanism evidence:** the test-only bootstrap fixes argv/environment/cwd/FDs, applies the
   enforceable rlimits, and the parent bounds/drains output, kills the process group, and reaps it.
3. **App Sandbox evidence:** none was claimed. The harness does not use deprecated custom sandbox
   profiles and does not launch an App-Sandboxed child.
4. **Production enrollment:** absent. V1 remains the unchanged identity-free linker-ad-hoc-signed
   test object; neither its profile nor the test bootstrap is installation-signed or enrolled.

## Candidate fixed launch descriptor

| Item | Candidate value | Evidence and disposition |
| --- | --- | --- |
| Target executable | `../mjs-source-validator-v1/dist/capsule-mjs-source-validator-aarch64-apple-darwin`, 1,146,656 bytes, SHA-256 `ba2a6b38be6b4eea8c067887cf80988756e2f4a551d128bf2dabdaf7f2ecb600` | Rehashed before and after tests. The test bootstrap uses a build-fixed absolute path. There is no enrolled immutable installed bundle or descriptor-relative `exec`; pathname replacement remains a product blocker. |
| Target signature | Identity-free linker ad hoc; no Team identifier or entitlements | Not an installation identity. |
| `argv[0]` | `capsule-mjs-source-validator-aarch64-apple-darwin` | Fixed by the bootstrap. |
| `argv[1]` | `--artifact-profile-digest=cfadcedc3e983377b964e0465c1f7127a307acbfda15ad8a02d7a302e82b4ce7` | Derived from the retained not-enrolled V1 artifact profile; never caller supplied. |
| Working directory | One fresh owned empty directory, mode `0500`, passed initially as role FD 3 | The bootstrap uses `fchdir(3)`, then closes FD 3 before `exec`. Same-UID ownership lets an unsandboxed compromised child chmod and write it; mode bits are not containment. |
| Environment | Exact empty `envp` | The post-exec probe observed zero entries. No `HOME`, `TMPDIR`, loader, package, or cache variable exists. |
| Standard input | FD 0, one V0 request, inclusive cap 262,224 bytes | Parent writes one copied canonical frame and closes; partial input reaches the wall deadline and refuses. |
| Standard output | FD 1, exactly one 138-byte V0 result | Parent drains continuously through cap plus one. Partial, duplicate, trailing, or oversized output refuses. |
| Standard error | FD 2, zero-byte cap | Any byte refuses and terminates the child group. |
| Other inherited FDs | None after bootstrap | The bootstrap inventories and closes every FD above 2. The post-exec probe observed exactly FDs 0, 1, and 2. |
| Environment/CLOEXEC rule | Role FD 3 exists only before `exec`; all descriptors above 2 are actively closed | No ambient parent descriptor crosses `exec`. This is test-source evidence, not enrolled parent/child packaging evidence. |
| Process group | One new child process group per invocation | Timeout, cancellation, and cap violation send `SIGKILL` to the group and wait for reap. |

The request has no path, package, cache, loader, environment, network, runtime, backend, key,
Supervisor, Approval, or guest field. That closed protocol fact does not contain a compromised
process. After deliberately closing a role FD, the unsandboxed probe successfully opened an owned
out-of-cwd sentinel, created IPv4 and Unix socket descriptors, changed the cwd mode, and created an
empty file. It did not connect either socket. Keychain and Supervisor-state access were not tried
because doing so would exceed this task's authorized data scope; without a supported sandbox there
is no evidence of OS denial.

## Resource and fault result

| Control | Candidate | Observed result |
| --- | --- | --- |
| CPU | `RLIMIT_CPU=1s` soft and hard | Busy loop terminated with `SIGXCPU`. |
| Memory/address space | proposed `RLIMIT_AS=256 MiB` soft and hard | **BLOCKER:** `setrlimit` returned `EINVAL`; strict launch exited 75 before V1 `exec`. The diagnostic-only unbounded mutation successfully reserved 512 MiB. |
| File size | `RLIMIT_FSIZE=0` | One-byte owned-temp write terminated with `SIGXFSZ`; empty-file and metadata mutation still remained possible. |
| Descriptor count | `RLIMIT_NOFILE=16`; inherited inventory exactly 3 | Enforced as a ceiling: with 3 descriptors already open, exactly 13 further `open` calls succeed and the 14th fails with `EMFILE` (`descriptor-limit` probe mode, kernel-verified, not merely `setrlimit`'s own success). A compromised child can still close/reuse an allowed descriptor; the ceiling does not replace filesystem or socket denial. |
| Process/child count | `RLIMIT_NPROC=0` | Controlled `fork` refused with `EAGAIN`. |
| Core files | `RLIMIT_CORE=0` | No core-file authority. |
| Result/stderr | 138 bytes / 0 bytes | Parent detects cap plus one, kills, drains, and reaps. |
| Wall | 2 seconds candidate; 100 ms accelerated fault oracle | Hung child group received `SIGKILL` and was reaped. |
| Cancellation | Parent-controlled immediate terminal cancellation | Child group received `SIGKILL` and was reaped. |

The deterministic parent oracles cover ordinary and exact-maximum requests, partial input, 69-byte
partial output, 276-byte duplicate output, 139-byte trailing/oversized output, `SIGABRT`,
`SIGSEGV`, CPU signal, wall timeout, cancellation, forced group kill/reap, and a later clean exact
V1 invocation. Every abnormal case has no usable result and no retry/fallback parser.

## Exact platform stop

The strict V2 candidate stops for three independent reasons:

- The macOS 26.5 SDK defines `RLIMIT_AS`, but this host returns `EINVAL` when the unprivileged child
  lowers it. The supported standard primitive therefore cannot enforce the declared 256 MiB limit.
- Apple's supported embedded command-line-tool App Sandbox configuration requires the child to be
  signed with exactly `com.apple.security.app-sandbox` and `com.apple.security.inherit`. Ad hoc
  applying those entitlements to a temporary copy changed its SHA-256 while the retained V1 bytes
  stayed unchanged. Re-signing V1 would create a new artifact profile, not confine the exact V1
  object.
- The unsandboxed partial mechanism demonstrably permits file reads, socket creation, and durable
  metadata writes. Apple's supported App Sandbox also grants a writable app container; no reviewed
  supported zero-durable-write composition has been selected. `sandbox-exec` and `sandbox_init`
  are explicitly deprecated and are not used as evidence or a fallback.

The official platform references are Apple's
[embedding guidance](https://developer.apple.com/documentation/xcode/embedding-a-helper-tool-in-a-sandboxed-app),
[App Sandbox configuration](https://developer.apple.com/documentation/xcode/configuring-the-macos-app-sandbox),
and [file/container guidance](https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox).
Local SDK and manual evidence is recorded in [`OBSERVATIONS.md`](OBSERVATIONS.md).

## Ecosystem reuse disposition

- Capability and slice: ADR-0035 V2 one-shot `.mjs` validator process confinement.
- Reuse-map rows: APL-4 **ADOPT-PLATFORM**, TEST-1/RUST-1 **TEST-ONLY**, and the `.mjs`
  parser row **SPIKE-FIRST** plus Capsule framing **BUILD-NARROWLY**.
- Added dependency: none. The harness uses the existing Go toolchain, Apple clang/libSystem/
  `libproc`, standard rlimits/process groups, and the already retained V1 artifact.
- Trust class: test/evidence only. The bootstrap is not a product helper and gains no key, store,
  Approval, backend, runtime, guest, or network-connection authority.
- Bounds: exact descriptor table above; one request, one result, 2-second wall candidate, one child
  group, no queue or concurrency surface.
- Fault/restoration: the full local table above plus V1 digest recheck and entitlement-copy mutation.
- Reproduction: `go test -v ./artifacts/mjs-source-validator-v2` on macOS arm64 with Apple clang and
  `codesign`; all build/run output is created beneath Go-owned temporary directories.
- Vulnerability/update owner: still unknown for Oxc/V1 and therefore still an enrollment blocker.
- Decision: retain **SPIKE-FIRST / TEST-ONLY** evidence; do not adopt or activate this profile.

## Retained files

- [`profile_darwin_test.go`](profile_darwin_test.go): bounded parent, strict-stop, fault, resource,
  descriptor, and entitlement-mutation oracles.
- [`testdata/profile_bootstrap.c`](testdata/profile_bootstrap.c): test-only fixed bootstrap.
- [`testdata/profile_probe.c`](testdata/profile_probe.c): controlled authority/resource/fault probe.
- [`testdata/child.entitlements`](testdata/child.entitlements): exact supported child entitlement
  shape applied only to a temporary copy to prove the byte-identity conflict.
- [`PROFILE.json`](PROFILE.json): machine-readable candidate descriptor and stop classification.
- [`OBSERVATIONS.md`](OBSERVATIONS.md): exact host, commands, observations, inferences, and limits.

No product package imports this directory. No bootstrap binary, mutated artifact, temporary file,
socket, or process is retained after the test.
