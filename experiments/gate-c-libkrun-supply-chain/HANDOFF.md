# Gate C runtime supply-chain synthesis handoff

Date: 2026-07-31

## Current status and decision

**Track decision: conditional pass for feasibility and design; no-go for admitting the currently
observed runtime bytes into a development `BackendValidationRecord`.**

The track demonstrated that unsigned libkrun 1.19.4 and libkrunfw 5.5.0 dylibs can match across two
clean source directories when Cargo is offline/locked, Rust paths are remapped, and the deployment
target is explicitly macOS 14. It did not establish independent-builder reproducibility. The
retained default build diverges across source paths. The rebuilt runner and firmware declare macOS
26.0, the current package is ad-hoc signed, no Developer ID identity or notarization result was
available, exact corresponding source is incomplete, and update/revocation workflows are designs
rather than implemented controls.

No external process remains pending. Residual uncertainty is bounded by the blockers below; there
is no notarization, upstream patch, independent-builder, legal/compliance, or floor-host result to
wait for in this track.

## Exact retained paths

- Primary results: `experiments/gate-c-libkrun-supply-chain/RESULTS.md`
- Patch and launcher review: `experiments/gate-c-libkrun-supply-chain/PATCH_REVIEW.md`
- License/source inventory: `experiments/gate-c-libkrun-supply-chain/LICENSE_AND_SOURCE.md`
- Advisory/update/rollback/disable design: `experiments/gate-c-libkrun-supply-chain/OPERATIONS.md`
- Machine admission decision:
  `experiments/gate-c-libkrun-supply-chain/evidence/admission-checklist.json`
- Runtime manifest input:
  `experiments/gate-c-libkrun-supply-chain/evidence/runtime-manifest-input.json`
- Incomplete in-toto/SLSA input:
  `experiments/gate-c-libkrun-supply-chain/evidence/provenance-input.intoto.json`
- CycloneDX input:
  `experiments/gate-c-libkrun-supply-chain/evidence/sbom-input.cdx.json`
- Reproduction/signing/inventory verification scripts:
  `experiments/gate-c-libkrun-supply-chain/run-reproducibility.sh`,
  `test-signing-flow.sh`, `generate-sbom-input.mjs`, and `verify.sh`
- Original Gate C sources under review:
  `experiments/gate-c-libkrun-hvf/patches/` and
  `experiments/gate-c-libkrun-hvf/guest-probe/launcher/main.go`

## Commands and verification results

| Command | Result |
| --- | --- |
| `./experiments/gate-c-libkrun-hvf/prepare-libkrun.sh` | Pass: pinned commit, patch presence, firmware archive, and `kernel.c` digest checks; `BLK=1` build completed. |
| `./experiments/gate-c-libkrun-hvf/build-runner.sh` | Pass for local ad-hoc packaging/signature verification; not release signing. |
| `./experiments/gate-c-libkrun-hvf/audit-build.sh` | Pass: commit, two patches, signatures, sandbox/hypervisor entitlements. |
| `./experiments/gate-c-libkrun-supply-chain/run-reproducibility.sh` | Expected negative: default clean libkrun builds diverged (`6789832b...23cd` vs `e8fb9abc...582ec`). |
| `CAPSULE_REMAP_PATHS=true ./experiments/gate-c-libkrun-supply-chain/run-reproducibility.sh` | Pass controlled case: locked/offline libkrun A/B both `24f14dbc...3372`; libkrunfw A/B both `0b14f4b8...b6e9`; both minOS 14.0. |
| `./experiments/gate-c-libkrun-supply-chain/test-signing-flow.sh` | Pass: same-basename timestamp-free ad-hoc signatures matched; post-sign mutation was rejected. Developer ID/notary flow not tested. |
| `fnm exec --using=22.22.1 -- node ./experiments/gate-c-libkrun-supply-chain/generate-sbom-input.mjs` | Pass: 115 components; 113 Cargo builder inputs, 83 in the final libkrun runtime closure, plus libkrunfw/Linux. |
| `./experiments/gate-c-libkrun-supply-chain/verify.sh` | Pass: JSON, script syntax, SBOM inventory/license references, pins, patch application, and diff checks; reports `admissionDecision=no-go`. |
| `pnpm install --frozen-lockfile` | Pass after permission to update pnpm's user-level project-store link; lockfile unchanged. |
| `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm verify:schemas` under Node 22.22.1 | Pass. |
| `go test ./...`, `go vet ./...`, `go build ./...` | Pass. |

