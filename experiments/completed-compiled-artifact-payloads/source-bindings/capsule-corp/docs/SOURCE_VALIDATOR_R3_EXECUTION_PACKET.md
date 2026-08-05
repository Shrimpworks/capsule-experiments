# Source Validator R3 signing, installation, and reachability execution packet

Date: 2026-08-04

Status: `PASSED` for the exact Apple Development installed experiment retained at
[`artifacts/macos-i1b-r3-signed-development-composition`](../artifacts/macos-i1b-r3-signed-development-composition).
The containing fixtures, exact profiles, signed constraints/entitlements, installed reachability,
refusal matrix, and cleanup evidence passed with execution disabled. This packet authorizes nothing
by itself; the experiment ran under the later explicit user authorization recorded by its scope and
evidence.

## Defensive scope and credential boundary

Defensively validate ADR-0036's role-separated Source Validator control using only the two retained
R2 bundles, purpose-built daemon/Broker containing fixtures, and this owned Mac. Do not access any
other system, identity, credential, profile, or data. Do not sign, install, register a service,
launch a component, create an App ID/profile, or mutate Keychain/platform state without a later
authorization naming those exact actions.

Apple Membership Details identifies the Individual Apple Developer Program Team as
`3DDR84M4JS`. The `W4QUR9FUL4` suffix in Apple Development certificate common names is not the Team
ID. User-run identity discovery reported new Apple Development SHA-1
`80A4969BCD1B3926020888094B9D812A283D3793`; its presence and private-key pairing do not authorize
use. Older Apple Development SHA-1 `1638CFBD9250A00B4DBD81AE8FD1C790B42F61E3` and Developer ID
Application SHA-1 `AD70CEDCA605604676C2853A229AA4664AD3F750` are not selected.

## Exact roles, bytes, and placement

R3 starts only from a fresh successful R2 reproduction whose unsigned file digests equal
[`artifacts/mjs-source-validator-r2/evidence/construction.json`](../artifacts/mjs-source-validator-r2/evidence/construction.json):

| Role | Containing bundle | Private service/signing identifier | R2 launcher SHA-256 | Parser signing identifier and R2 SHA-256 | Required installed placement |
| --- | --- | --- | --- | --- | --- |
| daemon | `com.capsulecorp.capsule.daemon` | `com.capsulecorp.capsule.source-validator.daemon.v1` | `4bc270c84f166dfb077d84458940411073f3c70a7f70db2e4af48601500b36cc` | `com.capsulecorp.capsule.source-validator-parser.daemon.v1`; `f54c349e3a61b06e0b4d482bc1ed28924ffe712a7ff2531f504e7b57917defc7` | `/Users/dsteele/Applications/Capsule.app/Contents/Library/Helpers/CapsuleDaemon.app/Contents/XPCServices/CapsuleSourceValidatorDaemon.xpc`; parser remains at `Contents/Resources/capsule-mjs-source-validator-daemon` inside that XPC bundle |
| Approval Broker | `com.capsulecorp.capsule.broker` | `com.capsulecorp.capsule.source-validator.approval-broker.v1` | `81284de5ba54e2288602bee4e9aca4e4513211b560bacfd1286b7ab57c922613` | `com.capsulecorp.capsule.source-validator-parser.approval-broker.v1`; `7abac7da99f4b9edef77bb5ecfff135e8b752e5ed656664632272079b5408577` | `/Users/dsteele/Applications/Capsule.app/Contents/XPCServices/CapsuleSourceValidatorBroker.xpc`; parser remains at `Contents/Resources/capsule-mjs-source-validator-approval-broker` inside that XPC bundle |

The launcher paths are respectively
`Contents/MacOS/CapsuleSourceValidatorDaemonLauncher` and
`Contents/MacOS/CapsuleSourceValidatorBrokerLauncher`. The Info.plist SHA-256 values are
`635815858bfc8e9d5d412883589b7578830028f629e0b60b587900e8a66382d3` and
`7b511e617326192134ae9f7469a65f9540d437806ecc55ecb750435bc131c285`.
Both declare `XPCService.JoinExistingSession=false`. The inactive policy bytes and digests remain
role-specific and parser spawn remains prohibited in R3.

Signing changes CodeDirectory/signature bytes but must not change the four pre-sign content bytes,
Info.plists, policy files, layout, identifiers, or parser/launcher source. Any such change returns
to R2 with a new artifact identity. Sign nested parser executables first, then their XPC bundles,
then the containing role bundles. Never sign the daemon and Broker service into one container or
copy either XPC bundle into the other role.

## Required identities, profiles, and entitlements

Before signing, create or obtain exact Team `3DDR84M4JS` macOS Development profiles for the daemon
and Broker containing roles. Each profile must name this Mac, contain the exact matching App ID,
select only the explicitly authorized Apple Development certificate, and permit only the
entitlements below. Whether either embedded XPC service requires its own portal App ID/profile must
be frozen from the exact supported Xcode/signing composition and effective-entitlement evidence;
do not create one merely because the service has a signing identifier. The existing Gate B
Broker/Supervisor/wildcard profiles have different App IDs and are not reusable.

