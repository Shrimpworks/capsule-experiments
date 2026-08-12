# C6b1c Approval Broker identity/profile readback

Date: 2026-08-11

Scoped portal-resource creation: `PASSED`.

Complete C6b1c identity/profile readback: `BLOCKED`.

Parent owner-only hostile-`.mjs` internal alpha: `IN_PROGRESS — TRENDING_GOOD`.

Installed Broker signing, authenticated product consumers, the installed security boundary, and
product admission: `BLOCKED`.

## Question

Can Capsule create or exactly read back the one owner-authorized disposable Apple Development App
ID/profile, then build and sign the immutable C6b1a Broker evidence target without installing or
launching it and without accessing a Capsule Approval key?

The portal-resource portion passed, but the complete question remains blocked. The exact profile
was created and read back in the portal, but its authenticated download did not complete into the
owner-controlled evidence workspace. The authorization required a stop after a repeated download
stall, so no local CMS/profile verification, build, Apple code signature, or signed-artifact
readback was attempted.

## Defensive and authorized scope

The work was confined to:

- `Shrimpworks/capsule-experiments` commit
  `3d7bd46352506bf6018286749c2c85a3e2f683df`;
- `Shrimpworks/capsule-corp` commit
  `16fb810b97e7ff2a157a251ae4dc8023dcfc01b4`;
- immutable C6b1a merge
  `4a2447d4bd0e03132dc616e608031ca313630cdd`, composite SHA-256
  `0f07954b18fee3db90c440522e4df6f131ed1b2e889bb6f14a746cf43b5d68f8`;
- immutable C6b1b reference
  `067fe2beb40361bb714507cab1331004e0a656fa`, which was not activated;
- the Apple Developer portal account for Team `3DDR84M4JS`; and
- the owner-controlled leaf
  `/Users/dsteele/CapsuleEvidence/c6b1c-profile-dsteele-shrimp-mbp18-4-01`.

The evidence parent and leaf were absent before the run and were created as owner `501`, mode
`0700`, with symlinks refused. The leaf remained empty when the stop was recorded.

No broad identity, profile, Keychain, browser-cookie, credential, or device inventory was retained.
No Capsule Approval key was created, queried, used, duplicated, deleted, or rotated. No
LocalAuthentication context or prompt, Secure Enclave Approval operation, app installation or
launch, IPC/listener/Supervisor seam, runtime, backend, VM, or guest was used.

## Observed portal result

The public receipt in [`evidence/portal-receipt.json`](evidence/portal-receipt.json) records:

- exact App ID `com.capsulecorp.capsule.broker.c6b1` under Team `3DDR84M4JS`;
- exact profile `Capsule C6b1 Broker Evidence macOS Development epoch 7`;
- portal profile record `XT8MS38HWV`;
- macOS Development type, one exact certificate record `3SAN55Q9AW`, and the sole registered Mac;
- application identifier `3DDR84M4JS.com.capsulecorp.capsule.broker.c6b1`; and
- portal-displayed expiration `2027-08-11`.

The certificate record was selected because retained public evidence binds it to the authorized
Apple Development identity SHA-1 `80A4969BCD1B3926020888094B9D812A283D3793`, SHA-256
`D3E9FBDDBC342F747C3649B5A6FFB307A575827404E02D638C11B6B795A09629`, serial
`2680E3A814E45A8A4AC3C2B2EF09023E`, validity 2026-08-04 through 2027-08-04, and Team
`3DDR84M4JS`. No other identity was selected or used; Developer ID was forbidden.

The portal App ID was created with no optional capability selected. The intended signed effective
entitlements remain only the C6b1a request input: App Sandbox and exactly one Keychain group
`3DDR84M4JS.com.capsulecorp.capsule.broker.approval.epoch-7`, with Hardened Runtime and the closed
forbidden-entitlement list. Because no profile bytes or signed bytes were read locally, none of
those effective-entitlement claims passed in C6b1c.

## Stop and next action

The first portal download action did not yield a locally addressable profile. A later exact
download wait stalled and was interrupted. On resumption the browser backend was unavailable, the
evidence leaf was still exact and empty, and an OS privacy boundary prevented treating the user's
Downloads directory as a credential workaround. There was no Apple, Keychain, LocalAuthentication,
or system prompt.

Per the authorization, the task stopped rather than enumerate profiles, inspect browser session
state, use an alternate credential, ask Xcode to create another managed profile, recreate or
repair portal state, or sign without exact local profile verification.

The App ID and profile remain intact in the portal. A future task may resume only by providing the
exact `XT8MS38HWV` profile through a separately authorized transient owner-controlled path and
first verifying its UUID, CMS digest, Team, application identifier, expiry, sole device-binding
digest, exact certificate, and entitlement projection. It must not create another App ID/profile.
Only after that readback passes may the exact pinned Broker evidence target be built and signed;
installation, launch, Approval-key operations, LocalAuthentication, IPC, and product activation
remain outside C6b1c.

## Reproduction

The privacy-minimized receipt is verified without accessing Apple services or credential state:

```sh
node scripts/verify.mjs
```
