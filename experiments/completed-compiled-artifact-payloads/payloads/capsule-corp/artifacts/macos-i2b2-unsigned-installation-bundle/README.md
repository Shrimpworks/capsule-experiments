# macOS I2B2 unsigned installation-only bundle

```text
Work item: I2B2 unsigned installation-only bundle construction
Status: PASSED
Scope: deterministic unsigned bytes, layout, declared profiles, and inactive readback only
Evidence or reason: two clean constructions are byte-identical; independent readback binds the
  eight-role tree, 31-file inventory, exact I1A/I1B/I2B1 cross-links, declared service,
  entitlement and constraint inputs, and activation refusal
Remaining work: production wrapper review and separately authorized I2B3 signing, keys, App Group,
  service, container, handoff, and installed fault evidence
Next action: authorize I2B3 only after exact Team-3DDR profiles and reviewed wrapper/key inputs exist
Parent status: installed I2B protected-root composition is BLOCKED
```

This artifact extends the checked-in I1A tree with one embedded, on-demand Trust Coordinator XPC
bundle and one bootstrap-only Supervisor launch descriptor. Both Coordinator and Supervisor files
are plain-text mode-`0644` placeholders. The Coordinator placeholder has no execute bits. No
production request/record wrapper or key implementation exists.

The declared entitlement files freeze these inactive candidate identifiers:

- Coordinator bundle/signing identifier: `com.capsulecorp.capsule.trust-bootstrap.v1`;
- bootstrap App Group: `3DDR84M4JS.com.capsulecorp.capsule.bootstrap.v0`;
- Supervisor bootstrap service: `3DDR84M4JS.com.capsulecorp.capsule.bootstrap.v0.supervisor`;
- Coordinator installation-root Keychain group:
  `3DDR84M4JS.com.capsulecorp.capsule.trust-bootstrap.installation-root.epoch-1`; and
- Supervisor bootstrap-anchor Keychain group:
  `3DDR84M4JS.com.capsulecorp.capsule.supervisor.bootstrap-anchor.epoch-1`.

These are unsigned declared inputs, not effective entitlements, registered services, reachable
IPC, Keychain authority, or installed evidence. The constraint projection has empty active CDHash
and effective-entitlement digest sets and therefore requires activation refusal.

Reproduce in two clean directories and independently verify:

```sh
./artifacts/macos-i2b2-unsigned-installation-bundle/scripts/reproduce.sh
node artifacts/macos-i2b2-unsigned-installation-bundle/scripts/verify-bundle.mjs \
  artifacts/macos-i2b2-unsigned-installation-bundle/dist/Capsule.app \
  e92f7629774258f1dff68df7882b663479916c5feb4110db5460de3cef0af903
```

The reproducer performs repository-local file construction, plist linting, comparison, and
readback. It does not call `codesign`, Security, Keychain, Secure Enclave, LocalAuthentication,
ServiceManagement, XPC, launchd, application installation, or product execution.

See [the retained construction result](../../docs/MACOS_INSTALLATION_I2B2_UNSIGNED_CONSTRUCTION.md),
[the profile](../../schemas/conformance/macos-i2b2-unsigned-installation/profile.json), and
[the evidence](evidence/construction.json).
