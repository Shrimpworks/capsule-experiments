# C5b4 deterministic libkrunfw recovery

Date: 2026-08-12

Scoped deterministic recovery: `PASSED`

Complete C5b executable successor: `BLOCKED`

Controlled C5b execution and runtime/profile admission: `BLOCKED`

## Question

Can Capsule recover the exact retained libkrunfw v5.5.0 boot-kernel-carrier bytes from the
official prebuilt-source release archive using two deterministic, network-denied, no-run builds?

Yes. Both fresh builds produce the exact 24,339,104-byte `libkrunfw.5.dylib` at SHA-256
`0b14f4b8005dafd33c38df5935b9efdb6381c724224b3967ba1cecbecf10b6e9`, and the results are
byte-identical.

## Defensive boundary

This experiment is local, construction-only, and credential-blind. It consumes official GitHub
release asset `441852825`, `libkrunfw-prebuilt-aarch64.tgz`, exact size 19,709,993 and SHA-256
`5bfae6efee63dbdf04a8fac2a69d772d9f900af2f54c4429b4acdfd6d86b9979`. The archive inventory
was checked before extraction for absolute paths, dot traversal, and non-file/non-directory member
types. Two fresh mode-0700 stages were extracted without preserving the archive owner, normalized
to `2000-01-01T00:00:00Z`, and built independently under `sandbox-exec` with network denied and an
empty environment containing only the exact variables recorded in the provenance.

The output was never loaded, linked into another artifact, dynamically inspected, or executed. The
embedded kernel was not extracted or run. No libkrun API, HVF, VM, guest, credential, signing
identity, explicit signing command, service, product state, or admission state participated. The
static readback records the linker-generated ad-hoc signature rather than misrepresenting the
output as unsigned.

## Retained packet

- `inputs/libkrunfw-prebuilt-aarch64.tgz`: exact official prebuilt-source release asset.
- `artifacts/libkrunfw.5.dylib`: exact recovered output from build A; build B was independently
  compared before this copy was retained.
- `sources/`: exact five archive members, including `kernel.c`, `Makefile`, `bin2cbundle.py`, and
  both upstream license texts.
- `manifests/recovery.json`: exact archive, member, build, environment, output, effect, and blocker
  facts.
- `manifests/archive-manifest.json`: closed retained-file inventory by mode, byte count, and
  SHA-256, excluding itself.
- `evidence/2026-08-12/`: environment, archive safety, A/B comparison, static Mach-O, result,
  mutation, SBOM, and provenance evidence.
- `scripts/verify.mjs` and `scripts/test-mutations.mjs`: independent raw-byte/static verifier and
  five bounded refusal mutations.

## Verification

```sh
node experiments/typed-guest-transport-c5b4-libkrunfw-recovery/scripts/verify.mjs
node experiments/typed-guest-transport-c5b4-libkrunfw-recovery/scripts/test-mutations.mjs
git diff --check
```

The retained verifier does not rebuild the dylib. The two-build procedure and exact commands are
recorded in `manifests/recovery.json` and `evidence/2026-08-12/provenance.intoto.json`; the retained
output is independently checked against both the official archive and canonical historical
identity.

## Claim boundary

This closes the absent-libkrunfw-byte blocker only. The governed `deno_core` executable and full
controlled-test controller remain separate `BLOCKED` C5b inputs. Full preferred-form Linux/kernel
source, configuration, patches, build tooling, and corresponding-source compliance have not been
closed by an archive containing generated `kernel.c`; distribution/admission therefore remains
`BLOCKED`. Accepted ADR-0041 continues to make libkrunfw the sole runtime boot-kernel carrier and
the extracted kernel evidence-only, with no separate firmware path authority.
