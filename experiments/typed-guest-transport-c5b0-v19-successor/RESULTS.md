# Results

## Decision

`PASSED` for the exact no-run packet and `BLOCKED` for an executable successor.

The packet binds the selected v19 lineage, governed workload, five role contracts, no-run profile,
no-run plan, and three fresh typed frames. Its independent verifier checks the retained C5a inputs,
closed key sets, contract references, fixed source and SourceManifest known answers, all frame
offsets/bindings/digests/trailer fields, null executable boundary, no-effect assertions, and the
closed archive inventory.

Six bounded mutations are refused independently:

1. changed governed source byte;
2. changed frame plan binding;
3. removed profile contract role;
4. asserted an unavailable executable identity;
5. changed a retained C5a baseline byte; and
6. introduced an undeclared archive file.

## Materialized observations

| Object | Result |
| --- | --- |
| Governed `main.mjs` | Exact 103 bytes; SHA-256 `c8e940feb89b342de2d5e6bd13c413226676de9a539fce34c4107516e635b475` |
| SourceManifest | Exact 89 bytes; SHA-256 `712b1bd9739e4f6b0b027600207cbb08fb21b159a57bd34a15cf0ff8f32661b0` |
| Input | Exact 36 bytes; SHA-256 `9de0c909cfb111bd99c3b0b5f7a10972894270c2867022a71b6b6f3c0cd1af6e` |
| Expected completion | Exact 35 bytes; SHA-256 `bb7234ee486b0fbccc2091859ec93499e6a14ea7d6e091cdef60a0e2a6e8371c` |
| Runner/root/init/launcher/controller | Exact non-executable contract bytes and identities retained in the profile |
| Plan/profile/frames | Exact fresh packet bytes and identities retained in the archive manifest |
| Runtime/VM/guest effects | None |

The generated source frame is 255 bytes because it retains the selected trailing LF. It is a v1
C5a-layout successor, not the 254-byte passive known-answer frame whose payload deliberately has no
trailing LF. Input and completion reuse the exact governed known-answer payloads while receiving
fresh plan/profile bindings.

## Exact blocker

The unpublished v10-v27 archive is unavailable. Consequently, the v19 profile, signed runner, raw
root, and controller are opaque historical digests, and separate v19 init/launcher identities are
not retained. This task did not construct replacement executable bytes. The successor executable
runner, root, init, launcher, and controller fields therefore remain explicitly null in
`manifests/artifact-boundary.json`.

The packet must not be shortened to “C5b0 executable successor passed.” Its precise claim is that
the reproducible construction boundary and future typed frame bindings are now fixed. A later
construction task must produce fresh executable identities from retained sources and verify them
without relying on the lost archive. Only after that closure may the owner authorize C5b execution.

## Limitations

- No executable identity was observed, built, signed, loaded, or run.
- No endpoint, descriptor, runtime, backend, HVF context, VM, guest, store, or product consumer was
  created.
- No evidence here reclassifies v19's diagnostic console path as typed transport.
- The packet supplies no runtime/profile admission, installed composition, teardown, process-tree
  absence, or hostile-source evidence.
- The copied C5a inputs are conformance references, not product dependencies.
