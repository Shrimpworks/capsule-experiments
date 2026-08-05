# V1 artifact assessment

Decision: **retain the exact V1 artifact and evidence, but do not enroll or activate it**.

This slice closes the bounded source/artifact question on one observed host: exact Oxc 0.140.0,
Rust 1.95.0, the complete locked offline graph, the fixed V0 codec, all 28 canonical M1 HOLD
results, typed diagnostic refusal, restoration/mutation checks, source and registry checksums,
license/notice inventory, CycloneDX SBOM, and two clean-directory same-host byte reproduction.
`evidence/artifact-profile.bin` binds the actual executable, build manifest, and assessment using
the V0 artifact-profile layout.

It deliberately does **not** close enrollment or adoption. The Mach-O has a valid identity-free
linker ad-hoc signature whose CodeDirectory digest is retained; that signature grants no Team or
installation identity. The provenance and assessment are unsigned, and the two builds share one
host, toolchain installation, Cargo cache, and administrator. No independent builder or clean host
reproduced the bytes, no installation authority signed the artifact or assessment, and no
vulnerability-monitoring owner, response SLA, or release cadence exists.
Therefore the artifact profile is `not-enrolled`; it cannot replace an active artifact.

V2 must separately seal the profile identity into a fixed launch descriptor and prove the macOS
sandbox, inherited-descriptor closure, path/environment/cache/key/network/storage denial, exact
memory/CPU/output/process/time ceilings, deadline kill/reap, and clean restart. V3/V4 must add
independent daemon and Broker invocations; V6 must prove runtime no-loader behavior. Until those
gates pass, timeout, crash, signal, malformed/partial output, and any binding mismatch have no
usable result and must refuse. This artifact is not execution authority or a runtime boundary.

Update rule: any source, dependency, feature, Oxc/toolchain/target/build-flag, protocol, SBOM,
notice, assessment, or artifact byte change creates a new artifact profile and reruns the entire
V0/V1 corpus and evidence generation. Active installations may accept only a separately reviewed,
installation-authority-enrolled profile. Rollback may select only a still-enrolled prior profile;
unknown, missing, tampered, unsigned, or revoked profiles refuse and may require quarantine or a
trust-epoch transition under the future installation policy. There is no compatibility fallback,
scanner fallback, or unreviewed parser substitution.
