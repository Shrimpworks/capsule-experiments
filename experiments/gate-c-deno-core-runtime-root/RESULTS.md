# Governed `deno_core` self-contained runtime-root result

Date: 2026-08-03

Decision: **STANDALONE DYNAMIC ROOT PASS; NO RUNTIME ADMISSION**

Admission effect: none. Governed `deno_core` is the intended first engineering direction after the
hard Bun pivot, but no runtime/profile/backend is admitted and `RUNTIME-001` remains unsupported.

## Question and answer

Can the exact PR #50 governed `deno_core` candidate execute the fixed Capsule fixture from an
immutable, bounded, manifest-complete runtime root containing every required loader/shared-library
byte, with no ambient Bookworm root dependency or undeclared fallback?

Yes for the bounded dynamic-root construction tested here. The exact binary, snapshot, and patch
identities are unchanged. Two clean network-disabled containers extracted the same exact official
Debian package artifacts at different host paths and produced byte-identical normalized roots.
A scratch image containing only that root executed the fixed fixture with no configured
environment, network disabled, a read-only root, all capabilities dropped, no-new-privileges, fixed
argv, cwd `/`, and descriptors 0/1/2.

This closes PR #50's standalone dynamic-root blocker. It does not close independent-builder, V8
source/notice, production TypeScript ownership, governed-repository, external-isolation, installed
custody, signing, or profile-admission blockers.

## Exact ELF closure

The 68,497,544-byte binary remains SHA-256
`597baba6b9f50fc619ce667a352e19686f8c73efc6819d137b3c4081450fd6f5` and the embedded/review
snapshot remains `ef5f1e7883bbf62a6422957ff0eea51a06d4b35cad1f47dc9c9ae137ab8dfa0b`.

- PT_INTERP: `/lib/ld-linux-aarch64.so.1`.
- RPATH/RUNPATH: absent from the binary and all four packaged ELF subjects.
- Direct DT_NEEDED: `libgcc_s.so.1`, `libm.so.6`, `libc.so.6`,
  `ld-linux-aarch64.so.1`.
- Transitive closure: `libgcc_s → libc`; `libm → libc, loader`; `libc → loader`;
  loader → none.
- Required binary versions: GLIBC 2.17/2.18/2.25/2.27/2.28/2.30/2.32/2.33/2.34;
  libm GLIBC 2.17/2.27/2.29; loader GLIBC 2.17; GCC 3.0/3.3/4.2.0.

The version-restoration mutation changes the required `GLIBC_2.34` string to `GLIBC_X.34`; both
manifest preflight and the packaged loader reject it.

## Exact packages, root, and provenance

The selected runtime bytes are:

| Package | Exact version | Package SHA-256 | Root bytes |
| --- | --- | --- | --- |
| Debian `libc6` arm64 | `2.36-9+deb12u14` | `01f43307...b1cf4` | loader, libc, libm |
| Debian `libgcc-s1` arm64 | `12.2.0-14+deb12u1` | `576926b2...eacf3` | libgcc_s |
| Debian `gcc-12-base` arm64 | `12.2.0-14+deb12u1` | `674cf6cb...b5440` | notice only |

All are immutable snapshot.debian.org objects. The corresponding glibc and GCC `.dsc`, original
source, Debian source delta, notice paths, versions, sizes, URLs, and hashes are retained in
`manifests/package-sources.json`. No apt resolution or ambient `/lib` copy occurs.

The closed root has 22 entries, exactly equal to its manifest cap; 11 are directories and 11 are
files/symlinks. Total regular-file bytes are 71,871,122. The normalized root identities are:

| Subject | Size | SHA-256 | A/B |
| --- | ---: | --- | --- |
| Root tar | 71,895,040 | `d1f600b4...6d925` | equal |
| Root gzip | 22,192,043 | `b0e17261...79283` | equal |

This is same-host, clean-container, path-relocated equality on one Apple M1 Max Docker Desktop
4.81.0/LinuxKit 6.12.76 host—not independent-builder provenance.

## File-open and syscall result

The read-only trace starts the packaged loader with zero environment variables, `--inhibit-cache`,
and the single exact library directory. Successful ordinary file access is limited to the declared
binary, three libraries, and two fixed fixtures. Executable file mappings are limited to the
declared binary, libgcc_s, libm, and libc; none occurs after the candidate's host seal.

No `ld.so.cache`, NSS, resolver, hosts, locale, timezone, package database, or cache path appears.
The loader's fixed `/etc/ld.so.preload` check receives ENOENT. No socket syscall and no second
executable occur. The trace observes one expected V8 worker thread and declared Linux kernel/device
inputs: procfs maps/FD/cgroup, two cgroupfs files, and `/dev/urandom`. V8 attempts to read CPU
online/proc-stat after the descriptor seal, but both fail EMFILE. These are explicit profile facts,
not Bookworm root dependencies.

## Mutation and boundary result

The closed preflight rejects missing, substituted, and byte-mutated loader/library subjects;
missing snapshot; wrong owner/mode; internal relocation; extra file; manifest digest mutation; and
mutated symbol version. Exact cap 22 passes; cap-plus-one fails. A scratch image with injected `LD_PRELOAD` is
rejected by the exact empty-environment preflight and is never executed. The root is read-only at
execution and the candidate independently confirms only descriptors 0/1/2.

Twenty sequential fresh scratch-container runs including Docker CLI/container/process/fixture
measured 107.509–146.589 ms, p50 125.631 ms, mean 127.760 ms. This is supporting warm-cache
same-host measurement, not libkrun, cold-host, guest, or production latency.

## Construction comparison and decision

Construction A, exact dynamic packaging, is selected for continued engineering. Construction B,
static or alternative linking, stopped before producing a candidate: it would change the binary
identity, require a new GNU/musl V8 archive and ABI/provenance campaign, and expand into static
glibc NSS/dlopen/threading review. That is not a bounded packaging alternative for the exact PR #50
candidate.

The standalone root blocker is closed strongly enough to continue the governed `deno_core`
direction. The next source-governance boundary must be a real hosted fork of official
`denoland/deno` tag `v2.9.4`, commit `14eea3160ae5834476aa3b9d317b8d41d991b982`, carrying the exact
ordered patch stack `f45fda69...bac37` then `9dd33fd4...061e` and restoration mutation
`e0e98557...ee40`. No hosted fork was created here because destination ownership/name is not
specified. The parent should resolve that identity before external action.

That governed repository must publish pinned commits/source archives, CI-built unsigned subjects,
the exact Cargo and V8 source/build/notices, runtime-root packages/sources/notices, SBOM/provenance,
advisory ownership, update/rebase/removal policy, restoration mutations, review attestations, and
versioned releases. Product consumption must pin that real fork's commit/archive; experiment patch
files or a copied Cargo registry tree are not shippable source authority.

## Remaining blockers

- independently controlled second Linux/arm64 builder/host;
- complete archive-corresponding `rusty_v8`/V8 source, build, license, and third-party notices;
- real governed fork identity, ownership, CI/release, advisory, and rebase workflow;
- production TypeScript transformation ownership/wiring and approved-byte protocol migration;
- final installed root custody/readback, signing/notarization, external isolation, kernel/launcher,
  transport/completion, and full profile corpus;
- a runtime-selection/superseding ADR and explicit `RUNTIME-001` admission decision.

No result here changes those fail-closed requirements.
