# Gate B Results: macOS Authority and Storage Separation

Date: 2026-07-31  
Authoritative repository baseline: `9bfd2ac` (`Document hardened architecture and spike plan (#7)`)  
Decision: **conditional-pass strengthened by Apple-credentialed evidence; Gate B is not yet
validated for a shipping configuration**

## Apple-credentialed follow-up

After the original license-free run, Xcode 26.6 and valid Apple Development and Developer ID
Application identities for Team `3DDR84M4JS` became available. The retained follow-up ran on the
same macOS 26.5.2 (25F84), arm64 host.

| Area | Observation |
| --- | --- |
| Apple Development identity | Exact Apple chain, Team ID, certificate-class OID, role identifier, Hardened Runtime, no-debug predicate, and active code-directory hash accepted. Same-team wrong-role, unsigned, stale-hash, and debug-entitled fixtures were denied. |
| Developer ID identity | The same static, live-process, and live-XPC matrix passed with the Developer ID certificate-class OID and Hardened Runtime. This was not a notarization result. |
| Symmetric live XPC | Apple-signed client and Broker each enforced the other side's exact Team/channel/identifier/hash/no-debug requirement and revalidated the actual message sender. Exact FD bytes crossed read-only; stale, same-team wrong-role, and unsigned clients were denied before protocol handling. |
| Protocol epoch | An exact authenticated client with `epoch-0` reached the protocol and was denied before descriptor redemption; `epoch-1` passed. This is harness evidence, not durable epoch-state validation. |
| Provisioning | Xcode registered the Mac and produced development profiles for distinct Broker and Supervisor app identifiers and Keychain groups. The daemon carried no operational group. |
| Keychain groups | Broker and Supervisor could add/query only their own data-protection group. Every sibling and daemon cross-group query failed with `errSecMissingEntitlement` (`-34018`). |
| Secure Enclave | Persistent P-256 Approval and evidence keys were created in their provisioned groups. Supervisor evidence signing succeeded without UI. Daemon/sibling use failed with `-34018`. Broker approval signing failed noninteractively with LocalAuthentication `-1004` and succeeded after interactive user presence. |
| Protected stores | Broker and Supervisor wrote inside distinct sandbox app containers. Own reads succeeded; both siblings and the daemon received permission denial for the other container. |
| Stale same-team residual | A newly compiled stale Broker with the same Team ID, identifier, profile, and access-group entitlement had a different code-directory hash and failed the exact-build requirement. It nevertheless read a newly created group item and signed with a newly created Secure Enclave key in that stable group. |
| Per-release group mitigation | A replacement Broker with the same Team/identifier but only a new `approval.release2` group created and used its new Secure Enclave key. The old Broker received `-34018` for the new group, and the replacement received `-34018` for the old group. Both remained valid release identities with different code-directory hashes. |
| Three-role Developer ID export | Broker, Supervisor, and daemon exported with Developer ID, Hardened Runtime, secure timestamps, and no `get-task-allow`. Broker/Supervisor direct-distribution profiles admitted only their release-scoped groups; both created/used Secure Enclave keys and the daemon received `-34018`. Gatekeeper reported exactly `Unnotarized Developer ID`. |
| Notarization submission | The `capsule-notary` credential profile authenticated successfully. Independent Broker, Supervisor, and daemon archives passed notarytool preflight and uploaded as submissions `15da95fc-f0ab-45aa-a50b-dcdb454e1035`, `cf692b34-d907-4566-a07a-cc004eced78e`, and `d133b8e1-7c3d-4080-9783-ce7b2729119e`. Supervisor reached `Accepted`; its ticket stapled and validated, Gatekeeper reported `source=Notarized Developer ID`, and strict code-signature verification remained valid. Broker and daemon remained `In Progress`; their acceptance is not yet claimed. |

Reproduce the follow-up with:

```sh
./experiments/macos-authority-separation/run-apple-signed.sh development
./experiments/macos-authority-separation/run-apple-signed.sh developer-id
./experiments/macos-authority-separation/Provisioned/run-provisioned.sh
./experiments/macos-authority-separation/Provisioned/run-provisioned.sh --interactive
./experiments/macos-authority-separation/Provisioned/run-stale-keygroup.sh
./experiments/macos-authority-separation/Provisioned/run-rotated-keygroup.sh
./experiments/macos-authority-separation/Provisioned/run-developer-id-export.sh
./experiments/macos-authority-separation/Provisioned/run-notarization.sh \
  ./experiments/macos-authority-separation/build/developer-id-run.XXXXXX
```

The stale-build result confirms that XPC exact-build enrollment and Keychain membership enforce
different identities. A stable access group is component/release scoped; it cannot revoke an old
already signed build or bind a private-key operation to the active trust epoch. Operational key
rotation is incomplete with a stable group. The per-release-group candidate prevented old/new
cross-use under development signing and produced functional restricted-group Developer ID exports.
It remains conditional until crash-safe install/key-authorization/rollback transitions pass; a
signing mediator remains an alternative if that operational model proves unacceptable.

## Hypothesis and gate

Hypothesis: independently signed daemon, Broker, and Supervisor components can use macOS-enforced
peer identity, Keychain authority, hardware-backed keys, user-presence access control, and protected
containers to form real authorities. Trust epoch, plan, attempt, and migration semantics remain
Capsule protocol responsibilities.

Gate B requires the operating system and protocol jointly to deny unauthorized peers, key use, and
storage access. The original local spike established that the required primitive families exist
and exercised several critical negative cases. At that time the host had no Apple signing
identity. The follow-up closes the Apple Development/Developer ID, development provisioning,
disjoint group, protected-container, and interactive-presence questions, while installed product
services, final notarization/stapling, session/lifecycle coverage, and stale-group mitigation remain
open.

## Environment and tools

Observed locally:

| Item | Value |
| --- | --- |
| Repository | exact detached commit `9bfd2ac`; worktree clean before spike |
| macOS | 26.5.2 (build 25F84), Darwin 25.5.0 |
| Hardware | arm64; Secure Enclave P-256 creation and signing observed |
| System Integrity Protection | enabled |
| Developer directory | `/Library/Developer/CommandLineTools` |
| macOS SDK | 26.5 |
| Apple clang | 21.0.0 (`clang-2100.1.1.101`) |
| Swift | 6.3.3; unusable for this spike because the SDK Swift interfaces were built by 6.3.2 |
| LLDB | 2100.0.17.203 |
| Signing identities | `0 valid identities found` for code signing |
| Go | 1.23.4 darwin/arm64 |
| Ambient Node | 16.15.0; unrelated to the native experiment and below repository requirements |

The Swift compiler/SDK mismatch was observed, not inferred. The probe was moved to Objective-C/C
and the public Security, LocalAuthentication, CoreFoundation, and XPC interfaces. No Swift result is
claimed.

## Retained prototype

Run:

```sh
./experiments/macos-authority-separation/run.sh --with-debugger
./experiments/macos-authority-separation/run-xpc.sh
```

Derived binaries remain ignored under `build/`. The Keychain probe uses unique process-scoped tags,
deletes any persistent test items, suppresses interactive authentication, and retains no key
material. The final run exited successfully.

## Observed local evidence

### Code identity and stale/copy behavior

The experiment compiled distinct daemon/Broker fixtures and ad-hoc signed them with explicit
signing identifiers.