## Security and design blockers

1. **Final byte set is incomplete.** No one manifest binds the final notarized app archive, runner,
   both dylibs, guest launcher, root/runtime/Bun disks, entitlements, Info.plist, install-name state,
   signatures/CDHashes, source/publication objects, and accepted review/validation records.
2. **The retained build is not hermetic.** It relies on a moving Debian package index/sysroot,
   unpinned package archives, local Xcode/Homebrew toolchains, and a path-sensitive default Rust
   build. The controlled remediation used one host/toolchain/sysroot, not two independent builders.
3. **Distribution identity is absent.** Current output is ad-hoc signed. No Developer ID timestamp,
   notarization ticket, staple, Gatekeeper acceptance, or clean-machine readback exists here.
4. **The macOS 14 floor is not validated.** Upstream declares Apple Silicon/macOS 14+, and the
   controlled dylibs declare minOS 14, but current runner/firmware declare 26.0 and no exact final
   bundle ran on a clean macOS 14 host.
5. **Patch governance is incomplete.** Both patches remain out of the inspected upstream `main`.
   The rpath change is a global behavior change; the exact-string mount fix is narrower than an
   upstream-grade parser. No upstream issue/PR, owner, rebase log, expiry, or release adoption exists.
6. **The launcher is smoke-scope only.** It must independently construct its environment, close
   unintended descriptors, establish/verify the complete capability state, bind the executable,
   and define seccomp, dumpability, signal, shutdown, and post-drop assertions.
7. **Source/license publication is incomplete.** The prebuilt firmware input is pinned, but the
   complete libkrunfw source, Linux source/config/patch/build inputs, vendored crates, toolchains,
   notices, and counsel-reviewed LGPL relinking implications are not a release publication bundle.
8. **Advisory/update/revocation are unimplemented.** There is no exercised TUF role, local
   `TrustSnapshot`, runtime-disable object, prepared update, rollback, readback, or incident drill.
9. **Backend validation is incomplete.** Other Gate C tracks still own disk/output, console/timeout,
   installed recovery, malicious-guest, and shared attack-corpus evidence. Supply-chain success
   cannot promote the backend alone.

## Claims the coordinator may make

- A development-only controlled double build on one macOS 26.5.2 host produced byte-identical
  unsigned libkrun/libkrunfw dylibs after explicit path remapping, Cargo offline/locked mode, and a
  macOS 14 deployment target.
- The retained default libkrun build was observed to vary with source directory; path sensitivity is
  the supported explanation, not a proof that every other nondeterministic input is eliminated.
- Timestamp-free ad-hoc signing was repeatable for identical basenames in the tested flow, and a
  post-sign mutation failed code-sign verification.
- The machine inventory contains 115 declared components and separates final runtime closure from
  build-only workspace inputs; it is an SBOM input, not a release SBOM.
- Both patches and the launcher received a static development-spike review with explicit findings.
- Apple Silicon/macOS 14+ is a provisional upstream/source planning floor; exact validated support
  remains limited to the recorded host/configuration.
- The track is a conditional feasibility pass and the current exact-byte admission decision is
  no-go.

## Claims the coordinator must not make

- Do not claim hermetic, clean-room, or independent-builder reproducibility.
- Do not claim complete provenance, complete SBOM, dependency vulnerability clearance, or exact
  corresponding-source publication.
- Do not claim Developer-ID-signed, notarized, stapled, Gatekeeper-accepted, or clean-machine
  distribution from this track.
- Do not claim macOS 14 runtime validation, Intel support, upstream patch acceptance, or a stable
  upstream maintenance commitment.
- Do not claim the launcher/patches are production-ready or that signatures/rebuild equality prove
  correct or secure logic.