- Each XPC launcher: `com.apple.security.app-sandbox = true`; no network client/server, app group,
  Keychain group, user-selected-files, Mach global-name exception, Hypervisor, JIT, unsigned-memory,
  disable-library-validation, debugger, or automation entitlement.
- Each parser executable: `com.apple.security.app-sandbox = true` and
  `com.apple.security.inherit = true` only; no separate authority-bearing entitlement.
- Hardened Runtime remains enabled with zero exceptions. Exact parent/responsible/self launch
  constraints and library constraints must be finalized from the containing fixture and signed
  closure, then retained byte-for-byte before use.
- Every signed object must read back TeamIdentifier `3DDR84M4JS`, its exact role signing identifier,
  effective entitlements, active CDHashes, and designated/explicit requirements. The common-name
  suffix is never an oracle.

The containing daemon/Broker fixture bytes and their minimal entitlements are not present in R2,
the launcher profile composition is not frozen, and the exact constraint payloads are not frozen.
These are hard pre-sign blockers, not permission to invent profiles, omit constraints, or use a
generic host.

This is an Apple Development lane. Notarization, stapling, Developer ID use, and a Gatekeeper-pass
claim are excluded; signed-byte verification, profile/entitlement readback, and the expected
development-distribution limitations must still be recorded.

## Reachability, update, and refusal matrix

| Case | Required result |
| --- | --- |
| daemon containing role to daemon-private service | reachable only through its embedded private-XPC route; fixed inactive-policy refusal; zero parser spawn |
| Broker containing role to Broker-private service | reachable only through its embedded private-XPC route; fixed inactive-policy refusal; zero parser spawn |
| daemon to Broker service; Broker to daemon service | unreachable/refused with zero result or state reuse |
| main app/installer or unrelated same-Team process to either service | unreachable/refused; Team membership alone grants no route |
| direct/global Mach lookup, app-group route, shared service, generic XPC bus | absent; discovering one stops R3 |
| wrong role, service, method, parser/profile/policy digest, signature, entitlement, Team, OS, or epoch | fixed refusal before parser spawn |
| old daemon tuple + new Broker tuple, reverse mix, or partial replacement | both Source Validator roles disabled; `repair-required`; no compatibility window or fallback |
| tampered or post-sign changed nested byte | signature/readback failure; no registration or launch |
| launcher start/restart under `JoinExistingSession=false` | distinct role-private container and responsible-process identity retained; no cross-role container/result/cache |

R3 is a reachability and signed-identity checkpoint, not R4. It must not activate an invented
resource policy or broaden input beyond fixed benign/inactive R1 frames.

## Evidence, cleanup, and recovery

Retain in `capsule-experiments`: pre-sign R2 digests; profile UUID/name/App ID/Team/certificate
fingerprint and entitlement allowlist; exact entitlements/constraints; signing command selectors;
post-sign Team/signing identifiers, CDHashes and nested verification; bundle tree and install path;
service/container/responsible-process observations; every matrix result; process inventory proving
zero parser spawn; and OS/Xcode/SDK identity. Pin the resulting archive commit back into this
repository. Do not retain private keys, profile secrets, authentication material, or user source.

On any failure: stop both containing fixtures, unregister only services registered by this exact
experiment, remove only `/Users/dsteele/Applications/Capsule.app` and proven role-private test
container residue, restore the pre-run process/service inventory, and retain refusal/cleanup
evidence. Never delete unrelated profiles, certificates, Keychain items, containers, or product
state. A mixed or ambiguous install stays `repair-required`; do not make it look fresh.

## Exact authorization applied by the retained experiment

The later explicit user request authorized these mutations only for the exact owned-Mac experiment,
and the retained evidence records their completion:

1. read the selected certificate/profile metadata needed for exact matching;
2. create/register the two containing-role App IDs, this Mac device record, and only any
   launcher-specific App IDs proved necessary by the frozen supported composition;
3. create/download/install the two exact containing-role macOS Development profiles and only any
   launcher profiles proved necessary by that composition;
4. use Apple Development SHA-1 `80A4969BCD1B3926020888094B9D812A283D3793` for a harmless Team
   readback and, only if it emits `3DDR84M4JS`, sign the exact nested parser, XPC, and containing
   fixture bytes;
5. copy the two containing fixtures to named test install locations;
6. register/activate the two embedded private XPC services and launch only the named fixtures;
7. run the reachability/mixed-update/refusal matrix and inspect the resulting role-private
   containers/processes/logs; and
8. unregister, stop, and remove only those experiment-owned installed copies and residue.

This was the pre-execution gate. The later authorized task completed these actions and R3 is
`PASSED` in its exact signed, installed, inactive-policy scope. It did not activate a parser or
product consumer. Exact R4-v1 candidates are `NO_GO`, R4-v2 is unexecuted, and ADR-0040 moves active
host validation to post-alpha defense-in-depth. The topology must not be weakened to resume it.
