# Supervisor owner-lock G3 installed identity/session/update results

Date: 2026-08-03 (America/Toronto)

Repository baseline: `599d091` (`origin/main`), including merged owner-lock G2 PR #85 at
`86fdfa4`.

Decision: **G3 local NO-GO.** The exact Apple Development certificate authorized for the run is
not a W4 Team identity at the code-signing boundary, no W4 provisioning profile is locally
available, and the protected-root bootstrap/signed-record composition is not yet selected. The
existing G1/G2 noncredential no-guest mechanics continue to pass, but they do not advance
OWNER-001 or installed distribution/storage claims beyond `local-mechanic`.

## Question and defensive scope

The experiment asked what the current owned Mac could prove about an exact W4 Apple-signed,
per-user installed Supervisor taking ADR-0033 ownership before current-v1 store access and
preserving that owner domain across session/restart/update faults.

Read-only identity/profile/toolchain discovery and one harmless temporary signing probe were
confined to the current user's Mac. No Apple portal, profile creation/download, automatic
provisioning, credential export, other user/session/store/process, Keychain item creation/mutation,
product endpoint, runtime, backend, guest, deployment, or third-party target occurred. Public
certificate/profile metadata was read from the current user's Keychain/profile cache. The
separately installed Developer ID Application identity for `3DDR84M4JS` was inspected only as
public certificate metadata for differentiation and was never used to sign.

## Fail-fast discovery

| Required fact | Observed | Result |
| --- | --- | --- |
| Authorized certificate exists | SHA-1 `1638CFBD9250A00B4DBD81AE8FD1C790B42F61E3` exists and `security find-identity` calls it `Apple Development: Dylan Steele (W4QUR9FUL4)` | Identity object present |
| Certificate Team | Public X.509 subject is `OU=3DDR84M4JS`, `UID=GSQP72QY5T`; validity is 2026-07-31 through 2027-07-31 | W4 expectation contradicted |
| Signed-byte readback | Selecting that exact SHA-1 signed a harmless temporary probe, but `codesign` emitted `TeamIdentifier=3DDR84M4JS`; identifier/CDHash/full hash and the designated requirement are retained in `local-discovery.json` | Fail closed; not W4 evidence |
| Provisioning | All three Xcode-cached profiles are Team `3DDR84M4JS`; none is W4 | Required W4 profiles absent |
| Toolchain | macOS 26.5.2 (25F84), arm64, Xcode 26.6 (17F113), SDK 26.5, Swift 6.3.3, clang 21.0.0, Go 1.26.5 | Observed on this host only |

The common-name suffix is display text; the certificate subject OU and the TeamIdentifier embedded
by `codesign` are the security-relevant Team evidence. Treating the label as W4 would have admitted
the exact historical Team this task prohibited. No installed signing followed that mismatch.

Machine-readable public metadata is retained at
[`evidence/2026-08-03/local-discovery.json`](evidence/2026-08-03/local-discovery.json). It contains
no private key, provisioning device list, credential, or user data. The temporary signed bytes were
not retained; their SHA-256, CDHash, full CodeDirectory hash, identifier, empty entitlement set,
authority, and normalized designated requirement were retained.

## Exact planned G3 fixture

The closed, test-only identities and requirements are retained in
[`fixtures/identity-contract.json`](fixtures/identity-contract.json). The fixture intentionally
uses `com.capsulecorp.spike.*`, not unresolved product IDs.

| Item | Exact fixture value |
| --- | --- |
| Bootstrap role | `capsule.owner-lock-g3.bootstrap-fixture` |
| Bootstrap bundle | `com.capsulecorp.spike.owner-lock-g3.bootstrap` |
| Supervisor role | `capsule.execution-supervisor.owner-lock-g3-fixture` |
| Supervisor bundle/service | `com.capsulecorp.spike.owner-lock-g3.supervisor` / `SMAppService.agent` |
| Expected Team | `W4QUR9FUL4` only |
| Requested entitlements | App Sandbox only for both roles |
| App/Keychain groups | none; both are prohibited for this narrow fixture |
| Required profiles | exact macOS App Development profiles for the two bundle IDs under W4 |
| State child/root name | Supervisor protected `NSApplicationSupportDirectory` + `CapsuleOwnerLockG3` |
| Bootstrap/lock/store names | `owner-bootstrap.json`, `supervisor.owner`, `supervisor-state.json` |
| Lock/store policy | pre-created regular mode `0600`, link count one; current store format 1 |

Profile-derived effective entitlements—including application identifier, Team identifier, and the
development `get-task-allow` value—must be read from the signed bytes and digested exactly. They
must not be guessed into the requested entitlement plist.

