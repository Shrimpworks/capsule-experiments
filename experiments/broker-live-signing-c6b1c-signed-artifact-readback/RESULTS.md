# C6b1c result

The exact identity/profile and signed-artifact readback slice is `PASSED`. One disposable app was
built and signed with the selected certificate fingerprint. Strict host verification passed; the
designated requirement binds the exact bundle identifier, Apple generic anchor, and selected
Apple Development leaf subject; hardened runtime is set; TeamIdentifier is `3DDR84M4JS`; and the
signed entitlement blob contains only App Sandbox plus the one exact Broker Approval group.

The profile wildcard remains an allowlist only. The retained app does not embed the raw profile,
was not installed or launched, and cannot support a Keychain, LocalAuthentication, Secure Enclave,
service, IPC, update, product, or admission claim. Those parent scopes remain `BLOCKED`.

The machine-readable observations and exact artifact hashes are in
[`evidence/result.json`](evidence/result.json). The signed app is retained solely so review can
repeat signature, requirement, code-directory, entitlement, and byte-identity checks.
