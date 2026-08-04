# Advisory and source-operation ownership plan

Status: design-only ownership record. No updater, signing service, runtime activation, or
revocation mechanism is implemented by this experiment.

| Area | Proposed owner | Required action |
| --- | --- | --- |
| `deno_core`, Deno, and `rusty_v8` releases | Runtime engineering | Monitor exact upstream releases and source/build changes; never move a pin silently. |
| Cargo advisories and lock graph | Product security | Map RustSec/OSV/GHSA/CVE records to exact versions/features; record reachability separately from package presence. |
| V8/Chromium security and notices | Product security + release engineering | Track V8 security releases and obtain exact archive-corresponding source/notice artifacts. |
| Capsule patch queue | Runtime engineering + security architecture | Review every rebase, rerun physical/restoration corpus, and retain diff/output evidence. |
| Builder and source bundle | Release engineering | Mirror immutable OCI/source subjects, build offline, compare independent builders, and publish SBOM/provenance/licenses. |

For any advisory or update, resolve an immutable case containing upstream authority, affected exact
versions/configuration, current bundle/SBOM match, reachability evidence, severity rationale,
embargo handling, selected response, and retained verification. Network-capable acquisition and
advisory processing remain outside live daemon/Supervisor execution paths.

A future release candidate must reject moving tags, missing hashes, unknown source archives,
network fallback, dirty source, unreviewed patch drift, incomplete notices, and output divergence.
It must build on two independently controlled builders, publish exact unsigned-byte provenance,
then separately bind any final signed/notarized bytes. Activation, rollback, and emergency disable
remain governed by Capsule trust snapshots and explicit trust transitions; this experiment grants
none of those authorities.
