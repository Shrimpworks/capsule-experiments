# Future C2b execution authorization boundary

This file is a preparation checklist, not authorization. Construction has
**PASSED**; any native XPC execution remains **BLOCKED** until the owner supplies
and approves every applicable fact below in a new task.

## Immutable input

- Capsule repository: `Shrimpworks/capsule-corp`
- Capsule commit: `e7220e523bc43ba8867122a1233e1625f2c1c164`
- Manifest SHA-256:
  `c76e1f6cc6d79db867618ee3a5cdb96794896705ada657c40e1c091cce818b59`
- Native contract SHA-256:
  `7ae502b0742bab1e129cdb8fc026b680416587353af55631f55e80f2fabf962c`
- Ordered-case digest:
  `9ac6845baf35651aab057989264ab7fb17305751d3101df38d26b2334b8ef68e`
- This archive's future immutable capsule-experiments commit: owner must fill
  after this change is merged.

The executable scope is only `SubmitMainMJSV0`, `RegisterPlanV0`, and
`GetRegisteredPlanV0`. `SubmitApprovalV0` and `RequestAttemptV0` remain passive
collision/reference fixtures and must not be activated.

## Owner facts required before a run

- A non-secret stable asset label for the exact owned Mac and confirmation of
  local authorization.
- Current macOS version/build, architecture/model class, Xcode, SDK, and clang.
- Numeric expected EUID and audit-session ID only, plus the exact current-user
  bootstrap domain. Do not retain username, Apple ID, serial, UDID, passwords,
  tokens, certificates, or Keychain inventory.
- Readback that all experimental service names, process names, and the temporary
  root in `experiment-profile.json` are absent and that no Capsule product
  service/store overlaps them.
- Acceptance of the one-to-one experimental service alias limitation. Exact
  canonical product service names require a separately authorized isolated
  bootstrap namespace and are not silently substituted.
- Acceptance or rejection of observation-only exact deadline-boundary rows for
  all three S3 methods.
- Whether a separately owned disposable user/Aqua session is available and
  authorized for an actual wrong-EUID/audit-session row; otherwise record the row
  as untested.
- Whether debugged-state testing can occur without `sudo`, security-policy
  weakening, or global-setting changes; otherwise record it as untested.
- An exact owner-controlled evidence workspace and final archive destination.

## Maximum permitted scope for a later explicit authorization

A later owner authorization may name only this retained source/fixture packet,
the identifiers in `experiment-profile.json`, the exact current-user bootstrap
domain, and the exact evidence workspace. It may permit compilation, ad-hoc
signing of disposable copies without enumerating or using Apple-issued
identities, registration of only the three experimental services, launch of only
the five named disposable processes, delivery of only the pinned S3 fixtures and
enumerated mutations, bounded evidence capture, and exact cleanup.

That later task must still separately enumerate its peer-requirement variants,
cap/flow rows, deadline rows, cancellation/interruption rows, response-loss rows,
process-fault rows, and destructive cleanup actions. Every evidence row must be
classified as OS enforcement, protocol enforcement, harness mechanic, inference,
or untested.

It must not access Keychain, use or enumerate Apple Development/Developer ID
identities, access a network or unrelated process/user/session/credential/data,
mutate a Capsule product service/root/store, use `sudo`, alter global
security/debug settings, create users, or launch a runtime/backend/VM/guest.
Unexpected prompts or mismatches require an immediate stop.

## Required cleanup and readback

- Reap every named PID and prove no matching process remains.
- Remove all three experimental registrations from the authorized bootstrap
  domain and prove connection attempts fail.
- Prove no canonical Capsule product service was registered or changed.
- Verify the retained evidence copy, then remove the exact temporary root and
  prove no unexpected file or symlink escaped it.
- Keep capsule-corp clean at the pinned commit and retain only the intended
  capsule-experiments evidence result.
- Retain a manifest covering sources, environment, exact pins, commands, result
  classifications, cleanup receipt, and hashes; exclude credentials and identity
  inventory.
- Return for review without claiming installed composition or product admission.

## Copy/paste owner request skeleton

> Defensively validate Capsule's three-method S3 authenticated-local-IPC control
> using the inert C2b0 packet pinned above on the owned Mac `[ASSET LABEL]`, in
> the exact owner-controlled workspace `[PATH]` and current-user bootstrap domain
> `[DOMAIN]`. I confirm `[OS/BUILD/ARCH/XCODE/SDK/CLANG]`, expected numeric EUID
> `[EUID]`, audit-session ID `[ASID]`, absence of all packet names/root, no product
> overlap, and `[accept/refuse]` the experimental aliases and observation-only
> deadline-boundary rows. `[Authorize/mark untested]` the independently owned
> wrong-session row and debugged-state row. Authorize only the explicitly attached
> row matrix and cleanup operations; all exclusions and stop conditions in this
> document remain binding. Stop after cleanup/readback. Do not claim installed
> composition or product admission.