- Do not present the license inventory as legal advice or a compliance conclusion.
- Do not claim runtime disable, rollback safety, TUF trust, trust-transition durability, or advisory
  service levels are implemented.
- Do not promote libkrun/HVF to `validated-local`, production, continuous integrity, platform
  attestation, or any authoritative tier.

## Recommended ADR-0022 integration changes

Do not reverse the candidate selection. Amend its evidence/conditions in the later coordinated
integration pass:

1. State that the supply-chain track conditionally passed **build-control feasibility** while the
   current runtime bytes are no-go for a development validation record.
2. Separate two immutable identities:
   - reproducible unsigned build subjects bound to source/material/toolchain provenance; and
   - final distributed byte subjects bound after install-name changes, nested signing,
     timestamping, notarization/stapling, and archive packaging.
   Runtime admission must use the latter while retaining a reference to the former.
3. Require a governed fork until both patches are accepted in an upstream release and the exact
   profile is revalidated. The fork policy must bind patch owner, source/target commits, digest,
   tests, upstream reference, rebase history, expiry, and exact source publication.
4. Clarify that Apple Silicon/macOS 14+ remains a provisional source floor. An exact distributed
   bundle cannot claim that floor until every Mach-O declares it and the same signed/notarized bytes
   pass on a clean floor host and representative newer hosts.
5. Add explicit admission prerequisites: two independent builders, pinned/vendored sysroot and
   crate inputs, complete SBOM/provenance/license/source bundle, Developer ID/notary/Gatekeeper
   readback, advisory ownership, TUF disable, crash-safe update/rollback exercise, and every required
   Gate C validation row.
6. Preserve the current statement that candidate selection is not posture promotion and make the
   supply-chain admission checklist a cited evidence input, not an accepted validation record.

## Recommended control-evidence matrix changes

Add narrowly scoped rows rather than folding supply-chain state into general backend reputation:

| Proposed row | Required claim/mechanism | Current status/evidence |
| --- | --- | --- |
| `SUPPLY-001` | Exact source/material/toolchain pins plus two independent reproducible unsigned builds | `spike-observed` only for same-host path-remapped feasibility; independent/hermetic proof open. |
| `PATCH-001` | Every non-upstream patch and trusted launcher has owner, review, tests, upstream status, rebase/expiry, and source publication | `spike-observed` static review; governance and hardening open. |
| `DIST-001` | Final nested Developer ID signature, notarization/staple/Gatekeeper, clean-host readback, and exact post-sign byte manifest | `proposed`; current ad-hoc build is negative evidence. |
| `LICENSE-001` | Complete corresponding-source and bundled-license publication mapped to each final runtime digest | `proposed`; obligations/inventory only, no compliance conclusion. |
| `FLOOR-001` | Exact bundle Mach-O minimums and clean execution across the declared host floor/range | `spike-observed` build feasibility; macOS 14 execution open. |
| `REVOC-001` | Authenticated runtime/profile disable, bounded local snapshot, Supervisor refusal, active-attempt response, and recovery | `proposed`; workflow only. |
| `UPDATE-001` | Prepared authorized exact-byte update, readback, partial-failure repair, and non-revoked explicit rollback | `proposed`; integrate with `TRUST-001`, do not claim rollback-proof epochs. |

Update `TUF-001` limitations to cite the designed runtime-disable semantics but leave it `proposed`.
Update `TRUST-001` only after an actual runtime replacement/rollback fault-injection exercise. Do
not promote `NET-001`, `RES-001`, or `CLEAN-001` based on this track.

## Recommended backend-contract freeze conditions

Freeze only the minimum backend-independent identities and refusal semantics:

1. `ExecutionPlan` resolves friendly aliases before registration and binds exact digests for
   `RuntimeBundleManifest`, `ProfileRegistryEntry`, `BackendValidationRecord`, required backend
   controls, and the accepted trust snapshot/checkpoint. No execute call accepts replacements.
2. `RuntimeBundleManifest` binds every final executable/runtime byte and exact load relationship,
   including runner, dylibs/firmware, guest launcher, disks/runtime, bundle metadata, entitlements,
   signing requirements, platform range, feature set, patch-set digest, SBOM/provenance/source
   publication references, and publisher identity. It distinguishes pre-sign subjects from final
   distributed subjects.
