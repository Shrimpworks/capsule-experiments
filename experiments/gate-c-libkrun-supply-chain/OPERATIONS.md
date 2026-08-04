# Runtime supply-chain operations

These workflows govern a future development runtime. They do not authorize execution today. The
network-capable updater/release pipeline performs external fetch and full metadata processing;
the live Supervisor consumes only a bounded verified local trust snapshot.

## Ownership and cadence

| Function | Accountable owner | Minimum cadence |
| --- | --- | --- |
| Upstream libkrun/libkrunfw/kernel monitoring | Runtime supply-chain maintainer | Automated daily; human weekly |
| RustSec/OSV/GHSA/CVE and Apple security advisory intake | Product security on call | Automated daily; urgent page on applicable critical/high |
| Patch/fork rebase and upstream status | macOS backend maintainer | Weekly and every upstream release |
| Dependency/SBOM/license delta | Release engineering plus open-source compliance | Every candidate build; monthly inventory review |
| Reproducible build and provenance | Hermetic-build owner | Every candidate, two independent builders before activation |
| Backend attack corpus and validation record | Platform security | Every byte/config/host-floor change; scheduled quarterly rerun |
| Signing/notarization and TUF publication | Release engineering, two-person approval | Every release; key/access review quarterly |
| Emergency disable/revocation | Security incident commander | 24x7; exercise quarterly |
| Exact-source publication availability | Release engineering plus compliance | Every release; automated daily availability check |

Proposed response targets: acknowledge applicable critical reports within four hours, publish a
local emergency disable within 24 hours when exploitation or impact is credible, decide high-risk
admission within two business days, and complete routine supported-version updates in the monthly
window. These are proposed operational targets, not observed service levels.

## Advisory and patch intake

1. Ingest authenticated upstream releases, security advisories, RustSec/OSV/GHSA/CVE feeds, Linux
   stable announcements, Apple security releases, and private reports into a case with immutable
   source references.
2. Map affected package/version/config/feature/host ranges against the release SBOM and runtime
   manifest. Do not infer reachability from a package name alone.
3. Triage exploitability in both VMM and guest contexts; record observation, inference, unknowns,
   embargo scope, and a fixed severity rationale.
4. For code intake, fetch into a quarantined builder, verify upstream identity, inspect the exact
   diff, rebase the governed patch queue, run static checks/fuzz/corpus/reproducibility, and require
   two-person review. No live Supervisor or daemon fetches or applies patches.
5. Submit generalized fixes upstream. Until accepted and released, carry each patch with owner,
   rationale, source/target commits, digest, tests, upstream link, rebase history, and removal date.

## Build, update, and activation

1. Resolve an immutable source/material set from pinned mirrors. Reject moving tags, unpinned
   package indexes, network fallback, missing checksums, or dirty source.
2. Build in two isolated builders with the exact deployment target and path remapping. Compare
   unsigned artifacts; divergence blocks the candidate until explained.
3. Generate complete SBOM, SLSA/in-toto provenance, license bundle, exact-source publication bundle,
   unsigned manifest, and then final signed/notarized-byte manifest. A timestamped signature is an
   attributed final byte identity, not expected to reproduce from source.
4. Run signature, entitlement, install-name, minimum-OS, Gatekeeper, clean-machine, malicious-guest,
   resource, recovery, update, rollback, and cross-job tests on the exact final bytes.
5. Publish targets and revocation/disable metadata through pinned TUF roles. Independent review,
   profile activation, and `BackendValidationRecord` remain separate decisions.
6. The network-capable updater verifies repository metadata and emits a bounded local
   `TrustSnapshot`; it receives no installation-root authority. A separate authorized installer/
   trust ceremony stops new attempts, reconciles active attempts, signs a `PreparedUpdate`, obtains
   user/admin authorization, and performs the crash-safe component transition described by the
   repository update model. Partial replacement enters `repair-required`; it never selects
   whichever dylib happens to load.
7. Activate only after pending-verification readback confirms exact file digests, code
   requirements, entitlements,
   runtime manifest, trust snapshot, epoch, and validation record. Friendly aliases resolve to the
   immutable identity before planning and approval.

## Rollback

- Rollback means a new, explicitly authorized transition to a previously built, still-supported,
  non-revoked exact bundle; it is not filesystem restoration or TUF version rollback.
- Preserve TUF rollback protections, trust-epoch history, grants, attempts, cleanup state, and
  evidence. Never restore consumed approvals or erase why the newer version failed.
- Re-run host compatibility and required regression evidence for the rollback target. If neither
  target is admissible, disable execution and enter repair rather than widening policy.
- Keep at least two non-revoked exact runtime bundles only when storage and license/publication
  policy permit; otherwise recovery requires an authenticated reinstall path.

## Runtime disable and revocation

1. Security publishes a narrowly scoped, versioned disable object under the appropriate TUF role,
   identifying exact runtime/profile digests, affected host ranges, reason code, issue time, and
   response policy. Threshold approval is required for broad emergency disable.
2. The updater verifies external metadata and emits a compact signed local `TrustSnapshot`; the
   Supervisor performs no live network or full TUF parsing.
3. Before grant consumption and again before guest start, the Supervisor rejects disabled,
   revoked, stale-beyond-policy, or unknown runtime/profile state. The daemon cannot override or
   clear it.
4. For active attempts, the enrolled Supervisor alone applies the accepted response policy and
   performs verified exact termination or quarantine based on impact. Indeterminate teardown
   blocks ordinary success and artifact release.
5. Offline grace is explicit and bounded. A known local disable always wins; network failure never
   causes acceptance of unsigned or rollback metadata.
6. Recovery requires an authorized replacement, prepared trust transition, exact readback, and new
   validation/activation state. Revocation history remains retained.

Quarterly exercises cover compromised publisher, malicious mirror, expired metadata, partial
install, coherent local rollback limitation, active-attempt disable, unavailable updater, bad new
release, and rollback to a still-trusted exact prior bundle.
