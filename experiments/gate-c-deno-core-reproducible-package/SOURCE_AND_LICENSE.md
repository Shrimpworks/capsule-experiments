# Source, license, and publication inventory

Status: engineering inventory, not legal advice. **Publication closure is blocked.**

The machine-readable source and license inventories are
`evidence/2026-08-02/source-bundle-inventory.json` and
`evidence/2026-08-02/license-and-source.json`.

## Declared source set

An exact source publication candidate must contain or independently bind:

1. Deno v2.9.4 source archive `95f9d836...e6dc94` and commit `14eea316...b982` for
   upstream review correspondence.
2. Original `deno_core` 0.409.0 crate `16b44f6f...778b4`, both ordered Capsule patches,
   the resulting patched tree, and the restoration mutation/test record.
3. Every one of the 191 registry packages in the normalized source bundle
   `912ee37b...4df58c`, including original crate checksum, declared repository, license
   expression, and retained root license/notice file hashes.
4. `rusty_v8` commit `d305e6afa...9382b`, the exact `v8` source/dependency revisions used to
   create archive `8d91df74...20595`, its build configuration, and generated third-party notices.
5. The wrapper, snapshot builder, Cargo manifest/lock, builder recipe, environment, flags, and
   exact fixed fixtures.
6. If the dynamic Bookworm root is distributed, the exact OCI layers plus corresponding Rust,
   Debian, glibc, GCC runtime, and other source/license publication subjects.

## Observed closure

- Cargo lock graph: 193 packages; 191 registry and two path packages.
- Cargo source bundle: all 191 registry sources, verified against each lock checksum.
- License declarations: 191 of 191 registry packages.
- Root license/copying/notice file evidence: 179 of 191 packages, with file digests retained.
- `deno_core`: MIT declared; original and patched source identities specified.
- `rusty_v8`/V8 archive: exact binary and source-commit identities specified, but complete
  archive-corresponding source/notice closure is not available.

## Fail-fast blocker

The published `v8` 150.2.0 crate explicitly excludes `LICENSE*` and large upstream source/document
sets to fit crates.io limits. The official prebuilt archive is content-addressed by this experiment,
but it does not carry a complete source manifest or generated third-party notices. A source URL and
MIT package field are not enough to infer the archive's transitive notice set.

Do not distribute or admit this candidate as a closed runtime bundle until an owner obtains and
independently verifies the exact `rusty_v8` build provenance, V8/dependency source revisions,
licenses, and generated notices corresponding to the archive. Legal/compliance review remains a
separate requirement.
