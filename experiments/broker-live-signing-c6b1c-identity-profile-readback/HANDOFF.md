# C6b1c handoff

Scoped portal-resource creation: `PASSED`.

Complete C6b1c identity/profile readback: `BLOCKED` on exact profile-byte acquisition after the
mandatory repeated-download stop.

Parent owner-only hostile-`.mjs` internal alpha: `IN_PROGRESS — TRENDING_GOOD`.

Installed signing, installed security composition, product Broker consumers, and product
admission: `BLOCKED`.

## Retained evidence

- [`README.md`](README.md): authorization, method, observed result, stop, limitations, and next
  action;
- [`RESULTS.md`](RESULTS.md): scoped status and claim boundary;
- [`evidence/portal-receipt.json`](evidence/portal-receipt.json): privacy-minimized public portal,
  host, immutable-input, and zero-activation facts; and
- [`scripts/verify.mjs`](scripts/verify.mjs): independent closed receipt/file verification.

No raw provisioning profile, UDID, credential, private key, browser state, Keychain inventory, or
unrelated account metadata is retained.

## Resume boundary

Use the existing App ID `com.capsulecorp.capsule.broker.c6b1` and existing profile record
`XT8MS38HWV`. Do not create, repair, delete, or broaden them. The next task must receive only that
exact profile in a transient owner-controlled location, verify all local public metadata and remove
the transient raw profile after evidence extraction. Any mismatch remains `BLOCKED`.

Only after exact profile readback passes may the immutable C6b1a target be built and signed. Do not
install or launch it. Capsule Approval-key/Keychain operations, LocalAuthentication, the C6b1b
Supervisor seam, authenticated IPC, destructive/update/restore rows, runtime, backend, VM, guest,
and product admission remain forbidden.

## Verification

```sh
node scripts/verify.mjs
git diff --check
```
