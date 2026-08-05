# I2B2 assessment

## Decision

**PASSED — unsigned bytes and layout only.** The exact I1A bytes remain embedded unchanged while
one required Trust Coordinator role and one inactive Supervisor bootstrap descriptor extend the
tree to eight roles and 31 files. Two clean constructions agree byte-for-byte. Closed profile and
manifest readback rejects missing, extra, duplicate, mixed, substituted, wrong-role,
wrong-profile, wrong-service, unsafe-entitlement, active-signing, bootstrap-created,
store-created, and cap-plus-one cases before any side effect.

The profile is 15,226 bytes at SHA-256
`a061291fe76d3bb460673adf25a322b0aa6d87d43619503eacaf3889eef4144b`. The bundle manifest is
7,649 bytes at SHA-256
`f706e3597958a6f694de7fb7c57f3e66d9cd5cd6a7f99e389de40018923c5c5d`.

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
