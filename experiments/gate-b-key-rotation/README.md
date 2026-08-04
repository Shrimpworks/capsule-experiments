# Gate B release-scoped key-rotation spike

Status: development-only disposable research. Product packages must not import this code.

Owner: Capsule maintainers, Gate B/Gate F.

Removal/replacement condition: replace this experiment after the installed Broker/Supervisor
update implementation uses production-authenticated `PreparedUpdate` and epoch objects and passes
equivalent real-process, installer, Keychain, power-loss, disk-failure, and session/lifecycle
tests. Retain `RESULTS.md` and translated fixtures as evidence.

## Question

Can Capsule rotate an operational Secure Enclave key from one release-scoped Keychain access group
to another without letting old and new builds cross-use keys, enabling execution during a partial
transition, replaying an authorization, or silently rewinding a committed epoch?

The spike tests the current leading Gate B mitigation for the observed stable-group weakness. A
stable access group admits historical same-Team/profile builds; a new access group should prevent
the prior build from reaching the replacement private key.

## Safety and scope

- The Python model and macOS harness are non-production executable specifications.
- The platform runner uses the already registered development Broker App ID and its existing
  release-1/release-2 access groups. It does not add another App ID or Keychain group.
- Every platform case uses unique disposable key tags. Cleanup is attempted in `finally` blocks
  through the only binary authorized for each group.
- Test keys contain no user data. Automated platform cases use noninteractive Secure Enclave P-256
  keys so the crash matrix does not produce repeated user-presence prompts. The separate Gate B
  harness already tested user-presence Approval keys.
- Generated Xcode products are ignored under `build/`.

This does **not** test a production installer, installation-root signature, canonical
`PreparedUpdate`, real multi-role XPC acceptance, power loss, disk full, Keychain lock/login
transitions, MDM, migration, or rollback-resistant hardware/external checkpoints.

## Modeled protocol

The executable model uses one SQLite database for authoritative Supervisor transition state and a
second database for independently observable Keychain/component effects. No transaction spans the
two stores.

```text
stable epoch N
  -> durable execution fence + old unused-grant invalidation
  -> PreparedUpdate durable
  -> durable new-key-create intent
  -> create-if-absent new release-group key
  -> bind the observed public-key fingerprint into staged authorization
  -> install and verify the exact target components
  -> commit epoch N+1 with new authorization active and old authorization replaced
  -> durable old-key-retirement intent
  -> delete and observe the old physical key
  -> accept N+1 from each exact current process incarnation
  -> stable epoch N+1; execution enabled
```

The commit order is intentional:

- Creating a new key is idempotent. A retry queries the exact tag and preserves its public-key
  fingerprint; it never deletes and recreates an already authorized key.
- Before the N+1 commit, repair may restore N only if the old key is still exact and the staged new
  key can be removed. Invalidated old grants remain invalidated.
- At the N+1 commit, verifiers logically replace the old authorization while execution remains
  fenced. A stale old binary may still possess the old key until physical deletion, but its
  signatures are no longer authorized for the current epoch.
- After the N+1 commit, repair is forward-only. It must finish target key retirement and component
  acceptance; it cannot move the epoch pointer back to N.
- Physical old-key deletion is a separate recoverable external effect. Execution is not enabled
  until deletion is observed and every exact current component acceptance is present.

## Run the deterministic model and crash corpus

From the repository root:

```sh
./experiments/gate-b-key-rotation/run-model.sh
```

This runs positive, partial-transition, key-replacement, replay, rollback, forward-repair, stale
component-acceptance, and old-authorization tests. It also starts a child process, pauses after 14
named durable/external-effect checkpoints, sends `SIGKILL` to the exact recorded PID, and opens the
two stores in a fresh process.

## Run the development-provisioned macOS matrix

Prerequisites are the configured Apple Development identity and provisioning state used by
`experiments/macos-authority-separation/Provisioned`.

```sh
./experiments/gate-b-key-rotation/run-provisioned-transition.sh
```

The runner:

1. builds release-1 and release-2 Broker apps with disjoint provisioned access groups;
2. replaces only the disposable probe executable and re-signs each app with Hardened Runtime;
3. creates separate Secure Enclave keys and checks own-group signing;
4. requires both cross-group lookups to fail with `errSecMissingEntitlement` (`-34018`);
5. requires replayed `ensure-key` to retain the same public-key fingerprint;
6. sends exact-PID `SIGKILL` at eight real platform transition checkpoints;
7. exercises both pre-commit prior restoration and pre/post-commit target completion; and
8. verifies the final stable epoch has exactly the expected physical key and execution state.

See `RESULTS.md` for observations, limitations, and the architecture decision.
