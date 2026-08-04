# Supervisor owner-lock G3 installed evidence

Status: **development-only blocked installed-evidence harness**. It creates no guest, backend,
runtime, product endpoint, approval key, installation key, or user-content path.

Owner: Capsule Execution Supervisor maintainers. Remove or replace this harness only after an exact
W4-scoped Apple Development profile set, a selected protected-root bootstrap ceremony, and a signed
installation record allow the installed matrix in [`RESULTS.md`](RESULTS.md) to be rerun.

## Defensive question and authorized scope

Defensively validate ADR-0033's owner-before-store boundary using only repository fixtures,
Capsule's existing no-guest Go tests, harmless test components, and the current user's owned Mac.
Do not access another user/session/store/process except harness-owned peers. Do not use a runtime,
backend, guest, deployment target, third-party system, credential export, or historical Team
`3DDR84M4JS` as substitute W4 evidence.

The requested identity was certificate SHA-1
`1638CFBD9250A00B4DBD81AE8FD1C790B42F61E3`, displayed by Keychain as
`Apple Development: Dylan Steele (W4QUR9FUL4)`. Fail-fast readback found that the certificate's
actual subject organization unit and emitted `codesign` TeamIdentifier are both
`3DDR84M4JS`. No cached profile belongs to W4. The installed/protected portion therefore stopped
before packaging, registration, state creation, or service activation.

## Closed test-only topology

[`fixtures/identity-contract.json`](fixtures/identity-contract.json) fixes the G3-only identifiers,
profile requirements, entitlement allowlists, state names, bootstrap fields, and two harmless
release identities. These are experiment identifiers, not reserved product App IDs:

- bootstrap container: `com.capsulecorp.spike.owner-lock-g3.bootstrap`;
- Execution Supervisor: `com.capsulecorp.spike.owner-lock-g3.supervisor`;
- embedded per-user `SMAppService.agent` label:
  `com.capsulecorp.spike.owner-lock-g3.supervisor`;
- Supervisor application-support child: `CapsuleOwnerLockG3`;
- owner object: `supervisor.owner`;
- current v1 store: `supervisor-state.json`; and
- per-installation record: `owner-bootstrap.json`.

The narrow fixture requires two exact macOS App Development profiles for Team `W4QUR9FUL4`, one
for each bundle identifier, with App Sandbox enabled. It requires no application group or Keychain
access group: adding either would broaden this owner-lock-only experiment. Requested entitlements
are retained in [`entitlements/`](entitlements/) and contain only
`com.apple.security.app-sandbox=true`; the profile-derived application identifier,
Team identifier, and development `get-task-allow` value must be captured from the signed bytes and
matched exactly rather than guessed.

The Supervisor-private root is intended to resolve from the Supervisor's own protected
`NSApplicationSupportDirectory`. The fixture does **not** choose how a different containing app
creates and enrolls that private root without a shared group, nor does it authorize normal
Supervisor startup to create it. That missing trusted-bootstrap ceremony is a design blocker. A
shared app group, ordinary mode-0700 directory, or Supervisor create-on-first-start is not an
acceptable fallback.

## Noncredential verification

Run:

```sh
./experiments/supervisor-owner-lock-installed-g3/run-noncredential.sh
```

This performs no signing and no install. It validates the closed fixture and expected update/refusal
matrix, then runs the existing G1/G2 Darwin tests covering descriptor semantics, contention,
owner-before-store order, sorted no-guest recovery, owner-session composition, loss fencing,
ordered shutdown, process death, and reacquisition.

The optional [`discover-local.sh`](discover-local.sh) is read-only. It prints public certificate,
profile-Team, OS, and toolchain metadata and returns nonzero unless the exact certificate actually
emits Team `W4QUR9FUL4` and an exact W4 profile exists for each role. It never invokes
`codesign --sign`, Xcode automatic provisioning, or an Apple service.

## Claim boundary

Passing the noncredential script is only a fixture/local-mechanic result. It is not installed
identity, protected storage, same-UID containment, signed bootstrap, authenticated IPC, session,
update, rollback, distribution, minimum-OS, backend, runtime, or guest evidence. The authoritative
decision and exact observed/blocked matrix are in [`RESULTS.md`](RESULTS.md).
