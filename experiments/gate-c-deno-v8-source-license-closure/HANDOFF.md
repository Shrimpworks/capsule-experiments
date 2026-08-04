# Research handoff

## Question and defensive scope

Can the exact official prebuilt `rusty_v8` Linux/arm64 archive used by the governed `deno_core`
candidate be mapped to complete corresponding source, build inputs, licenses/notices, and
publication obligations strongly enough to remove PR #50's V8 blocker?

This defensive work stayed within the Capsule repository, exact official public upstream inputs,
and controlled local processes. It did not access unrelated systems, identities, credentials,
workloads, backends, guests, signing services, or deployments.

## Result

**SOURCE-LICENSE-CLOSURE-NO-GO.** Exact archive/release/source revisions and the Deno V8 patch
stack are proven. Complete immutable publisher inputs, exact linked GN closure, generated notices,
and corresponding-source publication are not. No rebuild was attempted because exact inputs are
unavailable. Keep runtime/profile selection and `RUNTIME-001` blocked.

## Direction, evidence, and blockers

1. Intended engineering direction: governed `deno_core` is the first runtime candidate; Node is a
   later portability/contingency proof.
2. Current evidence: exact asset digest, signed rusty_v8 commit/tag, successful release job,
   21-source revision closure, four-commit V8 patch stack, 1,875 archive members, 1,557 embedded
   source paths, and 726 license/notice candidates are retained.
3. Admission blockers: immutable publisher environment, exact GN/Ninja link graph, complete notice
   set, independent rebuild, source publication, PR #50 dynamic runtime root/independent-builder
   gaps, and remaining full-profile composition.

## Retained files

- `RESULTS.md`: evidence-backed decision and limits.
- `SOURCE_PUBLICATION.md`: corresponding-source plan and proposed real-fork boundary.
- `generate-evidence.mjs`: exact-input digest checks and deterministic manifest generator.
- `verify.sh`: offline fail-closed verifier.
- `evidence/2026-08-02/*.json`: provenance, source/patch, build, archive, license/notice, and
  admission records.

## Confidence and limitations

Confidence is high in the exact identity chain and NO-GO. GitHub asset digest, run/job IDs, commit
trees, gitlinks, patch hashes, and retrieved source hashes are direct official evidence. Confidence
is intentionally not upgraded for linked-component completeness: the official archive does not
publish the GN/Ninja closure. Public Actions metadata was available, while job logs returned HTTP
403 without valid authenticated log access. License expressions are an engineering inventory, not
legal advice.

No real fork was created. If work continues, the parent must confirm ownership for proposed hosted
forks of `denoland/deno` at `14eea316...b982` and `denoland/rusty_v8` at `d305e6a...9382b` before
external creation. The existing exact `denoland/v8` patch stack is recorded, not relabeled as a
Capsule fork.