| Case | Observation |
| --- | --- |
| Correct Broker identifier | identifier requirement matched |
| Wrong daemon identifier | denied |
| Unsigned fixture | denied |
| Impostor ad-hoc signed with the expected identifier | **matched an identifier-only requirement** |
| Second/stale build with the same identifier | **matched an identifier-only requirement** |
| Apple-chain plus identifier requirement against ad-hoc code | denied |
| Exact Broker v1 code-directory hash | v1 matched; v2 denied |
| Exact copy of Broker v1 | matched both identifier and exact-hash requirements |
| Running Broker v1 dynamic-code object checked by exact hash | matched |
| Concurrent running stale Broker v2 checked by v1 exact hash | denied |
| Live XPC listener requiring exact ad-hoc client v1 hash | v1 and exact copy accepted; stale v2 denied before delivery |
| Message-derived sender identity on accepted XPC request | exact requirement matched through `SecCodeCreateWithXPCMessage` |
| Cross-process XPC read-only descriptor | exact bytes received; write rejected |
| Unsigned live XPC fixture | OS killed the fixture; no request was accepted |
| Authenticated client with unknown operation | typed protocol denial; descriptor not consumed |
| `get-task-allow` present | denied by an explicit entitlement-absent requirement |

Interpretation:

- Signing identifier alone is not authority. A production requirement must include the accepted
  Apple-issued signing chain/team and component identifier.
- Team plus identifier is a release identity, not an exact-build identity. Exact build enforcement
  needs the enrolled code-directory hash set (including all accepted architecture/hash variants).
- A byte-for-byte copied signed binary retains the same code identity. This is expected; path and
  filename are not identity. If launch context matters, use launch/responsible/parent constraints
  and protected installation/storage rules rather than a path check.
- Trust epoch is not a code-signing fact. The XPC/channel check must be combined with typed epoch
  binding and fail-closed protocol state.
- The running-peer observation proves that exact requirements apply to a live dynamic-code object,
  not that a PID is a safe IPC identity. PID reuse and lookup substitution remain reasons to use
  `SecCodeCreateWithXPCMessage` or an OS-enforced XPC peer requirement in product code.
- The launchd harness directly proves those two message-bound mechanisms compose with XPC FD
  transfer under ad-hoc exact-build enrollment. It does not prove Team ID, distribution channel,
  entitlement, effective-session, or product-installation checks.

### Dynamic validity and debugging

The public Security framework reported both ordinary fixtures dynamically valid and not debugged.
LLDB launched the debug-entitled fixture and the process then reported:

```text
seccode.dynamic-valid=true
seccode.debugged=true
```

The debugged flag is therefore independent from dynamic validity. Validated posture must require
both a valid signature/dynamic state and absence of `get-task-allow`/debug attachment. Apple
documents the debugged status as sticky for the process lifetime, but this remains point-in-time
evidence at the check boundary.

### Keychain and Secure Enclave

| Case | Observation |
| --- | --- |
| Add item to an unentitled data-protection Keychain access group | `errSecMissingEntitlement` (`-34018`) |
| Persist Secure Enclave key from the unprovisioned fixture | denied with `-34018` |
| Create nonpersistent Secure Enclave P-256 evidence key | succeeded |
| Sign SHA-256 digest with that key without interaction | succeeded |
| Create nonpersistent Secure Enclave P-256 approval key with `userPresence` | succeeded |
| Sign with authentication interaction prohibited | denied with LocalAuthentication `-1004`, “User interaction required” |

This directly observes hardware support, noninteractive evidence signing, user-presence gating, and
the missing-entitlement denial. It does **not** establish persistent per-component access groups;
that requires a validated application identifier/keychain-access-groups entitlement and matching
provisioning profile.

The private-key export case is covered by Apple’s platform contract rather than this persistent
fixture: the unprovisioned process was denied before it could persist the key. Apple states that
Secure Enclave private key material cannot be transferred into or out of the enclave and supports
only generated P-256 keys.

### SDK/API availability observed in the macOS 26.5 SDK

- `xpc_connection_set_peer_code_signing_requirement`: macOS 12.0+; XPC checks all received
  messages and drops/cancels mismatching peers.
- team identity, entitlement, and lightweight peer requirements: macOS 14.4+.
- `xpc_peer_requirement_t`, `xpc_connection_set_peer_requirement`, and conversion from a
  `ProcessCodeRequirement` to an XPC peer requirement: macOS 26.0+.
