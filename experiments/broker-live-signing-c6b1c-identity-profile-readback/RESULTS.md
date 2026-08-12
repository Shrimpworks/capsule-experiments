# C6b1c result

Date: 2026-08-11

## Result

Exact App ID/profile portal-resource creation: `PASSED`.

Complete local identity/profile and signed-target readback: `BLOCKED`.

The exact owner-authorized App ID and macOS Development profile exist and matched the requested
public portal projection. A repeated authenticated profile-download stall triggered the mandatory
stop before local CMS/profile verification, build, code signing, installation, or launch.

## Observed

- The host matched `dsteele-shrimp-mbp18-4-01`, macOS 26.5.2 build 25F84, arm64, Xcode 26.6 build
  17F113, SDK 26.5, Apple clang 21.0.0, EUID 501, and bootstrap domain `gui/501`.
- The exact App ID `com.capsulecorp.capsule.broker.c6b1` was absent and then created under Team
  `3DDR84M4JS` with no optional portal capability selected.
- The exact profile `Capsule C6b1 Broker Evidence macOS Development epoch 7`, portal record
  `XT8MS38HWV`, was absent and then created with exact certificate record `3SAN55Q9AW` and the sole
  registered Mac. Portal readback showed the exact application identifier and expiration
  2027-08-11.
- The owner evidence leaf was created owner 501/mode 0700/no-symlink and remained empty at stop.
- No Apple/system/Keychain/LocalAuthentication prompt or mismatch was observed.

## Not observed

No raw profile bytes, local profile UUID, CMS digest, entitlement digest, privacy-minimized device
binding digest, embedded certificate readback, unsigned or signed target digest, TeamIdentifier,
signing identifier, CDHash, designated requirement, Hardened Runtime flag, or effective signed
entitlement digest was obtained. No build or code-signing operation was attempted.

## Claim boundary

This is not installed signing evidence and does not pass C6b1c. It does not accept ADR-0021,
activate ADR-0043, admit an installed identity, or authorize C6b1d/product work. Portal-resource
existence is not code identity, profile/effective-entitlement evidence, key authorization, or
product admission.

The exact portal resources were left intact. No Approval key, Keychain item, LAContext, signature,
app install/launch, account/container, IPC service, Supervisor seam, product store, runtime,
backend, VM, or guest was accessed or activated.

## Decision

Retain the privacy-minimized receipt and keep C6b1c `BLOCKED`. Resume only from the existing App
ID/profile with the exact profile bytes supplied transiently through an authorized owner-controlled
path. Do not recreate, repair, delete, or broaden either portal resource.
