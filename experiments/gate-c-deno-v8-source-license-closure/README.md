# Governed deno_core V8 source/license closure

Status: `SOURCE-LICENSE-CLOSURE-NO-GO`; bounded experiment evidence only.

This experiment defensively traces the exact official Linux/arm64 `rusty_v8` archive consumed by
Capsule's governed `deno_core` candidate. It uses only this repository, exact official public
upstream inputs, and controlled local inspection. It does not select or admit a runtime, wire a
backend or guest, execute arbitrary workloads, change ADR-0003, or weaken `RUNTIME-001`.

The strategic engineering direction is governed `deno_core`. The evidence result is narrower: the
official archive's source revisions and publication job are identifiable, but its exact publisher
environment, complete linked-component closure, and generated notice set are not. Runtime/profile
admission therefore remains blocked.

## Exact identities

- `v8` crate 150.2.0 SHA-256:
  `c7f4e905df70d6c00b95e69c5f0831fd5eb5889b0116ae2b30293578c19cd1bc`.
- `rusty_v8` commit/tag: `d305e6afa7736f6e298c30ae6646f7709ee9382b` / `v150.2.0`.
- official asset SHA-256:
  `8d91df74c8a671c23f880e64038023f49e07ca85c96e15d76a87e2aac9b20595`.
- exact `denoland/v8` commit: `ac1e23989121713ca642f6650b34deff7b686896`.
- exact Chromium V8 base: `0da5ef4358784bb0af0ff5d5d7c49cdad8931d1e`, V8 15.0.245.2.

See [RESULTS.md](RESULTS.md), [SOURCE_PUBLICATION.md](SOURCE_PUBLICATION.md), and the retained JSON
manifests under `evidence/2026-08-02/`.

## Regeneration

The generator takes a local directory containing the exact retrieved inputs. Large upstream source
archives and the 176 MiB decompressed static archive are deliberately not committed.

```sh
node experiments/gate-c-deno-v8-source-license-closure/generate-evidence.mjs \
  --input-root /private/tmp/capsule-v8-source-license-closure \
  --output experiments/gate-c-deno-v8-source-license-closure/evidence/2026-08-02
```

The input root must contain `v8-150.2.0.crate`, `source-archives/`, `source-trees/`, and the exact
compressed and decompressed archive names. The generator rejects every retained source/archive
digest mismatch.

## Local verification

```sh
sh experiments/gate-c-deno-v8-source-license-closure/verify.sh
```

The verifier validates JSON structure, exact identities, archive/member counts, source and license
inventory bounds, the explicit failed admission checks, and repository diff hygiene. It does not
turn retained metadata into missing publisher evidence.
