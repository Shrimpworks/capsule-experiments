# Fixture and source provenance

## Public identities

- Test262 source: `tc39/test262` commit
  `f2d1435644797268dca1f7988cad5a4e89ccd8d2`.
- Retained prefetch archive identity:
  `test262-f2d1435644797268dca1f7988cad5a4e89ccd8d2.tar.gz`, SHA-256
  `039a8d715ab22c629d2697052661b1df6f163b4c381036261b1ea58af740dc31`.
- Test262 license: BSD-3-Clause; the upstream license and fixture metadata govern
  the public source. This repository retains only small adapted syntax cases and
  their source paths, not the archive.
- rusty_v8 release: `denoland/rusty_v8` tag `v150.2.0`, asset
  `librusty_v8_release_aarch64-apple-darwin.a.gz`, release-reported and locally
  verified SHA-256
  `ea605dbec81f710db6483bdade8feb64ef040fb8b3b1a7b060b196bc4e5a1156`,
  size 39,029,481 bytes. The archive is an external prefetch and is not committed.
- Locked Cargo graph SHA-256:
  `505669a07338603876bc96c242f8d5af386d3a13139e70110a8b52f39bae69ac`.

## Bounded Test262-derived cases

The manifest labels every adapted case. Representative upstream sources examined
at the pinned commit were:

- `test/language/module-code/early-dup-export-id.js`;
- `test/language/module-code/early-dup-lex.js`;
- `test/language/expressions/dynamic-import/assignment-expression/import-meta.js`;
- `test/language/expressions/dynamic-import/syntax/invalid/no-args.js`;
- `test/language/module-code/ambiguous-export-bindings/namespace-export-star-as-from-1_FIXTURE.js`;
- the `test/language/module-code/` import/export grammar fixtures; and
- the `test/language/import-attributes/` grammar fixtures.

The local files are reduced, standalone grammar probes. Test262 harness metadata,
host hooks, evaluation, and runtime assertions are intentionally not used. The
experiment only parses the bytes.

## Capsule-owned cases

The corpus also retains the required scanner false negative, grammar/property
counterexamples, parse-recovery controls, exact/cap-plus-one and invalid-UTF-8
boundaries, and one restoration mutation for every forbidden AST category. The
expected outcomes are canonical in `fixtures/manifest.tsv`.
