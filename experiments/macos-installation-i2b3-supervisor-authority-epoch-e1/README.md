# Supervisor authority epoch E1 preflight stop

Date: 2026-08-11

```text
Work item: C3b Apple Development Supervisor-authority-epoch identity separation
Status: BLOCKED
Scope: exact immutable-input, host, session, toolchain, GitHub-authentication, evidence-root, and
  selected legacy-profile availability preflight only
Evidence or reason: every immutable and host fact matched, but the one authorized legacy profile
  was absent from every bounded owner-controlled location inspected; no substitute is permitted
Remaining work: restore or explicitly reacquire the exact legacy profile bytes and independently
  verify their retained UUID and CMS SHA-256 before issuing a fresh E1 authorization
Blocker and owner: Capsule owner; the exact retained legacy negative-profile input is unavailable
Next action: supply the exact profile through an owner-controlled non-repository path, then rerun
  preflight from a fresh exact authorization; do not reuse this consumed execution authorization
Parent status: installed owner-lock G3/I2B remains BLOCKED
```

## Question tested

Can the separately authorized C3b/E1 matrix begin from the immutable E0 packet, named owner Mac,
exact Apple Development identity, and one selected legacy negative profile without substituting an
input or expanding authority?

The answer is `BLOCKED`. The immutable inputs and host matched, but the exact legacy profile was
not available. The experiment stopped before creating its authorized external evidence root and
before any portal, signing, profile, bundle, container, sentinel, service, or Keychain mutation.

## Defensive boundary

This retained result covers preflight only. It did not:

- access or mutate the Apple Developer portal;
- enumerate signing identities, certificates, profiles, devices, containers, or Keychain items;
- create an App ID or provisioning profile;
- sign, install, register, launch, or execute any E0 bundle;
- create or open an App Sandbox or App Group container;
- create, read, modify, or delete a sentinel, service, key, protected root, owner, or store; or
- start a runtime, backend, VM, guest, approval, attempt, or product path.

The only profile lookup was for the exact authorized name, UUID, and CMS SHA-256 in bounded
standard profile caches and owner-controlled Capsule locations. No other profile was inspected or
selected. No Developer ID identity was used.

## Exact immutable inputs

- `Shrimpworks/capsule-experiments` base:
  `3d7bd46352506bf6018286749c2c85a3e2f683df`.
- E0 archive merge: `dee784d40684100f8315720fab9a5cd3399f492b`.
- E0 manifest SHA-256:
  `b5d21ed3c2b14053325d5f1af66ceb59389e5fd31d8d2dd33274e8ca37525936`.
- `Shrimpworks/capsule-corp` governing commit:
  `16fb810b97e7ff2a157a251ae4dc8023dcfc01b4`.
- Team: `3DDR84M4JS`.
- Selected Apple Development certificate metadata: SHA-1
  `80A4969BCD1B3926020888094B9D812A283D3793`, SHA-256
  `D3E9FBDDBC342F747C3649B5A6FFB307A575827404E02D638C11B6B795A09629`, serial
  `2680E3A814E45A8A4AC3C2B2EF09023E`, valid 2026-08-04 through 2027-08-04.
- Required legacy negative profile: `Capsule I2B3 Supervisor Bootstrap Development 3DDR`, UUID
  `c45a058b-ffdd-4a6b-bd8c-d746772a2702`, CMS SHA-256
  `964f79980edf22a7280fe19e52893a1e40b0a8639d5bbe3d5dc8fdfada9c6c76`.

The certificate values and legacy profile identity are existing public Capsule metadata. No raw
certificate, provisioning profile, private key, device identifier, or credential is retained.

## Preflight observations

The owner-confirmed host label `dsteele-shrimp-mbp18-4-01` matched the authorized host facts:

- macOS 26.5.2 build `25F84`, arm64, `MacBookPro18,4`;
- Xcode 26.6 build `17F113`, SDK 26.5;
- Apple clang 21.0.0 (`clang-2100.1.1.101`); and
- EUID 501 in an active Aqua `gui/501` session.

The E0 manifest bytes matched the authorized digest. GitHub CLI used its configured macOS
Keychain credential with inherited token variables unset; only the non-secret account identity was
checked. The authorized external evidence root and experiment leaf were both absent, so no
preexisting owner evidence was overwritten.

At final readback the shared evidence root existed because another authorized parallel Capsule
task had created its own distinct leaf. The exact C3b/E1 leaf remained absent. This task neither
created nor inspected the other task's evidence contents.

The exact legacy profile was absent from:

- both standard current-user provisioning-profile cache locations;
- the authorized Downloads and Capsule evidence locations; and
- bounded Capsule-named temporary workspaces.

The immutable E0 archive intentionally retains only the legacy profile's public metadata. Automatic
provisioning cannot satisfy this gate because it could generate or select a different profile.

## Verification

```sh
fnm exec --using=22.22.1 -- node \
  experiments/macos-installation-i2b3-supervisor-authority-epoch-e1/scripts/verify.mjs
git diff --check
```

The verifier checks the closed retained packet, exact immutable identities, `BLOCKED` disposition,
and complete false-valued mutation boundary. It performs no platform lookup or mutation.

## Claim boundary

This result supports only a privacy-minimized preflight observation that the exact selected legacy
profile input was unavailable in the bounded authorized locations on the named host. It does not
test App Sandbox container separation, support any E1 case, accept ADR-0045, or advance installed
control evidence or product admission.
