# macOS I1B and Source Validator R3 signed development composition

```text
Work item: I1B/R3 exact developer-signed, installed, execution-disabled composition
Status: PASSED
Scope: Team-3DDR Apple Development signing, one owned Mac, exact I0/I1A roles, fixed benign R1
  frames, private-XPC reachability, per-user SMAppService lifecycle, refusal, and cleanup evidence
Evidence or reason: three exact explicit-App-ID profiles selected only the authorized certificate;
  signed enrollment, installed private-service reachability, refusal matrix, and cleanup passed
Remaining work: none for this exact experiment; product distribution and later installation slices
  remain separately blocked
Next action: review retained public-byte evidence; do not treat Apple Development as distribution
Parent status: macOS product installation and Source Validator product admission remain BLOCKED
```

This artifact is a defensive local-only development experiment. It never enables attempts, uses a
runtime or backend, creates a guest, performs an Approval-key operation, or mutates Capsule
authority state. Developer ID, notarization, publication, App Groups, Keychain groups, global Mach
services, privileged helpers, and broad sandbox exceptions are outside its scope.

The `Provisioning/` Xcode project is deliberately a single inert target. An initial supported
automatic-signing probe selected a Team wildcard profile; the exact gate rejected it. Three exact
explicit App IDs and profiles were then created in the Apple Developer portal and fetched through
supported Xcode account integration. The project is not a Capsule product target and contains no
service, IPC, key, runtime, backend, or guest behavior.

## Exact identities

The containing roles are `com.capsulecorp.capsule.broker`,
`com.capsulecorp.capsule.daemon`, and `com.capsulecorp.capsule.supervisor`. The private services are
`com.capsulecorp.capsule.source-validator.approval-broker.v1` and
`com.capsulecorp.capsule.source-validator.daemon.v1`; their matching parser signing identifiers add
`source-validator-parser` in the corresponding role namespace. No XPC service or parser receives
an independent profile in this supported nested macOS composition.

The containing-role effective entitlements are exact application identifier, Team identifier, and
App Sandbox keys. XPC launchers receive App Sandbox only; parser children receive App Sandbox plus
inheritance only. Standard macOS development profiles include an implicit `3DDR84M4JS.*` Keychain
allowlist, but no signed Capsule object requests `keychain-access-groups`, so it is not effective
authority. The signed verifier checks that distinction and refuses every extra effective key.

## Reproduction

Use Node.js 22.22.1 or newer. The raw profiles remain outside Git. The three environment variables
below name only the exact profiles after `profile-metadata.mjs` has accepted their Team, explicit
App ID, one-certificate selection, current-Mac membership, expiry, and profile-entitlement set.

```sh
CAPSULE_BROKER_PROFILE=/absolute/path/to/exact-broker.provisionprofile \
CAPSULE_DAEMON_PROFILE=/absolute/path/to/exact-daemon.provisionprofile \
CAPSULE_SUPERVISOR_PROFILE=/absolute/path/to/exact-supervisor.provisionprofile \
  ./artifacts/macos-i1b-r3-signed-development-composition/scripts/sign.sh

node artifacts/macos-i1b-r3-signed-development-composition/scripts/run-refusal-matrix.mjs \
  artifacts/macos-i1b-r3-signed-development-composition/dist/Capsule.app \
  artifacts/macos-i1b-r3-signed-development-composition/evidence/signed-enrollment.json

node artifacts/macos-i1b-r3-signed-development-composition/scripts/run-installed-composition.mjs \
  artifacts/macos-i1b-r3-signed-development-composition/dist/Capsule.app \
  artifacts/macos-i1b-r3-signed-development-composition/evidence/signed-enrollment.json
```

The installed harness refuses a pre-existing install or service, uses only
`/Users/dsteele/Applications/Capsule.app`, registers the two exact unprivileged per-user agents,
and restores the exact install/process/service inventory before it returns. Each containing role
creates, enumerates, and removes one fixed benign marker in its own private container. macOS-managed
sandbox roots are recorded separately and never conflated with non-platform scratch. A required
macOS Login Items approval is reported as `BLOCKED`; unsupported role-private XPC behavior is
reported as `NO_GO`, with no shared/global service or App Group fallback.
