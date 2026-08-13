# E1 signed-profile preflight result

The exact profile/signature-only gate is `PASSED`.

Two explicit App IDs and two Mac development profiles were created under Team `3DDR84M4JS`, the
selected Apple Development certificate, and the sole registered Mac. Both profiles carry the exact
`com.apple.application-identifier`, Team identifier, and `3DDR84M4JS.*` Keychain allowlist. The
current Supervisor, never-launched Coordinator, and legacy negative probe all passed strict
signature/designated-requirement readback with hardened runtime, App Sandbox, exact role-specific
Keychain groups, and their byte-distinct macOS-style App Group identities. `get-task-allow` is
absent.

The E1 container matrix remains `BLOCKED`. No launch or container association/nonmembership was
observed, and no App Group portal resource, sentinel, service, Keychain item, root/store, runtime,
backend, VM, guest, or product admission was created. ADR-0045 remains `Proposed`.
