# Runtime-root construction comparison

## A. Exact dynamic loader and libraries — selected

The PR #50 ELF has PT_INTERP `/lib/ld-linux-aarch64.so.1`, no RPATH or RUNPATH, and direct
DT_NEEDED entries for `libgcc_s.so.1`, `libm.so.6`, `libc.so.6`, and the loader. Transitive
inspection closes as follows:

```text
candidate → libgcc_s, libm, libc, ld-linux
libgcc_s → libc
libm → libc, ld-linux
libc → ld-linux
ld-linux → none
```

The selected invocation uses the packaged loader directly with `--inhibit-cache` and
`--library-path /lib/aarch64-linux-gnu`. This removes `ld.so.cache` and caller library-path
resolution from the construction. The scratch root contains no `/etc`, NSS module, locale archive,
timezone database, package database, or cache. The C locale is glibc built-in. A missing
`/etc/ld.so.preload` probe is observed as ENOENT and no such bytes are used.

## B. Static or alternative-link construction — stopped before a candidate

The official Rust `aarch64-unknown-linux-gnu` target is the glibc target and the exact prebuilt
`rusty_v8` archive is GNU/Linux-specific. A fully static glibc rebuild would create a new binary
identity and require a new V8/archive build, a static glibc/NSS/dlopen review, source/provenance
closure, complete physical/restoration reruns, and new reproducibility evidence. Switching to musl
would be an alternative ABI/runtime construction rather than packaging the exact PR #50 candidate.

That branch is broader than this bounded root question and was stopped. Glibc's own hardening
guidance warns that dynamic loading, NSS, and configurable loader behavior materially complicate
review; the selected dynamic construction instead packages the four exact subjects and removes
cache/environment-controlled search from the declared invocation.

Official references used for this comparison:

- Rust `aarch64-unknown-linux-gnu` platform support:
  <https://doc.rust-lang.org/rustc/platform-support/aarch64-unknown-linux-gnu.html>
- glibc dynamic linker invocation:
  <https://sourceware.org/glibc/manual/2.39/html_node/Dynamic-Linker-Invocation.html>
- glibc dynamic linker hardening:
  <https://sourceware.org/glibc/manual/2.40/html_node/Dynamic-Linker-Hardening.html>
- GNU `readelf` documentation:
  <https://sourceware.org/binutils/docs/binutils/readelf.html>
- Debian snapshot service: <https://snapshot.debian.org/>

These references support mechanism selection; observed pass/fail claims come from the retained
exact local corpus.