- `SecCodeCreateWithXPCMessage`: creates a dynamic code object from the actual received XPC message,
  avoiding PID/path/name substitution.
- `SecCodeCheckValidityWithProcessRequirement`: macOS 15.0+; process constraints expose dynamic
  validity, debug capability, Hardened Runtime, library validation, ad-hoc status, and debugged
  status.
- XPC exposes peer effective UID and audit-session ID at connection establishment. The correct
  Capsule GUI/login-session policy and fast-user-switching cases were not exercised.

## Current primary-source platform evidence

### XPC and runtime identity

Apple’s XPC peer requirement is applied to messages received on the connection; mismatching
listener requests are dropped and reply paths receive a peer-code-signing error. The current SDK
also permits a process code requirement to become an XPC peer requirement on macOS 26. See
[xpc_connection_set_peer_requirement](https://developer.apple.com/documentation/xpc/xpc_connection_set_peer_requirement),
[TN3127: Inside Code Signing Requirements](https://developer.apple.com/documentation/Technotes/tn3127-inside-code-signing-requirements),
and [SecCodeCreateWithXPCMessage](https://developer.apple.com/documentation/security/seccodecreatewithxpcmessage%28_%3A_%3A_%3A%29).

Apple distinguishes signer/team identity from signing identifier and notes that ad-hoc signatures
cannot reliably preserve an identity across versions. Dynamic validity checks combine the running
code state with static signature validation. Debug attachment is separately observable through
[`kSecCodeStatusDebugged`](https://developer.apple.com/documentation/security/seccodestatus/debugged),
and [`SecCodeCheckValidity`](https://developer.apple.com/documentation/security/seccodecheckvalidity%28_%3A_%3A_%3A%29)
performs dynamic validation.

For launch authority, launch, parent, responsible-process, library, and launchd spawn constraints
are kernel/launchd mechanisms, not XPC authorization replacements. See
[Applying launch environment and library constraints](https://developer.apple.com/documentation/security/applying-launch-environment-and-library-constraints)
and [Defining launch environment and library constraints](https://developer.apple.com/documentation/security/defining-launch-environment-and-library-constraints).

### Keychain, Secure Enclave, and user presence

For macOS data-protection Keychain items, access groups are derived from validated entitlements.
An item belongs to one group; using an unauthorized group fails with `errSecMissingEntitlement`.
This applies on macOS when `kSecUseDataProtectionKeychain` is used, and Secure Enclave keys use that
model. See [Sharing access to keychain items among a collection of apps](https://developer.apple.com/documentation/security/sharing-access-to-keychain-items-among-a-collection-of-apps),
[`kSecAttrAccessGroup`](https://developer.apple.com/documentation/Security/kSecAttrAccessGroup), and
[`kSecUseDataProtectionKeychain`](https://developer.apple.com/documentation/security/ksecusedataprotectionkeychain).

Apple documents Secure Enclave support on M1-or-later Macs (and certain earlier Touch ID Macs), P-256
only, generated in the enclave, and not importable/exportable. User-presence access control may use
biometry or device credentials; it proves a system-gated key operation, not user comprehension or
correct Broker rendering. See [Protecting keys with the Secure Enclave](https://developer.apple.com/documentation/Security/protecting-keys-with-the-secure-enclave),
[`kSecAccessControlUserPresence`](https://developer.apple.com/documentation/security/secaccesscontrolcreateflags/userpresence),
and [Accessing Keychain Items with Face ID or Touch ID](https://developer.apple.com/documentation/localauthentication/accessing-keychain-items-with-face-id-or-touch-id).

Legacy macOS Keychain ACLs are not a substitute for this model: Apple documents `kSecAttrAccess` as
mutually exclusive with `kSecAttrAccessControl` and inapplicable to data-protection Keychain items.
See [`kSecAttrAccess`](https://developer.apple.com/documentation/security/ksecattraccess).

### Protected storage

Apple documents code-signature-associated app data containers on macOS 14+ and SIP-protected app
group containers for non-sandboxed bundled components on macOS 15+. Access by a nonmember triggers
user authorization rather than silently succeeding. See
[Accessing files from the macOS App Sandbox](https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox),
[Protecting local app data using containers on macOS](https://developer.apple.com/documentation/xcode/protecting-local-app-data-using-containers),
and [Accessing app group containers in your existing macOS app](https://developer.apple.com/documentation/xcode/accessing-app-group-containers).

Therefore protected containers are real OS enforcement, but the protection is conditional on
correct bundle signing/validated entitlements, SIP, and the trusted-user/administrator assumption.
A user can authorize another app, and a privileged administrator/kernel remains out of scope.

## Enforcement versus packaging/protocol assumptions

| Property | Classification | Boundary/condition |
| --- | --- | --- |
| Apple signer/team + component signing identifier on XPC messages | OS enforcement | Apple-issued dev/distribution signature; exact requirement installed before activation |
| Exact active build | OS enforcement when code-directory hashes are required | Manifest must contain all accepted hashes; update replaces accepted set |
| Dynamic validity and debugged status | OS observation, point-in-time | Check actual XPC-message sender; debugged is distinct from validity |
| Effective UID and audit session | OS observation | Capsule must define correct user/login-session policy and test switching |
| Trust epoch, registration, nonce, purpose, audience | Protocol enforcement | Not represented by code signing; typed messages and durable state required |
| Keychain access group separation by component | OS enforcement | Data-protection Keychain, validated entitlement/profile, no shared operational group |
| Exact build allowed to use a Keychain key | **Not provided by a stable access group** | Access-group membership is entitlement/team based, not code-directory-hash based |
| Secure Enclave nonexportable P-256 operations | Hardware/platform enforcement where available | Generated on supported hardware; no import; unavailable hardware must fail or use an explicit lower posture |
| Approval user presence | OS-gated key operation | Does not attest correct UI, comprehension, or a particular person remotely |
| Broker/Supervisor protected store | OS enforcement with user override/admin limitation | App data container or single-component app group; signed bundled process; SIP enabled |
| No broad shared app group | Packaging rule | A narrow IPC-only group may be unavoidable for sandboxed/nonsandboxed IPC but must contain no authority/state |
| Supervisor-only backend creation | Architecture plus IPC/launch enforcement | Exact backend/launch-helper topology still depends on Gates C/E |

## Required adversarial cases: disposition

| Required case | Result |
| --- | --- |
| Unsigned peer | static denial observed; live fixture was killed by the OS and delivered no XPC request |
| Same-team wrong signing identifier | Apple Development and Developer ID static/live XPC denial observed |
| Stale build | identifier-only acceptance plus static, live dynamic, and live XPC exact-hash denial observed; epoch protocol pending |
| Copied binary / PID/path/name substitution | exact copy accepted by design; message-derived `SecCode` is the required identity mechanism |
| Debug/development signing | `get-task-allow` and live-debug denial observed; Apple Development and Developer ID channel-specific requirements passed; notarization submitted, with acceptance/stapling pending |
| Wrong entitlement / Keychain group | provisioned positive own-group use and sibling/daemon `-34018` denial observed |
| Daemon use of Approval/Supervisor keys | provisioned persistent-key queries failed with `-34018`; Broker/Supervisor own-key operations passed |
| Broker/Supervisor store access | distinct signed sandbox-container own access passed and cross-role access was denied |
| Migration/team change | documentation evidence only; no signing identities or alternate team available |
| Unavailable Secure Enclave | documentation evidence and test plan only; current hardware has a working enclave |
| User-presence unavailable/noninteractive | noninteractive use denied and interactive user-presence signing succeeded; cancel, lockout, no-enrollment, password fallback, lock/switch cases pending |
| Wrong trust epoch | exact authenticated XPC client with wrong epoch denied before FD redemption; durable product epoch lifecycle pending |

## Decision and conditions

**Conditional-pass.** Current macOS provides credible enforcement primitives for the intended
authority split, and the local negative evidence found no fundamental platform blocker. The gate
must remain unvalidated/proposed until all conditions below pass on the minimum supported OS and
distribution channel:

1. Three distinct Apple Development and then distribution-signed installed components use unique
   signing identifiers and validated entitlements/profiles.
2. Every trusted XPC direction enforces signer/team, role identifier, accepted code-directory hash
   set, required/forbidden entitlements, effective UID/session, and actual message-sender dynamic
   state before parsing or state transition.
3. The active epoch is independently bound in protocol state; stale components fail even if their
   historical signatures remain valid.
4. Broker Approval, installation-root, and Supervisor evidence keys use disjoint data-protection
   Keychain groups. The daemon belongs to none of them.
5. Broker and Supervisor stores use distinct protected containers; a shared group, if required only
   for IPC naming, contains no authoritative state, content, keys, or trust checkpoints.
6. The project explicitly selects a minimum macOS path: macOS 26 XPC process requirements, or an
   earlier compatibility design based on legacy XPC code requirements plus
   `SecCodeCreateWithXPCMessage`/dynamic checks. Both paths need their own retained matrix.
7. Backend launch ownership is proven with the Gate C/E topology; Gate B alone cannot establish it.

## Concrete architecture/document changes proposed

No broad architecture files were edited in this spike. Apply these focused changes after review:

1. **`TRUST_ARCHITECTURE.md` / `RUNTIME_INTEGRITY.md`:** name
   `SecCodeCreateWithXPCMessage` as the compatibility-path source of peer identity and prohibit PID,
   path, or process-name lookup. Add a macOS-26 path using `XPCPeerRequirement` constructed from a
   `ProcessCodeRequirement`.
2. **`RUNTIME_INTEGRITY.md`:** make the preflight predicate explicit: signature valid, exact team,
   role identifier, active code-directory hash, Hardened Runtime/library-validation policy,
   `get-task-allow` absent, and debugged flag absent. Record checks as point-in-time unless a real
   monitor exists.
3. **`INSTALLATION_TRUST.md`:** distinguish release identity (team + identifier + channel) from
   exact build identity (code-directory hash set + entitlement digest). State that an exact copy is
   the same code identity and that epoch, not path, rejects stale state.
4. **`INSTALLATION_TRUST.md` / ADR-0012:** record that a stable Keychain access group is
   component-scoped, not build-scoped. Require operational key rotation on epoch change and resolve
   whether per-epoch access groups, a separate installation-authority component, or another
   reviewed mechanism prevents a stale same-team build from discovering/using a newly enrolled key.
5. **`TRUST_ARCHITECTURE.md` / ADR-0018:** move the installation root out of the routine Broker
   process. Prefer a rarely launched installation-authority/repair ceremony with its own identifier,
   Keychain group, and protected store.
6. **`ARCHITECTURE.md`:** define storage packaging: sandboxed app data container where compatible;
   otherwise a single-component SIP-protected app group container on macOS 15+. An IPC-only common
   group is non-authoritative and documented as a narrow exception.
7. **`COMPONENT_COMPROMISE_MATRIX.md`:** add the same-team stale-build/key-group residual. Exact
   XPC hash denial does not itself revoke Keychain group membership.
8. **`FEASIBILITY_SPIKES.md`:** require development, Developer ID, and any Mac App Store variants
   separately; a development-signing pass cannot promote distribution posture.

## Distribution and entitlement prerequisites

- Stable Apple Developer Team ID and distinct bundle/signing identifiers for daemon, Broker,
  Supervisor, updater, and any launcher.
- Apple Development identities for the full local negative harness; Developer ID Application plus
  Hardened Runtime and notarization for direct distribution, or App Sandbox for Mac App Store.
- A validated provisioning profile for each bundled executable that claims restricted Keychain
  access groups. Apple’s distribution guidance says each program using those groups needs the
  corresponding profile. See [Creating distribution-signed code for macOS](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac).
- App-like bundle packaging for daemon-style executables that require provisioning-profile-backed
  entitlements. See [Signing a daemon with a restricted entitlement](https://developer.apple.com/documentation/xcode/signing-a-daemon-with-a-restricted-entitlement).
- Distinct single-member storage groups and distinct keychain groups. Do not assume a macOS-style
  team-prefixed app group is also a Keychain access group; Apple documents that it is not.
- Explicit update/migration handling for Team ID/App ID prefix, distribution-channel, designated
  requirement, profile, entitlement, and container association changes.

## Open risks

1. **Stale same-team key use:** access groups do not encode an exact build. The retained attack
   confirmed that an old same-team component with the same validated group entitlement can query a
   new item and use a new Secure Enclave key even while its code-directory hash is rejected by the
   exact-build requirement. Protocol key revocation alone is insufficient.
2. **Container user override:** protected container access can be user-authorized; the UX and
   behavior under Full Disk Access, MDM, fast user switching, and unattended launch agents need
   adversarial testing.
3. **Interactive approval:** successful user presence and noninteractive denial were exercised.
   Cancel, lockout, no enrollment, password fallback, session switching, and screen-lock behavior
   remain unknown for Capsule UX.
4. **Hardware absence/failure:** Intel without suitable hardware, virtual machines, disabled or
   failed token services, OS restore, and hardware replacement were not available locally.
5. **Remaining XPC lifecycle:** per-user launchd registration, symmetric Apple-signed exact-peer
   enforcement, message-derived identity, stale/unsigned/wrong-role rejection, malformed and
   wrong-epoch operations, descriptor transfer, and clean bootout were run. Product-service
   packaging, reconnect/replay, service crash, activation races, session switching, and upgrade
   replacement remain untested.
6. **Backend authority:** the Supervisor/launcher privilege and Apple Container control endpoint
   remain gated by Gates C and E.
7. **Migration:** Secure Enclave keys do not migrate; access-group/team changes and app-container
   designated-requirement changes can strand state or prompt. Recovery must create a new
   installation identity when continuity cannot be proven.

## Next smallest test

The first provisioned Xcode workspace and cross-role matrix now exist. The next Gate B work is:

1. carry the now-positive development and Developer ID per-release Keychain-group strategy through
   crash-safe install/key-authorization/rollback transitions; compare a signing mediator only if
   that operational model is too costly;
2. package the three-role topology as installed per-user services and exercise reconnect, service
   replacement, activation races, effective UID/audit session, fast-user-switching, and screen-lock
   cases;
3. collect the submitted Apple notarization results, staple/assess accepted exports, and rerun the
   packaged matrix;
4. exercise approval cancel, lockout/no-enrollment/password fallback and protected-container user
   override/Full Disk Access behavior; and
5. bind the real durable Gate F epoch store instead of a constant harness field.

## Verification

Passed on the environment above:

- `./experiments/macos-authority-separation/run.sh --with-debugger`
- `./experiments/macos-authority-separation/run-xpc.sh`
- `./experiments/macos-authority-separation/run-apple-signed.sh development`
- `./experiments/macos-authority-separation/run-apple-signed.sh developer-id`
- `./experiments/macos-authority-separation/Provisioned/run-provisioned.sh`
- `./experiments/macos-authority-separation/Provisioned/run-provisioned.sh --interactive`
- `./experiments/macos-authority-separation/Provisioned/run-stale-keygroup.sh`
- `./experiments/macos-authority-separation/Provisioned/run-rotated-keygroup.sh`
- `./experiments/macos-authority-separation/Provisioned/run-developer-id-export.sh`
- `sh -n experiments/macos-authority-separation/run.sh`
- `pnpm install --frozen-lockfile` under Node 22.22.1 / pnpm 10.28.2
- `pnpm check`
- `pnpm lint`
- `pnpm test`
- `pnpm verify:schemas`
- `go test ./...`
- `go vet ./...`
- `go build ./...`
