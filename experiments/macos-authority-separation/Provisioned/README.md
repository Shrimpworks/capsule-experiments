# Provisioned Gate B authority probe

Status: development-only disposable experiment. It is not product code or production evidence.

This Xcode workspace builds three sandboxed macOS app bundles under one Apple Developer Team:

- Broker: approval Keychain group and private app container;
- Supervisor: evidence Keychain group and private app container;
- daemon: no operational Keychain group.

The runner permits Xcode to register this Mac and create/update development App IDs and profiles.
It stores only fixed non-secret fixtures, creates temporary persistent Secure Enclave keys, and
deletes the test items and keys before a successful exit. Derived products stay under the ignored
parent `build/` directory.

Run the noninteractive matrix:

```sh
./run-provisioned.sh
```

Run the same matrix plus a macOS user-presence prompt for the Approval key:

```sh
./run-provisioned.sh --interactive
```

After a successful provisioned build, run the retained stale-component attack:

```sh
./run-stale-keygroup.sh
```

Test the first mitigation candidate—a replacement Broker release with a new Keychain group:

```sh
./run-rotated-keygroup.sh
```

Export all three roles through Developer ID with release-scoped Broker/Supervisor groups:

```sh
./run-developer-id-export.sh
```

That runner expects Gatekeeper to report `Unnotarized Developer ID`; notarization is deliberately
kept as a separate gate.

After storing notarization credentials in the `capsule-notary` Keychain profile, submit, staple,
and assess a retained Developer ID run:

```sh
./run-notarization.sh ../build/developer-id-run.XXXXXX
```

Set `CAPSULE_NOTARY_PROFILE` when the credential profile uses another name. The runner uploads each
role independently and requires Apple notarization, a valid stapled ticket, and Gatekeeper's
`Notarized Developer ID` assessment before it passes.

The stale test deliberately creates a differently hashed Broker with the same Apple Development
team, signing identifier, embedded profile, and access-group entitlement. Exact-build code
requirements deny it, while the stable Keychain group still admits it. This retained negative
result must be addressed by the installation/key-rotation design.

Set `CAPSULE_SIGNING_IDENTITY` only when more than one valid Apple Development identity exists.
Never use real secrets with this experiment.
