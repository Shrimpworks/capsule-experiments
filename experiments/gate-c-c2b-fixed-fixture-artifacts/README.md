# Gate C C2B fixed-fixture artifact construction

Status: controlled non-guest development-candidate construction only.

This experiment consumes exact committed source from the owned `Shrimpworks`
forks and constructs the bounded fixed-fixture artifact candidate requested by
C2A. It does not launch libkrun, HVF, a VM, or a guest. It does not admit a
runtime, select a product profile, sign or publish a release, install a service,
or accept arbitrary JavaScript.

The runtime binding is the build-only immutable Deno-fork supplement
`capsule.governed-deno-core.c2b-fixed-fixture/c1-c2a-v1`, binding SHA-256
`41350bcfc854338ded5e62f77475daf86486351356104dbbf647a8f8b5f11946`.
It preserves the existing C1 and C2A bytes and identities unchanged. Canonical
binding reconciliation remains reserved for a separate `capsule-corp` PR before
composed-profile delivery or any guest use.

The decisive runtime builds use two separate fresh stages, independently
prefetched Cargo closures, empty target/output directories, and network-disabled
Linux/arm64 compilation and fixed-fixture checks. The exact governed
`rusty_v8` archive is an unchanged digest-pinned input; this experiment does not
alter `rusty_v8` or `libkrun` source.

`RUNTIME-001` and `VMM-001` remain unsupported, and C2B remains blocked.

## Observed result

The Deno source change is retained in draft PR
[`Shrimpworks/deno#2`](https://github.com/Shrimpworks/deno/pull/2) at commit
`da10f70f0bbb83e0c2b45df50761c557e1e6f43f` and tree
`d06b5d1a0a6b863c73ac24a9e21e32060865f279`. Two independently acquired,
empty-state, network-disabled builds were byte-equal without output
normalization.

| Runtime material | Bytes | SHA-256 |
| --- | ---: | --- |
| Fixed-fixture binary | 68,496,520 | `e781a90236cdf1272a9a16189c6be033164fa25a5aa9e52376ef998982ec0a77` |
| Snapshot | 699,988 | `4e8965217d5a6675a880326eee6f690bbeec7e7cb243decf2f3e9f453a871a2c` |
| Deterministic two-file bundle | 20,981,992 | `ad908b8289c86f25c3413713fa3e60c4c8bb91fec0d52763e870d7a186865ee6` |

The non-canonical runtime-build evidence manifest self-digest is
`6a673b88dc99e8939bc46ec88fb4f869caf7a9ff5909aa445e62afc5a3a83f87`.
It is evidence identity only and is not a composed runtime-profile identity.

The fixed known answer passed, all 22 fixture/authority mutations were refused
before evaluation, caller argument/environment/extra-descriptor injection was
refused, four sealed syscall restoration probes returned `EPERM`, and the final
link retained exactly the three governed built-in ops.

## Gate boundary

This result closes the localized Deno fixed-fixture runtime build only. The raw
root, init, launcher, libkrun artifact composition, host runner, and composed
profile are intentionally not produced or claimed here. Before those can be
delivered, a separate user-visible `capsule-corp` PR must define and validate
the passive immutable supplement in the canonical versioned object model.

See [RESULTS.md](RESULTS.md), [HANDOFF.md](HANDOFF.md), and the retained
[`evidence/2026-08-04/`](evidence/2026-08-04/) directory.

## Verification

```sh
node experiments/gate-c-c2b-fixed-fixture-artifacts/scripts/verify.mjs \
  DENO_CHECKOUT CAPSULE_CORP_CHECKOUT \
  /private/tmp/capsule-c2b-fixed-fixture-runtime-a \
  /private/tmp/capsule-c2b-fixed-fixture-runtime-b
```
