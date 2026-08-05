# Results

Status: `BLOCKED`

The governed inputs and retained passive contracts verified, but final artifact construction was
stopped before producing any selectable profile identity.

## Passed static prerequisites

- C1 fixture: 9,289 bytes, SHA-256
  `d5d75e638a15be6c9f4a3230d17309d085f6ec103a73b64d9e0fd656a5423c9e`.
- C2A fixture: 26,850 bytes, SHA-256
  `d4ce88888186266f5d251e6246c889b1fd46d7746bb0ba56bcc4b3ce4675992f`.
- Runtime candidate: `governed-deno-core-linux-arm64-rc-2026-08-04-1`, self-digest
  `78cf2e99e58a4e79413f22889dd19f794ac7cdce3e4ec5c167d6c2051d19afaa`.
- The canonical runtime-candidate verifier passed offline; its 25 focused Node tests passed.
- Governed Deno, rusty_v8, and libkrun heads/trees and merge parents were present and exact.
- Both rusty_v8 governed input verifiers passed with 20 exact gitlinks and 22 cross packages.
- The five libkrun patches individually matched their retained digests and reconstructed the
  governed base; aggregate SHA-256 was
  `d19fd0ff159c699acccda2621519de45a09408bf3847b418ac34e02b79e805d5`.
- libkrunfw 5.5.0 archive SHA-256 was
  `5bfae6efee63dbdf04a8fac2a69d772d9f900af2f54c4429b4acdfd6d86b9979`;
  retained `kernel.c` SHA-256 was
  `96561a4e5dccec0364a28ac32c5668e13e31180d083f412c9f8be7599380c70d`.
- Linux 6.12.91 source SHA-256 was
  `0ff2ab9e169f9f1948557471fbb450d3018f8c5b77caf288e1a3982582597969`,
  matching the kernel.org signed checksum list; `xz -t` passed.

## Build boundary reached

A standalone `Shrimpworks/rusty_v8` clone was detached at the exact governed head, all 20 pinned
submodules were initialized, and a new isolated Docker volume was seeded from empty state. The
connected prefetch verified 263 Cargo archives. The decisive build ran with `--network none`, all
capabilities dropped, and `no-new-privileges`; the arm64 link/readelf/QEMU self-probe passed.
Compilation was intentionally interrupted when the static child-interface incompatibility was
confirmed. No partially built byte is an artifact or identity.

The prior 9.5 GB governed builder volume, a failed 901 MB linked-worktree seed, and the final 9.1 GB
interrupted standalone-clone build volume were removed with their task-owned containers. They are
not recoverable. No broad Docker prune occurred.

## Blocking interface

The runtime source at evidence merge `fa03d7043b4f0653081d6c5733d597f49f6efd1c` is SHA-256
`2797c74c1aedb599661110e8d7c093a4868bf17490ad5bf44952eb7416067de7`. It embeds a different
source/input allowlist from C2A and returns these refusal errors:

- `source is not an exact retained Capsule fixture`
- `input is not the exact retained Capsule fixture`

The missing interface is a newly governed runtime candidate, built from an explicitly reviewed
harness that accepts exactly the C2A 103-byte source and 36-byte input while preserving the
three-op, no-loader, fixed-snapshot runtime contract. That change must receive a new runtime
candidate identity, provenance/SBOM/license closure, mutation corpus, and passive C1/C2A review.

## Null result

Host runner, governed libkrun dylib, libkrunfw dylib, firmware, guest kernel, trusted init, trusted
launcher, raw runtime root, and composed runtime-profile manifest all remain null. Historical or
partially built bytes were not substituted.

C2B, runtime selection/admission, `RUNTIME-001`, and `VMM-001` remain `BLOCKED`/`unsupported`.
