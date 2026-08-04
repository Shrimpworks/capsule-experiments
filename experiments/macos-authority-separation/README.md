# Gate B macOS Authority-Separation Spike

Status: development-only disposable experiment. Nothing here is a production security boundary or
receipt evidence.

Owner: Capsule architecture spike. Remove or replace this experiment after independently
distribution-signed daemon, Broker, and Supervisor targets have passed the Gate B matrix on the
minimum supported macOS release and the resulting contracts are frozen.

## Bounded question

Can macOS make the daemon, Trusted Host Broker, and Execution Supervisor distinct authorities for
IPC, keys, and storage, rather than relying only on same-user process packaging?

## Hypothesis

Apple-issued component signatures plus XPC peer requirements, data-protection Keychain access
groups, Secure Enclave access controls, and protected app/app-group containers can enforce most of
the separation. Exact trust epochs and migration remain protocol responsibilities. Development or
ad-hoc signing cannot substantiate the production boundary.

## Reproduction

Run `./run.sh --with-debugger` and `./run-xpc.sh` on macOS. Both create only derived files under
`build/`. The XPC runner temporarily bootstraps the exact per-user
`dev.capsule.gate-b.license-free` LaunchAgent, refuses to replace an existing service, and boots it
out on exit. The key probe creates ephemeral Keychain keys/items and deletes them before exit. It
deliberately suppresses interactive authentication; it must not satisfy the approval-key
user-presence policy.

The retained source covers:

- correct and wrong signing identifiers;
- an unsigned binary;
- an ad-hoc impostor with the expected identifier;
- two builds with the same identifier;
- an exact copied binary;
- Security-framework validation of two concurrently running peer processes by
  exact code-directory hash, accepting v1 and denying stale v2;
- a live launchd XPC service whose listener enforces the exact ad-hoc client hash before message
  delivery, plus message-derived `SecCode` revalidation and read-only FD transfer;
- live acceptance of an exact copy, stale-build rejection, unsigned-fixture rejection, and typed
  protocol rejection after successful peer authentication;
- rejection of ad-hoc code by an Apple-chain requirement;
- rejection of the development-only `get-task-allow` entitlement;
- point-in-time dynamic-valid and sticky debugger-attached status;
- an explicit unentitled data-protection Keychain access group;
- Secure Enclave P-256 creation, background signing, a persistent-key export branch when
  entitlement-backed persistence succeeds, and noninteractive user-presence denial.

The Apple-credentialed follow-up additionally provides:

- `./run-apple-signed.sh development` and `./run-apple-signed.sh developer-id` for Team ID,
  certificate-channel, role identifier, exact-build, Hardened Runtime, symmetric XPC peer, and
  wrong-epoch checks;
- [`Provisioned/`](Provisioned/) with three Xcode-signed sandboxed app targets, disjoint
  data-protection Keychain groups, persistent Secure Enclave keys, protected app containers, and
  an optional interactive approval-key test;
- `./Provisioned/run-stale-keygroup.sh`, which proves a stale same-team build is denied by the
  exact-build requirement but can still use a stable Keychain group and its newly created key.
- `./Provisioned/run-rotated-keygroup.sh`, which proves a replacement development-signed Broker
  with a new group denies old/new cross-use while retaining the same Team and role identifier.
- `./Provisioned/run-developer-id-export.sh`, which exports all three roles with Hardened Runtime,
  timestamps, no debug entitlement, release-scoped operational groups, and expected unnotarized
  Gatekeeper classification.

The running-peer check uses `SecCodeCopyGuestWithAttributes` and a kernel PID only to exercise
dynamic-code validation; it must not be used as the product peer identity path. The separate XPC
harness does use both an OS-enforced listener peer requirement and
`SecCodeCreateWithXPCMessage`; its baseline uses ad-hoc exact hashes and its follow-up uses Apple
Development and Developer ID identities. The final production matrix still requires installed
product services, distribution provisioning/notarization, session/lifecycle cases, and mitigation
of stable-group access by stale signed builds.

See [RESULTS.md](RESULTS.md) for the evidence/limitation split, Gate B decision, proposed document
changes, and next test.
