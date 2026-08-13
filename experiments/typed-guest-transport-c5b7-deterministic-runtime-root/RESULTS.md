# C5b7 results

Scoped result: `PASSED`

Parent owner-only hostile-`.mjs` internal alpha: `IN_PROGRESS — TRENDING_GOOD`

Complete C5b composite, controlled execution, installed composition, runtime/profile admission,
and product admission: `BLOCKED`

## Observed

- A and B are byte-identical 100,663,296-byte raw roots.
- Retained root SHA-256: `5ad18f20cbc97c7a70ead3e795fd3649672513323041e913b0eb55b7acc88775`.
- Filesystem: one-group ext4, 4,096-byte blocks, extents and file types only, no journal, 17,115
  used blocks, 7,461 free blocks, 256 inodes, 19 reachable nodes.
- Every reachable inode is UID/GID 0, has a fixed mode and zero time fields, and occupies a closed,
  contiguous, non-overlapping extent inventory.
- The governed runtime, snapshot, trusted init, trusted launcher, source, SourceManifest, and input
  reproduce their merged predecessor sizes and SHA-256 values.
- The independent parser validates superblock, group descriptor, allocation bitmaps, inode/extents,
  directory records, modes, ownership, timestamps, path closure, and file hashes.
- Ten mutations covering root identity, journal restoration, foreign paths/ownership, mode/content,
  truncation, false effect claims, metadata pins, and archive closure refuse.

## Claim boundary

The result proves deterministic byte construction and static filesystem closure only. It does not
prove that Linux mounts the image, that the runtime starts or consumes the snapshot, that the
launcher contract succeeds, that libkrun realizes the device/FD topology, or that teardown and
completion-last semantics work in a guest. Those claims require the later complete composite and
separately authorized controlled C5b execution.
