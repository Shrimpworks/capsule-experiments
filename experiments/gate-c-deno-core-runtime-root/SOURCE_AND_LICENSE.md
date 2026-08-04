# Runtime-root source, license, and notice mapping

Status: engineering inventory, not legal advice. Runtime-library mapping is closed for this
experiment; PR #50's archive-corresponding V8 publication blocker remains unchanged.

The runtime-root library bytes come only from official Debian snapshot objects:

| Root subjects | Binary package | Source package | Version | Notice retained |
| --- | --- | --- | --- | --- |
| loader, `libc.so.6`, `libm.so.6` | `libc6` arm64 | `glibc` | `2.36-9+deb12u14` | Debian `libc6/copyright` |
| `libgcc_s.so.1` | `libgcc-s1` arm64 | `gcc-12` | `12.2.0-14+deb12u1` | Debian `gcc-12-base/copyright` |

`manifests/package-sources.json` records each binary package's snapshot object, first-seen time,
size, SHA-256, corresponding `.dsc`, and the `.dsc` SHA-256 identities for original and Debian
source archives. The notice-bearing `gcc-12-base` package contributes no runtime code bytes.

The root includes both exact Debian copyright files. The complete Debian source archives are bound
but not copied into Git. Publication/release engineering must retrieve and verify them from the
pinned source descriptors and complete legal review before distribution.

This does not close the governed candidate's larger publication set. The official `v8` 150.2.0
crate still excludes `LICENSE*`, and no complete archive-corresponding V8 source/build/third-party
notice set exists in retained evidence. A future governed runtime repository must publish that set,
the full Cargo source graph, exact patches, runtime-root packages/sources/notices, SBOM, and
provenance together.
