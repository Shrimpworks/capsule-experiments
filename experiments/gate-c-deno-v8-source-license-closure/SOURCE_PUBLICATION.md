# Corresponding-source and publication plan
trees; exact linked closure and notice generation are still missing.
Status: required future governed-upstream work; not implemented by this NO-GO experiment.

## Proposed real-fork boundary

No Capsule-hosted fork was created. Repository ownership/naming is not established in this task,
so the parent must confirm the upstream destinations before external repository creation.

If the governed `deno_core` direction continues, the minimum real hosted boundary is:

1. a Capsule-governed fork of official `https://github.com/denoland/deno`, based on exact commit
   `14eea3160ae5834476aa3b9d317b8d41d991b982`, carrying the two ordered `deno_core` 0.409.0
   patches already retained by PR #50; and
2. a Capsule-governed fork of official `https://github.com/denoland/rusty_v8`, based on exact commit
   `d305e6afa7736f6e298c30ae6646f7709ee9382b`, owning deterministic source publication and binary
   release generation.

Suggested destinations are `capsule-corp/deno` and `capsule-corp/rusty_v8`, subject to explicit
organization/owner confirmation. The exact `denoland/v8` commit and four-commit patch stack may
remain a pinned upstream input unless Capsule changes it; do not create an additional V8 fork
without such a change.

## Required governed workflow

The runtime fork must use a protected branch rooted at the exact official commit, retain the ordered
patch stack as commits, run physical-omission/restoration/reproducibility tests on every rebase, and
publish a release from a pinned commit—not from a copied Cargo registry tree or experiment patch.

The `rusty_v8` fork must replace mutable publisher state with:

- digest-pinned builder images for host and target tooling;
- immutable apt/package snapshots or fully content-addressed toolchain bundles;
- commit-pinned Actions and installers with verified payload digests;
- captured `args.gn`, environment allowlist, submodule status, `build.ninja`, GN target graph, Ninja
  dependency graph, compiler/linker versions, and archive metadata;
- deterministic archive/gzip creation, including zeroed member metadata and `gzip -n`;
- two independent builders whose complete source, toolchain, and output identities are recorded;
- byte equality as the default release gate, with any accepted non-byte equivalence explicitly
  scoped and reviewed;
- a deterministic shipped-component manifest derived from the exact final GN graph;
- exact license texts, generated third-party notices, complete CycloneDX composition, and in-toto
  provenance bound to the released archive; and
- a corresponding-source bundle containing every source revision, patch, generator input, build
  recipe, and verifier required to reconstruct the release.

## Ownership and review controls

Runtime engineering owns upstream rebases and restoration mutations. Release/supply-chain owns
builders, release provenance, source/notice publication, and artifact retention. Security owns the
prohibited-power contract and admission checklist. Legal reviews the exact notice output and
license choices. A named advisory owner tracks V8/rusty_v8/Deno advisories and produces bounded
update PRs; no unreviewed automatic runtime update is permitted.

Every release must bind upstream bases, patch commits, source archive digests, builder identities,
toolchains, generated notices/SBOM, test results, and output digests. Protected branches require
runtime, security, and supply-chain review. Rebase policy must define cadence, emergency advisory
response, patch removal conditions, and full restoration/admission reruns.

## Machine admission gate

`evidence/2026-08-02/admission-checklist.json` is fail-closed. A future release may change a failed
entry only when the named evidence is published and independently verified. In particular, it must
not mark PR #50's CycloneDX `composition` complete merely because this experiment enumerated source
trees; exact linked closure and notice generation are still missing.
