# Independent design and code review

Review scope: the two patches and Go guest launcher retained by
`experiments/gate-c-libkrun-hvf`. This is a static review plus comparison with the observed Gate C
behavior; it is not a complete upstream review, fuzz result, or malicious-guest validation.

## Patch 0001: firmware `@rpath`

The patch changes the macOS `dlopen` name from `libkrunfw.5.dylib` to
`@rpath/libkrunfw.5.dylib`. The Gate C signed bundle loaded its colocated firmware when the runner
had `@executable_path/lib` in `LC_RPATH`, so the mechanism works for that exact package layout.
Current upstream `main`, inspected on 2026-07-31, still uses the bare filename; the patch was not
observed upstream.

Security/design findings:

- Positive: it removes dependence on ambient dynamic-loader search locations for the tested bundle
  and lets the signed runner bind the intended colocated library directory.
- The patch changes resolution for every macOS caller. A caller without a suitable `LC_RPATH` can
  regress, while a caller with an unintended rpath can still load unintended bytes. Capsule must
  verify the loaded image's exact digest/code identity; rpath is location policy, not trust.
- The build currently also embeds `/opt/homebrew/opt/llvm/lib` as an `LC_RPATH`. That path is a
  build-host input and should not survive in distributed runtime libraries unless an exact runtime
  dependency requires and admits it.
- `@rpath` must be paired with an exact signed bundle layout, install names, no writable search
  directory, library-validation policy, and post-load identity verification.

Upstreamability: **plausible but not ideal in its current global form**. Prefer an upstream API or
build option that accepts an explicit trusted firmware path/handle, or a documented relocatable
macOS packaging policy with tests for bundled and conventional installs. Until accepted upstream,
carry it in a governed fork with owner, rebase tests, patch digest, and expiry condition.

## Patch 0002: read-only block-root mount flags

The patch recognizes the exact string `ro,nosuid,nodev`, moves those generic VFS options from the
filesystem-data argument to `MS_RDONLY | MS_NOSUID | MS_NODEV`, and leaves every other option on the
old path. Gate C then observed an ext4 root mounted with those flags and a write failing `EROFS`.

Security/design findings:

- Positive: the change matches Linux `mount(2)` semantics and fails closed for Capsule's one exact
  immutable-root profile when the source patch is present.
- The exact string comparison is order- and spelling-sensitive. An upstream caller using equivalent
  ordering or additional filesystem options silently falls back to the prior behavior.
- The code does not parse, deduplicate, or reject conflicting generic flags. Capsule avoids that
  ambiguity by generating one constant, but upstream should split a reviewed allowlist of VFS flags
  from filesystem data and return an error on unsupported/duplicate/conflicting options.
- `MS_NOEXEC` is intentionally absent because the trusted launcher and workload execute from the
  root disk. The runtime profile therefore relies on immutable, digest-verified root bytes rather
  than `noexec` for executable trust.

Upstreamability: **the defect and general fix are upstreamable; the exact-string implementation is
Capsule-profile-specific**. Submit a general parsing/error-handling fix with unit/integration tests.
Carry this narrow patch only in a governed fork until upstream resolution is accepted and the full
profile is revalidated.

## Guest launcher

The launcher requires an absolute executable string, clears supplementary groups, sets
`PR_SET_NO_NEW_PRIVS`, switches to UID/GID 65534, sets umask `077`, and calls `execve` without a
shell. Gate C observed UID/GID 65534, zero effective capabilities, and `no_new_privs` in the guest.
Go 1.26.5 implements the credential-changing Linux calls across Go runtime threads; the successful
probe confirms the resulting workload state for the retained binary.

Positive properties:

- Every privilege-drop failure exits before workload execution.
- `no_new_privs` is set before the credential drop and survives `execve`.
- No shell, PATH lookup, relative executable, or string interpolation is used.
- The immutable root disk makes executable bytes part of the reviewed runtime bundle in the tested
  profile.

Open findings before product use:

1. The launcher passes `os.Environ()` through. The host runner currently supplies four bounded
   variables, but the launcher should independently construct its exact environment and reject or
   discard everything else, especially loader/runtime variables.
2. It does not close inherited file descriptors. Define the allowed console/control descriptors,
   close every other descriptor, and actively test inheritance.
3. It observes zero effective capabilities but does not explicitly clear permitted, inheritable,
   ambient, and bounding sets or verify the final sets. `no_new_privs` narrows privilege gain, but
   the bundle should make and test the complete capability policy.
4. Absolute-path syntax is not object identity. The exact executable and arguments must come from a
   signed/digest-bound runtime manifest and immutable disk; the launcher should enforce a bounded
   allowlist or execute a pre-opened verified object where the design permits.
5. Seccomp, signal/shutdown behavior, dumpability, process/session setup, and explicit post-drop
   assertions remain unimplemented or unreviewed.
6. A statically linked Go launcher adds the Go toolchain/runtime and license to the runtime bundle.
   A smaller native launcher may reduce this TCB, but changing language requires measured benefit
   and equivalent failure semantics.

Decision: the launcher is adequate evidence for the narrow prior smoke probe, but **not admitted as
product runtime bytes** until these findings are resolved and the malicious-guest corpus passes.