3. `BackendValidationRecord` binds one exact runtime manifest, backend adapter/runner identity,
   host architecture/OS range, entitlements/configuration/limits, corpus/evidence digests, verdict,
   expiry, and limitations. Validation never floats to another rebuild or host range.
4. `BackendCapabilityReport` reports observed mechanisms and exact implementation identity only. It
   cannot activate a bundle or self-assert validation.
5. The Supervisor consumes already installed/admitted local records. It performs no build,
   dependency resolution, source fetch, notarization, TUF network processing, or update selection.
6. `probe/prepare` must compare installed final bytes/code requirements/load paths against the plan
   and local trust snapshot. `create` receives only a Supervisor-sealed descriptor referencing the
   admitted runtime identity; daemon/agent paths, images, flags, or alternate bytes remain
   unrepresentable.
7. Unknown, missing, mismatched, expired, disabled, revoked, stale-beyond-policy, or partially
   installed state refuses before grant consumption where observed in preflight. A disable/mismatch
   discovered after consumption burns the approval, creates no ordinary success, and preserves
   cleanup/quarantine requirements.
8. Keep patch/source/SBOM/provenance objects outside the live execution parser surface. The live
   Supervisor verifies only bounded digests/status from the signed runtime manifest and local trust
   snapshot.

Do not freeze the exact runtime-manifest wire schema until the other Gate C tracks provide final
disk, output, console, resource, installed-layout, and recovery subjects. Do freeze that aliases
cannot survive into registered authority and that every admitted identity is immutable/digest-bound.

## Recommended next fake-backend/registered-plan slice

Keep `DevelopmentLifecycle.CreatesGuest() == false` and `ErrRealBackendBlocked` unchanged. Add
backend-independent contract tests before any libkrun adapter wiring:

1. Evolve plan validation from error-only to an exact-byte-derived typed projection such as
   `ValidatedPlan`, retaining the original bytes as authoritative. The projection should expose
   immutable runtime/profile/validation/trust digests and required backend controls; it must never
   accept detached caller-supplied replacements.
2. Make the integrity/preflight port return a bounded `RuntimeIntegrityAssessment` identity rather
   than only `error`. Bind its trust-snapshot digest, runtime-manifest digest, registry/validation
   digests, observed installed-byte identity, assessment mode, and limitations to the attempt and
   eventual transcript.
3. Introduce a fake `RuntimeAdmissionVerifier`/resolver port that consumes only local immutable
   records and returns an `AdmittedRuntime` or a stable refusal code. It must not fetch, build,
   install, notarize, or mutate activation state.
4. Give the fake backend a typed `BackendCapabilityReport` with exact fake implementation digest
   and explicit unsupported controls. Test exact control matching before any create intent.
5. Add registration/preflight tests for:
   - friendly alias mutation after registration cannot change exact runtime identity;
   - missing/mismatched runner, library, firmware, launcher, or disk digest refuses;
   - wrong/expired/revoked `BackendValidationRecord` refuses;
   - runtime/profile disable in a newer accepted local snapshot refuses;
   - stale snapshot obeys explicit offline policy and never accepts unsigned/rollback state;
   - bundle or trust state changing after approval but before start burns the approval and creates
     no guest/backend handle;
   - rollback to an older still-signed but non-activated/revoked bundle refuses;
   - partial installed state produces `repair-required`, not fallback to whichever bytes load;
   - runtime admission failure cannot be converted into simulation success or artifact release.
6. Persist the selected runtime/trust/validation identities and preflight assessment on the attempt
   before backend side effects. Include them in bounded simulated transcript events.
7. Keep source publication, SBOM parsing, advisory feeds, and TUF metadata parsing as fixtures/ports
   outside the Supervisor. Tests provide already verified bounded local status records.

This slice may prove registration/admission/refusal ordering with the fake backend. It must not
claim that a real runtime is admitted, that external trust is implemented, or that any hostile
guest can safely execute.
