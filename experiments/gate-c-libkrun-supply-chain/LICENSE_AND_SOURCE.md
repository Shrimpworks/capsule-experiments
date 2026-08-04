# License and exact-source publication notes

This is an engineering inventory for counsel and release owners, **not legal advice**. Distribution
must be reviewed against the actual release contents, distribution method, jurisdictions, and
applicable license texts.

## Observed license inputs

| Component | Observed declaration | Engineering action |
| --- | --- | --- |
| libkrun 1.19.4 | Apache-2.0 repository license and Cargo package declarations | Ship the license, preserve notices/attribution, mark Capsule modifications, inventory incorporated BSD-style and transitive components, and check for any NOTICE file in the exact source. |
| libkrunfw 5.5.0 library/generated code | Upstream README: LGPL-2.1-only | Ship the exact library source and license text; preserve a practical modification/relinking route and have counsel assess signed/hardened-runtime packaging effects. |
| Embedded Linux 6.12.91 and libkrunfw patch directory | Upstream README: GPL-2.0-only | Publish or accompany the complete corresponding source for the exact embedded kernel, config, patches, and build scripts, with the GPL text and required notices. |
| Cargo dependency closure | Per-package expressions in `sbom-input.cdx.json` | Generate a release SBOM and bundled-license set from the exact resolved closure; review unknown, compound, or license-file-only declarations. |
| Go guest launcher | Go toolchain/runtime license plus Capsule source | Retain the exact Go version/source provenance and include the Go license/required notices for embedded standard-library/runtime code. |
| Apple frameworks/SDK | System dependency, not copied by this spike | Record SDK/toolchain identity; verify release packaging does not redistribute prohibited SDK material. |

Upstream specifically states that programs linking to libkrunfw need not adopt GPL/LGPL merely due
to linking. That statement is upstream's characterization, not a Capsule legal conclusion.

## Exact publication bundle per distributed runtime digest

Publication must map one immutable distributed-byte digest to at least:

- libkrun source archive at commit `728df8125077d0db44265f6e997c72b81b65c015`;
- both Capsule patch files at their recorded SHA-256 digests and a machine-applicable patch order;
- Cargo manifests and `Cargo.lock` (`9d5dc785...f288c`), vendored crate archives/checksums, and
  license files for the resolved target/feature closure;
- libkrunfw source at tag/commit `v5.5.0`, not only the prebuilt `kernel.c`;
- pristine Linux 6.12.91 source archive with a pinned digest, exact libkrunfw config, every applied
  GPL patch, generated config, build scripts, and preferred-form modification source;
- guest launcher source, `go.mod`, exact Go toolchain identity, standard-library notices, and build
  command;
- pinned Debian sysroot package archives and checksums, Rust toolchain, LLVM/LLD/Xcode SDK, build
  environment, deployment target, path-remapping flags, and locale/time inputs;
- runtime packaging scripts, entitlements, Info.plist, install-name mutations, signing order, and
  the unsigned/pre-sign and final signed/notarized digests;
- all license texts, notices, source-offer/publication metadata, and an immutable availability URL.

The current retained macOS flow downloads a digest-pinned prebuilt libkrunfw archive and verifies
`kernel.c`, but does not fetch or retain the complete corresponding kernel/libkrunfw source bundle.
That is sufficient for the smoke build input, not for exact-source publication.

## Signed bundle and LGPL review point

Replacing an LGPL dylib inside a signed, hardened, notarized app invalidates the bundle signature.
Release engineering must provide counsel with the exact technical facts: whether users receive
separate dynamically linked libraries, whether relinking/re-signing is practically possible, what
keys are required, and whether object/source materials are offered. Do not treat dynamic linking
alone as closing this review.
