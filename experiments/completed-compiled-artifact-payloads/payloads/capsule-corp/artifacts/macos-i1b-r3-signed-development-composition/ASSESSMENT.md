# I1B and Source Validator R3 assessment

## I1B

`PASSED` for this exact Apple Development experiment. The seven-role source composition was built
from the retained I1A/R2 inputs, signed inside-out with certificate
`80A4969BCD1B3926020888094B9D812A283D3793` and three exact Team `3DDR84M4JS` profiles, installed
only at `/Users/dsteele/Applications/Capsule.app`, and read back with exact Team, identifier,
entitlement, constraint, CDHash, signed-byte, nested-seal, and profile evidence. The containing app
started with execution disabled; the daemon and Supervisor registered only as unprivileged
per-user agents and exited zero. Missing/tampered profiles, changed entitlement, wrong identifier,
wrong Team, ad-hoc/unsigned replacement, and stale/mixed bundles all refused.

## Source Validator R3

`PASSED` for the exact signed installed inactive-policy composition. Each containing role reached
only its own private XPC service; the cross-role service lookup returned connection-invalid.
Wrong-method and one-byte-tampered fixed benign requests reached only the owning inactive service
and returned connection-interrupted. No parser child spawned, no R4 policy activated, and no
private/global fallback, App Group, shared result, cache, or container was introduced. A first
broker cold connection can be invalid while launchd materializes the embedded service, so the
retained probe permits one fixed 100 ms retry and records both observations.

## Cleanup and limitations

`PASSED`: the installed copy was removed, both exact services were unregistered, no named Capsule
process remained, and every containing role's fixed benign private-scratch marker was enumerated
and removed before exit. macOS retained five protected, platform-managed sandbox roots for the
three containing roles and two validator launchers. Direct removal and Finder-to-Trash both
refused without additional privacy authority; Full Disk Access was neither requested nor used.
Those roots are accepted platform metadata, not non-platform Capsule scratch, and are recorded in
`evidence/cleanup-platform-observation.json`.

## Parent workstream

The macOS product installation workstream remains `BLOCKED`. This development-only experiment is
not Developer ID signed or notarized, does not implement the selected I2A Trust Coordinator or
protected-root bootstrap, activate a trust epoch, enable an attempt, or admit any runtime, backend,
or guest. Raw profiles and credential material are excluded from Git.