The experiment-only bootstrap projection lists the complete fields required to bind bootstrap
format/version, installation, Supervisor, Team, signing identifier, accepted CDHashes,
entitlements digest, UID, root identity/policy, lock identity/policy, closed store name/format, and
epoch sequence/digest. It is not a frozen product schema or an authenticated record. The actual
installation-root signing mechanism and record envelope do not exist.

## Noncredential mechanics retained

`run-noncredential.sh` passed the closed fixture/update model and the existing G1/G2 focused Darwin
corpus. Those tests establish only the already-merged local mechanics:

- owner acquisition/check precedes current-v1 store inspection and sorted no-guest recovery;
- a duplicate independent process refuses before corrupt-store parsing or fake work;
- owner, store, and coordinator use the same nonzero session;
- post-open lock entry replacement permanently fences reads and mutations;
- close order is lifecycle, store, owner descriptor, then root descriptor;
- `CLOEXEC`, explicit inherited-description lifetime, abrupt death, fast reacquisition, wrong
  mode/type/link/device/inode, symlink, missing object, root/entry replacement, descriptor reuse,
  and recovery-response loss remain covered; and
- `FakeBackend.CreatesGuest() == false` remains mandatory.

The pure fixture model also refuses wrong Team, identifier, CDHash, entitlement digest, and epoch,
and accepts only the exact prepared v2 tuple. It deliberately demonstrates that a coherently
restored v1 expectation plus v1 bytes remains locally self-consistent; no anti-rollback claim is
possible without an independent anchor or witness.

## Installed/session/update matrix

| Case | Result |
| --- | --- |
| Correct W4 signed installed launch | Blocked before build: actual certificate Team is 3DDR and exact W4 profiles are absent |
| App Sandbox/protected state root | Blocked: no W4 profile is cached locally; no selected installer-to-Supervisor private-container bootstrap ceremony |
| Signed bootstrap enrollment | Blocked: fields are fixed for the experiment, but no installation-root signer/envelope or product parser exists |
| Owner-before-store, same session, sorted no-guest recovery, fencing, ordered close | Pass only in existing owned-temporary-root G1/G2 tests |
| Duplicate owner, fast process-death reacquisition, CLOEXEC/inherited descriptor | Pass only in existing local process tests |
| Wrong/untrusted/ad-hoc/Team/identifier/CDHash | Wrong Team observed and refused at discovery; other installed cases unrun because no valid baseline exists; no ad-hoc fallback used |
| Stale bootstrap; root/lock/store rename/replacement; wrong owner/mode/symlink | Local G1/G2 subsets pass; installed/protected cases unrun |
| Same-role update, mixed versions, stale live process, downgrade, entitlement/identifier change | Pure exact-tuple fixture refuses mismatch; installed OS/process cases unrun |
| State-root persistence, rollback/restore | Unrun; coherent rollback remains unprevented by local equality |
| Logout/login, reboot, fast user switching, sleep/wake, wrong user/session | Unrun to avoid disruption and because no valid installed W4 baseline exists |

No ordinary application-support mode bits would close the missing protected-directory property.
BSD `flock` remains advisory and provides no same-UID containment. Even with profiles, G3 cannot
proceed faithfully until the trusted bootstrap can create/enroll the Supervisor-private root
without a broad shared group or prohibited normal-start creation fallback. In addition, current G2
accepts a trusted absolute test-only `StorePath`; final installed composition must open the closed
store name descriptor-relative to the retained root and validate its file policy/content binding.

## Required user/Apple/design actions

1. Replace/reissue the Apple Development certificate so the exact certificate's subject OU and a
   harmless signed-byte `TeamIdentifier` both equal `W4QUR9FUL4`; do not rely on its display name.
2. Create/download two exact W4 macOS App Development profiles for the fixture bundle IDs (or
   deliberately choose revised test IDs first), with App Sandbox and this owned Mac enrolled.
3. Select and document how the trusted installer creates/enrolls the Supervisor-private protected
   root without a shared app group and without making normal Supervisor startup a create/repair
   authority.
4. Define the installation-root-signed bootstrap envelope/parser and bind the complete retained
   field projection; code signing alone cannot sign post-install inode values into prebuilt bytes.
5. Make the final store open descriptor-relative to the retained root/closed name before rerunning
   installed rename/replacement/update tests.
6. After those actions, rerun build/sign/readback, `SMAppService`, protected-container negative,
   crash/restart, update/mix/downgrade, session, and safe logout/login/reboot cases on this host.
   Clean-host/minimum-OS and Developer ID/notarization remain separately deferred.

## Claim boundary

This result is a **NO-GO for G3 installed acceptance**, not a regression in the selected local
`flock` primitive. It does not claim clean-host behavior, notarized distribution, Gatekeeper,
production storage, protected same-UID containment, cross-user/session isolation, authenticated
IPC, update safety, rollback resistance, power-loss safety, continuous service, backend/runtime
admission, or guest execution.
