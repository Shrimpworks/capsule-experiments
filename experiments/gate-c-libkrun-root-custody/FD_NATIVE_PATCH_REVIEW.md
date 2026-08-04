# FD-native raw runtime-root patch review

Date: 2026-08-02

Disposition: **PATCH-CANDIDATE** for continued governed development only. This review does not
admit libkrun, close P0-1C, or authorize user bytes.

## Exact patch and API

- Upstream source: libkrun `v1.19.4`, commit
  `728df8125077d0db44265f6e997c72b81b65c015`.
- Retained patch: `patches/0003-read-only-raw-root-fd.patch`, SHA-256
  `48cdbc307b3fa1209fa0ec68fc3f817634af312983d68f0de259db86c0b43333`.
- Additive C API:

  ```c
  int32_t krun_add_read_only_raw_root_fd(
      uint32_t ctx_id,
      int fd,
      uint64_t expected_device,
      uint64_t expected_inode,
      uint64_t expected_length);
  ```

The API has one fixed role, `runtime-root:vda:raw:read-only`. It has no pathname, format,
autodetection, mount, root-path, device-selection, write-enable, or backend-option input. The
existing public C functions and signatures remain unchanged. Supplying both this role and either
legacy pathname-backed `vda` or the legacy root-disk API is rejected.

## Custody and I/O semantics

The entry point immediately creates an owned `F_DUPFD_CLOEXEC` duplicate. The caller keeps and may
close its descriptor. Before configuration is retained, the owned duplicate must be open, exactly
`O_RDONLY`, a regular file, mode `0400`, unlinked, equal to the expected device, inode, and length,
and sector aligned. Device construction validates the retained descriptor again, makes an owned
`File::try_clone` duplicate, revalidates that duplicate, and constructs imago directly with
`ImagoFile::try_from(File)` and raw-only `Raw::open_image_sync(..., false)`.

No `open`, `openat`, `/dev/fd`, or pathname reconstruction occurs after API entry. Both the retained
configuration descriptor and imago descriptor are checked against the finalized object identity.
Duplication shares the open-file description, so the patch never changes status flags and performs
no sequential read, write, or seek. Pinned imago raw storage uses `preadv` and `pwritev`; its read
route is positional, while its write route is unreachable through the read-only raw configuration
and the kernel-enforced `O_RDONLY` descriptor. Focused tests confirm the caller offset is unchanged
and `pwrite` is refused rather than approximated.

Context ownership ends when the context/configuration is dropped. Starting a VM transfers the
retained `Arc<File>` into device construction; closing the caller descriptor immediately after the
API returns is safe. Construction failure drops owned duplicates normally. Errors return negative
errno-style values through the existing C convention.

## Maintenance, compatibility, and supply chain

The patch touches five pinned libkrun files: the public header, C API implementation, block
configuration, VMM resource construction, and raw block device. It adds no dependency and does not
change `Cargo.lock`. Most added lines are validation and focused tests; it does not generalize the
storage abstraction or add an image-format surface.

The change is additive at the C source/ABI boundary. Existing applications continue to link and
behave as before; consumers opting into the new symbol must link the patched library. The internal
Rust configuration layout is not a public stable ABI. An upstream submission or governed fork must
still receive independent API/ABI review, export-symbol review, release notes, and maintenance for
future libkrun/imago changes.

The patch retains libkrun's existing license headers and adds no third-party code or dependency.
Release provenance and SBOM records must bind the upstream commit, the three governed patches, the
imago version, built library digests, and corresponding source publication. Existing libkrunfw and
kernel license/source-compliance obligations are unchanged; this experiment makes no distribution
compliance claim.

## Composition constraints

Clean source tests passed in this order:

1. retained firmware `@rpath` and read-only root-mount patches;
2. retained P0-2 direct-root patch;
3. this FD-native patch; and
4. retained P0-3 console patch.

The composed source built and its Rust block/console tests passed. The P0-2 patch has pre-existing
rustfmt drift, and the P0-3 patch produces an existing deprecated-API warning; neither was changed
here. Composition is source-compatible evidence only: every final combined patch, entitlement,
runtime, library, or signing change invalidates the guest and installed-corpus evidence and
requires a complete rerun.

## Decision boundary

Retain this as **PATCH-CANDIDATE** because the exact local raw route and owned guest passed without
pathname fallback or broader storage authority. It remains non-production experiment material.
Only the exact final signed/notarized installed App Sandbox runner, protected construction store,
closed descriptor manifest, same-UID attack corpus, and post-stop/recovery digest can close the
remaining P0-1C boundary.
