# E1 signed-profile preflight

This defensive, owner-authorized Apple Development experiment closes only the no-launch profile
and signature gate preceding ADR-0045's E1 container-separation matrix.

## Question

Can the exact current Supervisor, never-launched Coordinator, and retained legacy negative probe
be bound to their exact development profiles and signed identities with byte-distinct application,
App Group, and Keychain-group projections before any process or container operation occurs?

It pins Capsule `16fb810b97e7ff2a157a251ae4dc8023dcfc01b4`, the E0 archive at merge
`dee784d40684100f8315720fab9a5cd3399f492b`, and the App Group interpretation correction at
experiments merge `3671a6eb23357ff28de4562dd60e8f68173034ae`. The exact owned host was
`dsteele-shrimp-mbp18-4-01`.

The experiment created only the two explicit epoch-one App IDs and their Mac development profiles,
then signed and strictly read back ephemeral copies of the current Supervisor, never-launched
Coordinator, and exact legacy negative probe. It did not create a Developer-portal App Group: the
frozen `3DDR84M4JS...` value is the macOS-style entitlement identity. No bundle was launched and no
container, sentinel, service, Keychain item, LocalAuthentication prompt, root, store, runtime,
backend, VM, guest, or product path was accessed.

## Method

The owner-authorized portal session created the two explicit App IDs and two Mac development
profiles with certificate portal record `3SAN55Q9AW` and the sole registered Mac. The downloaded
CMS profiles were decoded outside Git; their names, UUIDs, application identifiers, Team,
certificate, expiry, device count/digest, and Keychain allowlists were read back. Exact E0 bundle
copies embedded those profiles, were signed with the selected certificate and hardened runtime,
and passed strict signature, designated-requirement, CDHash, Team, and effective-entitlement
readback. No executable was invoked. The ephemeral signed tree and decoded scratch data were then
removed and read back absent.

Raw profiles remain mode `0600` in the owner-controlled evidence leaf outside Git. Signed bundles
were deleted after readback because retaining a strictly verifiable sealed bundle would also retain
the raw embedded profile. This archive retains the public profile/signature identities, exact file
hashes, entitlement requests, closed effect record, and independent verifier.

## Limitations and next decision

The archived public receipt cannot independently rerun strict bundle verification without the
owner-held raw profiles and ephemeral signed bundles. It proves no launch, container association,
OS denial, Keychain membership, service behavior, update/retirement behavior, or product control.
The profile/signature gate is `PASSED`; the E1 container matrix remains `BLOCKED` pending a fresh
authorization. ADR-0045 remains `Proposed` and no product admission follows.

Run:

```sh
node scripts/generate-manifest.mjs --check
node scripts/verify.mjs
```
