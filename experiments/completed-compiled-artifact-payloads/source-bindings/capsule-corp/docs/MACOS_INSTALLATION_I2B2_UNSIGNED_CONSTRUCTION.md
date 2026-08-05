# macOS installation I2B2 unsigned construction

Date: 2026-08-05

```text
Work item: I2B2 unsigned installation-only bundle construction
Status: PASSED
Scope: repository-local deterministic construction, exact profile/inventory readback, and
  no-side-effect refusal only
Evidence or reason: two clean directories produce identical 31-file bundles; profile and manifest
  known answers bind eight roles, I1A/I1B/I2B1 inputs, inactive services/entitlements/constraints,
  protected-state names, cleanup/repair projections, and activation refusal
Remaining work: production wrapper review and separately authorized I2B3 signing/key/App Group/
  service/container/handoff evidence; I2B4-I2B5 installed owner/store/session work follows
Next action: review the production request/record wrapper, then authorize I2B3 only with exact
  Team-3DDR profiles and fresh disposable test groups/keys
Parent status: installed I2B is BLOCKED; macOS installation remains IN_PROGRESS — TRENDING_GOOD
```

## Defensive scope

I2B2 constructs files from repository fixtures only. It does not inspect or use Apple identities,
provisioning-profile bytes, credentials, Keychain, Secure Enclave, LocalAuthentication, installed
applications, services, processes, protected containers, runtime, backend, VM, or guest state. It
does not sign, install, register, launch, create a protected root, create an owner/store, or enable
attempts.

## Frozen unsigned profile

The generated profile is
[`schemas/conformance/macos-i2b2-unsigned-installation/profile.json`](../schemas/conformance/macos-i2b2-unsigned-installation/profile.json).
It freezes:

- the seven unchanged I0/I1 roles plus required
  `capsule.role.trust-bootstrap-coordinator`;
- Coordinator bundle/signing identifier `com.capsulecorp.capsule.trust-bootstrap.v1`;
- bootstrap App Group `3DDR84M4JS.com.capsulecorp.capsule.bootstrap.v0` and Supervisor service
  `3DDR84M4JS.com.capsulecorp.capsule.bootstrap.v0.supervisor`;
- Coordinator group
  `3DDR84M4JS.com.capsulecorp.capsule.trust-bootstrap.installation-root.epoch-1` and Supervisor
  anchor group `3DDR84M4JS.com.capsulecorp.capsule.supervisor.bootstrap-anchor.epoch-1` as inactive
  `keychain-access-groups` inputs;
- request/record object type, version, media type, purpose and audience from the unchanged I2B1
  manifest;
- I1A manifest/evidence, I1B enrollment and I2B1 manifest byte/digest cross-links;
- `supervisor.state`, `supervisor.owner`, `supervisor.store`, fixed-v1 format, descriptor-relative
  `open-without-create`, pending/staging/publish names, and no-guest conformance profile; and
- cleanup of the unsigned bundle copy only, with no App Group, Keychain, service, or protected-state
  mutation.

The signed I2B3 containing-release and component-profile digest bindings are explicitly
unavailable. Active CDHash/effective-entitlement sets are empty, EUID/audit session are unavailable,
and the only activation decision is `refuse` with reason `unsigned-profile-inactive`.

## Known answers and inventory

| Object | Bytes/count | SHA-256 |
| --- | ---: | --- |
| I2B2 profile | 15,226 bytes | `a061291fe76d3bb460673adf25a322b0aa6d87d43619503eacaf3889eef4144b` |
| I2B2 bundle manifest | 7,649 bytes | `f706e3597958a6f694de7fb7c57f3e66d9cd5cd6a7f99e389de40018923c5c5d` |
| I1A bundle manifest link | 5,546 bytes | `5bd80097775908031b1a4c90680e8c7656cc5e9f97df2cc187592f75ee67a56f` |
| I1A construction evidence link | 2,848 bytes | `31f79bdbd3dae29f6cfa340683ce59bc445041db0da12a66b1c051abc3db6ae5` |
| I1B signed enrollment link | 10,643 bytes | `afc7002032fc1ff4ead29269e7a370d94524aff42ca9181827a03233a31fbc94` |
| I2B1 fixture manifest link | 19,015 bytes | `70f8613a19c8d035adcec6b2a3e99fb5f0b611ce3a8cba90edadffc0b24bb4d0` |

The closed bundle contains 31 files and eight roles. Profile readback observes 252 recursively
visited concrete fields. Recursive schema field authority adds 141 paths, bringing the repository
manifest to 854 fields across 46 targets and 69 classification profiles.

Raw caps are 65,536 profile bytes, 262,144 manifest bytes, 31 bundle files, and 1,024 UTF-8 bytes
per bundle path. Cap-plus-one fixtures refuse before parse or remaining readback.

## Construction and refusal evidence

Run:

```sh
./artifacts/macos-i2b2-unsigned-installation-bundle/scripts/reproduce.sh
node --test scripts/verify-macos-i2b2.test.mjs
```

The reproducer assembles from the checked-in I1A tree plus seven closed I2B2 inputs in two clean
temporary directories, compares the directories recursively, lints all new plists, performs
independent readback, and then retains the exact bundle and evidence. The I1A bundle manifest,
construction evidence, I1B enrollment, I2B1 fixtures, and their known answers are inputs only and
remain unchanged.

Mutation tests refuse missing, extra, duplicate, mixed, substituted, wrong-role, wrong-profile,
wrong containing release, wrong service, unsafe entitlement, executable Coordinator, active
signing/provisioning material, bootstrap-created, store-created, and raw-cap-plus-one states before
any activation surface exists.

## Exact I2B3 gate

I2B3 may begin only after the production CBOR/COSE signed-object wrapper has independent review and
the task separately authorizes exact Team-`3DDR84M4JS` Coordinator/Supervisor profiles, fresh
disposable test Keychain groups and keys, the bootstrap App Group, `SMAppService`, installed
container, and local process mutations. I2B3 must read back the signed containing release,
component profile, CDHashes, effective entitlements, EUID/audit session, container and two-message
request/record bindings. It must not use existing personal Capsule state and must not activate a
product store, ordinary IPC, runtime, backend, or guest.
