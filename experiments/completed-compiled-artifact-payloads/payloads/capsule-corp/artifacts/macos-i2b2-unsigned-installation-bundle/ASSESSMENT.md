# I2B2 assessment

## Decision

**PASSED — unsigned bytes and layout only.** The exact I1A bytes remain embedded unchanged while
one required Trust Coordinator role and one inactive Supervisor bootstrap descriptor extend the
tree to eight roles and 31 files. Two clean constructions agree byte-for-byte. Closed profile and
manifest readback rejects missing, extra, duplicate, mixed, substituted, wrong-role,
wrong-profile, wrong-service, unsafe-entitlement, active-signing, bootstrap-created,
store-created, and cap-plus-one cases before any side effect.

The profile is 15,226 bytes at SHA-256
`7c6d410bd99b165a7f882914ca889d8796366d6ba60f0c76d5b30577abc6f5b7`. The bundle manifest is
7,649 bytes at SHA-256
`e92f7629774258f1dff68df7882b663479916c5feb4110db5460de3cef0af903`.

## What remains blocked

Installed I2B is **BLOCKED**. I2B2 used no Apple identity, provisioning profile, signing operation,
Keychain item, Secure Enclave key, LocalAuthentication prompt, App Group container, service
registration, application installation, process launch, protected root, owner object, store,
runtime, backend, or guest. The plist and JSON inputs declare future constraints but confer no
platform authority.

I2B3 requires production signed-object wrapper review plus separate authorization for exact
Team-`3DDR84M4JS` profiles, fresh test-only Coordinator/Supervisor groups and keys, App Group,
`SMAppService`, installed container, local processes, and request/record handoff evidence. Signed
containing-release/component-profile digests, CDHashes, effective-entitlement digests, EUID, audit
session, and installed-container bindings remain unavailable and activation-refusing.
