# C2 final governed-artifact handoff

Decision: `BLOCKED`

Confidence: high for the static incompatibility and exact retained identities; no claim is made
about guest behavior, independent reproducibility, installed identity, or runtime admission.

## Exact source refs

| Repository | Governed identity |
| --- | --- |
| `Shrimpworks/capsule-experiments` | evidence merge `fa03d7043b4f0653081d6c5733d597f49f6efd1c`, tree `f80775335232ff4750f62998e5cc4d8e120ce90e` |
| `Shrimpworks/capsule-corp` | reviewed main `bf8a93b2eebad069400e7291bbf6d7af1a43f305` |
| `Shrimpworks/deno` | governed head `9adb0b68b55bca81644827f1e7749a3acb091bed`, tree `72edd0f7b5f83b918945860653714e344c8a303f`, merge `ea18b9dc21ff8ebd19347be7095f47937ee14ec2` |
| `Shrimpworks/rusty_v8` | governed head `80e863ddb942a4aa2b384e794fc23e35b9d2bb15`, tree `d8950a7a1ee907761720b23d24eaa9b63aa33b10`, merge `cbf56de2e1156b1cf1561fdbaea7172a0aa056f4` |
| `Shrimpworks/libkrun` | governed head `8a2c91943793668f31a1cf7af431933be935bb58`, tree `ffa4131ddcc6ec66edd623381dae94189ccd3fee`, merge `cf0333cdba478cc34a8570a65b38412da7fd3ecc` |
| `libkrunfw` | tag `v5.5.0`, commit `ec4b297964877d83432f9ccda6dad8ff6e9de3e4`, archive SHA-256 `5bfae6efee63dbdf04a8fac2a69d772d9f900af2f54c4429b4acdfd6d86b9979` |
| Linux | `6.12.91`, source SHA-256 `0ff2ab9e169f9f1948557471fbb450d3018f8c5b77caf288e1a3982582597969` |

The libkrun `capsule/upstream-v1.19.4` branch tip has moved from the patch-queue's retained base.
The exact base commit still exists and the five-patch reconstruction matches it; the movable-tip
drift is retained as a limitation and was not normalized.

## Artifact identities

Every required final identity and the composed profile digest are null. See
`manifests/blocked-construction.json` for the machine-readable result.

## C2B-only matrix

All 91 C2B cases remain not run. In particular, no cases in these groups were executed:

1. preflight and identities;
2. runner descriptors;
3. root custody and device;
4. runtime surface;
5. no-loader V6;
6. file-open and syscall traces;
7. real P0-3 transport;
8. launcher and child tree;
9. death, cancel, and teardown;
10. device, network, and restoration; and
11. evidence and classification.

Static source/ref/digest checks performed here are construction evidence only and do not satisfy a
same-named C2B guest case.

## Exact next owned-runtime request

> Authorize a separate, defensive governed-runtime construction task in the Shrimpworks-owned
> `deno`, `rusty_v8`, `capsule-experiments`, and `capsule-corp` repositories to create a new
> digest-pinned Linux/arm64 runtime release candidate whose only accepted workload is the exact
> C2A 103-byte source at SHA-256
> `c8e940feb89b342de2d5e6bd13c413226676de9a539fce34c4107516e635b475` and exact 36-byte input at
> SHA-256 `9de0c909cfb111bd99c3b0b5f7a10972894270c2867022a71b6b6f3c0cd1af6e`, preserving the existing
> three-op/no-loader/fixed-snapshot closure. Permit build-time and static self-tests only; do not
> authorize a VM, HVF/libkrun guest, arbitrary workload, signing, publication, installation, or
> runtime admission. Require a new candidate self-digest, full source/provenance/SBOM/license
> closure, exact mutation results, and updated passive C1/C2A bindings.

Only after that candidate and all nine final C2 artifact identities exist should the owner consider
this distinct request:

> Authorize one separately scoped C2B experiment using only Shrimpworks-owned, disposable guest
> resources and the exact composed development profile digest produced by a passed C2 construction
> task. Permit only the fixed C2A known-answer workload and all 91 retained C2B cases. Do not permit
> arbitrary/user workloads, credentials, signing/notarization, release publication, installation,
> service creation, runtime/profile admission, or unrelated system, identity, or data access.
