# Completed compiled artifact payload archive

Work item: completed one-time compiled artifact payload retention

Status: `PASSED` for exact byte retention, closed inventory, cross-artifact copy verification, and archived mutation-test sources.

Scope: repository-local, non-production evidence copied from `Shrimpworks/capsule-corp` commit `d11cf94704ea8647614f4c8f4424e90821f2dcb3`. No binary is installed, signed, launched, or published as a Release asset by this archive.

This archive preserves six completed Capsule artifact trees:

- Source Validator v1;
- Source Validator V2's Darwin-only process-profile harness, which binds and executes the exact V1
  payload only as one-time local evidence;
- Source Validator R2 unsigned role bundles;
- macOS I1A unsigned application shell;
- macOS I1B/Source Validator R3 signed-development evidence; and
- macOS I2B2 unsigned installation bundle.

`payloads/capsule-corp/artifacts/` preserves exact compiled payloads, dependent harnesses,
manifests, evidence, sources, and reproduction scripts. `source-bindings/capsule-corp/` preserves
the Capsule tests and canonical documents that bound those bytes at the source commit.
`SOURCE_FILES.txt` and `SHA256SUMS` close the copied inventory.

The archive contains 15 tracked Mach-O placements representing six unique compiled identities. R2's four role-distinct launcher/parser identities are copied unchanged into I1A and I2B2; I1A's app-shell executable is copied unchanged into I2B2. Six inactive 256-byte resource-policy placements represent two role-distinct policy identities. Source Validator v1 retains one 160-byte artifact-profile vector. R3 retains signed executable identities as evidence records only; signed executable payloads were never tracked and are not claimed as Release assets.

Verification:

```sh
node experiments/completed-compiled-artifact-payloads/scripts/verify.mjs
```

`--write` regenerates only `SOURCE_FILES.txt` and `SHA256SUMS` from the copied payload and binding trees:

```sh
node experiments/completed-compiled-artifact-payloads/scripts/verify.mjs --write
node experiments/completed-compiled-artifact-payloads/scripts/verify.mjs
```

Limitations:

- same-host reproduction remains same-host evidence, not independent-builder proof;
- Apple Development R3 evidence is not Developer ID, notarization, distribution, or Release publication;
- no artifact here is product-admitted or current runtime/backend/profile evidence; and
- canonical decisions remain owned by `capsule-corp`.

Owner: Capsule maintainers.

Removal/replacement condition: retain until every exact historical payload identity and its mutation/reproduction evidence is superseded by a separately reviewed immutable archive that preserves the same closed inventory and source binding.
