# macOS I1A unsigned application shell

```text
Work item: I1A unsigned no-guest application construction
Status: PASSED
Scope: deterministic unsigned bytes and exact I0 bundle layout only
Evidence or reason: two clean Swift builds and bundle assemblies are byte-identical; independent
  readback binds 23 closed files, seven required roles, exact R2 identities, inert placeholders,
  metadata projections, and inactive activation
Remaining work: Apple signing, provisioning, installed placement, private-XPC reachability,
  SMAppService registration, effective entitlements, bootstrap, IPC, runtime, backend, and guest
  behavior are outside I1A
Next action: request separate authorization for credentialed I1B and Source Validator R3 only after
  exact Team-3DDR role profiles, selected signing identity, entitlements, and placement inputs exist
Parent status: developer-signed installed I1 composition is BLOCKED
```

This artifact constructs one visible AppKit `Capsule.app` status shell and the exact seven-role
tree frozen by ADR-0037. The visible UI contains only hard-coded typed installation facts, says
that the checkpoint is unsigned, and says execution is disabled. It has no approval, source,
HTML, service-registration, bootstrap, IPC, runtime, backend, or guest surface.

The daemon and Execution Supervisor product binaries do not exist. I1A therefore places
role-distinct, plain-text, mode-`0644` test-only placeholders at their exact I0 executable paths.
They contain no program bytes and cannot be executed. Both role bundles and their launch-agent
descriptors remain activation-refusing.

The two Source Validator subtrees are exact copies of the merged R2 files. Their inactive resource
policies make the launchers predecode and refuse without spawning. I1A does not rebuild, relabel,
sign, install, or launch them.

Reproduce and independently verify on the selected local macOS toolchain:

```sh
./artifacts/macos-i1a-unsigned-app-shell/scripts/reproduce.sh
node artifacts/macos-i1a-unsigned-app-shell/scripts/verify-bundle.mjs \
  artifacts/macos-i1a-unsigned-app-shell/dist/Capsule.app \
  5bd80097775908031b1a4c90680e8c7656cc5e9f97df2cc187592f75ee67a56f
```

The reproducer uses Apple Swift/AppKit and existing repository R2 bytes only. It invokes no
`codesign` signing operation; the linker-generated ad-hoc CodeDirectory has no TeamIdentifier.
Read-only `codesign -d` output is checked solely to refuse an unexpected Apple identity. The app
is not launched by reproduction or verification.

See [the retained construction result](../../docs/MACOS_INSTALLATION_I1A_UNSIGNED_CONSTRUCTION.md)
and [the exact evidence](evidence/construction.json).
