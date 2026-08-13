# C5b7 deterministic governed runtime root

Date: 2026-08-13

Scoped deterministic no-run runtime-root construction: `PASSED`

Complete C5b composite, controlled execution, and admission: `BLOCKED`

## Question

Can the exact C5b6 governed Deno runtime and snapshot be combined with the C5b1 trusted init and
launcher and C5b0 fixed source inputs in a fresh, closed, byte-reproducible raw root without
executing or loading any retained artifact?

Yes. Two independent output roots were constructed and compared byte-for-byte. One exact root is
retained with an independent filesystem parser and fifteen fail-closed mutations.

## Defensive boundary

This is construction-only, local-only Capsule research at experiments baseline
`d9967e80a6155a65c6876dc686d8f8498b4a908f`. The scripts read immutable merged predecessor bytes
and write a raw image. They do not execute the runtime, trusted init, trusted launcher, controller,
adapter, host runner, libkrun, HVF, a VM, or a guest. No credential, signing identity, network
target, service, product store, or admission state participates.

## Versioned root

The C5b1 root was 8 MiB and deliberately omitted the governed runtime. This root is an explicit
successor, not a claim of byte equivalence: 96 MiB, 4 KiB blocks, one ext4 group, extents,
no journal, fixed zero timestamps, UID/GID 0, and a closed 19-node inventory. It contains only:

- `/usr/local/bin/capsule-deno-core-c5b1`;
- `/usr/local/share/capsule-deno-core/capsule_core_snapshot.bin`;
- `/usr/local/libexec/capsule-init.krun` and `capsule-launcher`;
- the exact fixed `main.mjs`, `SourceManifest`, and input under `/opt/capsule/inputs`; and
- the required empty `/dev` and `/proc` mount points.

The C5b3 controller and C5b5 adapter identities are pinned as metadata only. They are not placed
inside the guest root and this packet does not create a complete composite. The C5b5 adapter
freezes a 134,217,728-byte root, while this successor is 100,663,296 bytes, so it is incompatible
as-is. Before composite construction, a reviewed versioned adapter/effect implementation must bind
this root's exact size, or a separately versioned 134,217,728-byte root must replace it.

## Verification

```sh
node scripts/generate.mjs --check
node scripts/verify.mjs
node scripts/test-mutations.mjs
git diff --check
```

See `RESULTS.md`, `HANDOFF.md`, and `manifests/runtime-root-profile.json` before reusing the root.
