# Results: exact V8 source and license closure

Date: 2026-08-02
Decision: **SOURCE-LICENSE-CLOSURE-NO-GO**

## Answer

No. The exact official `rusty_v8` Linux/arm64 archive can be mapped to its release asset, successful
publisher job, exact `rusty_v8` commit, exact recursive gitlinks, exact `denoland/v8` commit,
Chromium V8 base, and the four-commit Deno V8 patch stack. Twenty-one official source archives and
726 license/notice candidate files were retrieved and hashed. The static archive's 1,875 members
were inventoried; embedded source paths and basename matching establish substantial linked content.

That evidence is not complete enough to remove PR #50's blocker. The official publication omits the
effective GN graph and publisher environment, generated credits/notices, and source-publication
bundle. Mutable runner/package/action inputs prevent an exact independent rebuild. The retained PR
#50 CycloneDX composition must remain incomplete.

## Proven relationships

The chain is retained in `archive-provenance.json`:

1. The crates.io `v8` 150.2.0 crate has the fixed SHA-256 above and records VCS commit
   `d305e6a...9382b` (`dirty: true`).
2. Official `rusty_v8` tag `v150.2.0` points exactly to that signed commit.
3. GitHub Actions run 29503514733, attempt 2, used head SHA `d305e6a...9382b` and completed
   successfully. Job 87701498072 is the exact `release aarch64-unknown-linux-gnu  simdutf` job.
4. GitHub release asset 479244251 was published by that run window. GitHub's asset digest and the
   retrieved bytes both equal `8d91df74...20595`.
5. The commit's `v8` gitlink is `ac1e239...6896`; that tree reports V8 15.0.245.2 and is exactly four
   Deno commits above Chromium V8 `0da5ef4...1d1e`.

No relationship was inferred from version similarity or tag naming alone.

## Source and component mapping

All 20 recursive gitlink source trees plus the `rusty_v8` superproject were retrieved from official
GitHub or Chromium/LLVM mirrors at exact commits. Retrieval-archive SHA-256 values and URLs are in
`source-manifest.json`. Git commits remain the source identities because generated archive
packaging can change independently of source trees.

The official static archive contains 1,875 object members and 167,160,168 member payload bytes.
Source-basename indexing yielded:

- 1,528 members with one candidate source path;
- 1,558 members with one candidate component;
- 53 members whose basenames collide across components; and
- 264 unmatched members, primarily generated Torque/inspector/data objects.

The archive also retains 1,557 embedded source-path strings. Together these prove substantial
inclusion of `rusty_v8`, V8, simdutf, Abseil, ICU, Highway, libc++, and libc++abi. The exact GN files
also declare Dragonbox, fast_float, ICU, Abseil, Highway, and simdutf dependencies. They do not
prove the complete linked closure: the release contains no `args.gn`, `build.ninja`, `ninja -t deps`
output, GN target graph, or corresponding build metadata. Object basenames cannot disambiguate all
PartitionAlloc/V8/Abseil/libc++ collisions or generated source provenance.

## Licenses and notices

The manifest retains 726 files named `LICENSE*`, `COPYING*`, `NOTICE*`, or `README.chromium` from
the exact source trees. Engineering-reviewed expressions and exact primary text hashes are retained
for the components directly evidenced or declared in the link graph. This is not legal advice.

Closure still fails:

- the official binary asset contains no license, notice, source, SBOM, or credits companion;
- no official release step generates a notice from the exact GN closure;
- the PartitionAlloc subrepository archive omits the root license referenced by source headers;
- exact `simdutf` gitlink `f7356ee...1983` conflicts with the `README.chromium` upstream revision
  label `da645ece` without release documentation of the relationship; and
- ICU's `README.chromium` says `MIT`, while the exact root text is the Unicode license and requires
  normalization/legal review.

The breadth of the 726-file set is evidence of an unresolved universe, not a claim that every file
belongs in a shipped notice.

## Build/rebuild result

The source build derives the selected target/feature/release GN arguments and pins Rust 1.91.0,
GN, Ninja, two Chromium sysroots, and V8's Rust toolchain object. The publication job nevertheless
depends on mutable or unretained inputs, including:

- the exact `ubuntu-22.04-xl` runner image revision;
- apt snapshot and package revisions for cross-GCC/QEMU/libc and apt.llvm.org Clang 19;
- Python `3.11.x` patch resolution;
- mutable `cargo-binstall@main` and unresolved action tag commits;
- an sccache tarball downloaded without checksum verification;
- the complete effective environment, `GN_ARGS`, generated GN/Ninja graph, and submodule-status
  artifact; and
- the input archive mtime recorded by `gzip -9c` because `-n` is not used.

Public job metadata was retained, but the official log endpoint returned HTTP 403 without valid
Actions-log authentication. A local rebuild was not attempted: it would substitute guessed inputs
and could not test reproduction of the official publisher bytes. There is therefore no byte,
symbol, member, or build-metadata equivalence claim against a rebuilt archive.

## Decision and impact

The intended engineering direction is governed `deno_core`. Current evidence status is
`SOURCE-LICENSE-CLOSURE-NO-GO`. Admission blockers are the immutable publisher input gap, missing
exact linked-component graph, incomplete license/notice closure, absent corresponding-source
publication, PR #50 independent-builder/runtime-root blockers, and remaining full profile work.

This experiment does not select or admit the runtime, does not supersede ADR-0003, and does not
change `RUNTIME-001`. Artifacts remain under `experiments/` and product packages do not import them.
