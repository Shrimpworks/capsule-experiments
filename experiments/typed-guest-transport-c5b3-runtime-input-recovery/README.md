# C5b3 governed runtime-input recovery

Date: 2026-08-12

Scoped recovery and reproducibility packet: `PASSED`

Exact-byte recovery or reconstruction: `BLOCKED`

Complete C5b executable successor and controlled execution: `BLOCKED`

## Question

Can the three governed C5b identities left absent by C5b2 be recovered from bounded Capsule
repositories, object databases, workspaces, caches, or the explicitly authorized local `llrt`
repository, or immediately reconstructed from the retained recipe without loading or executing a
runtime or VMM artifact?

No. The bounded search found no exact bytes. The earlier experiment retains detailed source,
builder, input, output, and same-host equality evidence, but the required acquisition inputs and
running builder environment are not currently available. This packet turns those facts into an
independently checked recovery boundary rather than treating a historical digest as an artifact.

## Defensive boundary

This work is local, read-only discovery plus repository documentation. It consumes
`Shrimpworks/capsule-experiments` commit `5a2f835e8c9df8279237f940f5af757e119593bd`
and `Shrimpworks/capsule-corp` commit `22acf665797e248028c2625586322f698bc2ba74`.

The search was confined to:

- the fresh task clones of those two repositories and their complete Git object histories;
- all Capsule-named workspaces directly under `/private/tmp`;
- Capsule-named entries directly under the current-user temporary directory;
- `/Users/dsteele/repos/llrt`, the separately named and authorized local repository.

No unrelated user directory, backup, Trash, Keychain, identity, credential value, system service,
process, network target, VM, or guest was inspected. No artifact was loaded or executed. The local
Docker daemon was not running, and no daemon or image was started or pulled.

## Retained packet

- `manifests/recovery-plan.json`: exact immutable source, builder, acquisition, artifact, and
  disposition map.
- `manifests/archive-manifest.json`: closed byte/mode inventory of the retained packet.
- `evidence/2026-08-12/search-receipt.json`: bounded locations and exact negative observations.
- `evidence/2026-08-12/result.json`: scoped result and side-effect readback.
- `scripts/verify.mjs`: independent semantic and closed-inventory verifier.
- `scripts/test-mutations.mjs`: eight fail-closed recovery-claim mutations.

The kernel remains derived evidence only. Accepted ADR-0041 makes `libkrunfw.5.dylib` the sole
runtime boot-kernel carrier; a separate firmware or kernel input must not be invented.

## Verification

```sh
node scripts/generate.mjs --check
node scripts/verify.mjs
node scripts/test-mutations.mjs
git diff --check
```

See [RESULTS.md](RESULTS.md) and [HANDOFF.md](HANDOFF.md) before attempting reconstruction.
