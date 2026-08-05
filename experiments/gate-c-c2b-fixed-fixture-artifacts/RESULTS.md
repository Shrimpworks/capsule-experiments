# Results

## Decision

`PASSED-FIXED-FIXTURE-NON-GUEST-BUILD-ONLY`

This is a positive answer only to the narrow question: can the exact committed
Shrimpworks Deno fork source construct a deterministic Linux/arm64 runtime that
accepts only the retained C1/C2A benign fixture and produces its exact retained
completion? It is not an answer to C2B guest execution, composed-profile
delivery, runtime selection/admission, `RUNTIME-001`, or `VMM-001`.

## Exact inputs

- Deno governed base: `ea18b9dc21ff8ebd19347be7095f47937ee14ec2`
- Deno fixed-fixture commit: `da10f70f0bbb83e0c2b45df50761c557e1e6f43f`
- Deno tree: `d06b5d1a0a6b863c73ac24a9e21e32060865f279`
- Deno source archive: `6f04adbc2fc8c698f81e1606f5c2b4185b7288a4cc13ab6e70f1d58d9136b786`
- Immutable build-only binding: `41350bcfc854338ded5e62f77475daf86486351356104dbbf647a8f8b5f11946`
- C1 fixture: `d5d75e638a15be6c9f4a3230d17309d085f6ec103a73b64d9e0fd656a5423c9e`
- C2A fixture: `d4ce88888186266f5d251e6246c889b1fd46d7746bb0ba56bcc4b3ce4675992f`
- Cargo lock: `4dd8f08c8b223adbf3468fce5fe9e0468dfe9f4a255129cc304cb604fa0d389d`
- Cargo source closure: `1e96e49a516e4cf6a9ec79acae9a9eb3d0ee52b332695fa11476a97e1e50d1d4`
- Rusty V8 commit: `80e863ddb942a4aa2b384e794fc23e35b9d2bb15`
- Rusty V8 archive: `1ae209c9e4ba5803d010d2c79ee4cc0af0126c5a7ebcca211c7e41deaede4cd2`
- Rusty V8 binding: `8603f09ab95e79620ea29f73933c09ae3618c6f924472c0ce36d5c614d1ceba4`
- Builder: `rust:1.95.0-bookworm@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1`

The Deno fork commit is a new source identity. Neither Rusty V8 nor libkrun
source changed.

## Exact outputs

| Material | Bytes | SHA-256 | Build A/B |
| --- | ---: | --- | --- |
| Runtime binary | 68,496,520 | `e781a90236cdf1272a9a16189c6be033164fa25a5aa9e52376ef998982ec0a77` | byte-equal |
| Snapshot | 699,988 | `4e8965217d5a6675a880326eee6f690bbeec7e7cb243decf2f3e9f453a871a2c` | byte-equal |
| Two-file bundle | 20,981,992 | `ad908b8289c86f25c3413713fa3e60c4c8bb91fec0d52763e870d7a186865ee6` | byte-equal |

The runtime-build evidence manifest has self-digest
`6a673b88dc99e8939bc46ec88fb4f869caf7a9ff5909aa445e62afc5a3a83f87`.
It deliberately does not stand in for the canonical composed profile.

## Method and verification

Two task-owned stages were created only when their target paths were absent.
Each cloned the exact real-fork commit, generated a deterministic source
archive, and independently acquired the same 189-package Cargo closure during
a connected acquisition phase. The decisive phases used empty `target` and
`out` paths, a digest-pinned builder, one logical CPU, ASLR-disabled Cargo
descendants, no compiler object cache, and Docker `--network none`.

Observed checks:

- exact generator readback against unchanged C1/C2A bytes;
- exact fixed known answer `{"doubled":42,"echo":"capsule-c2a"}`;
- 22 missing/wrong/substituted/media/digest/length/cap/loader/restoration
  mutations refused before evaluation;
- caller argv, environment, and FD 3 refused before evaluation;
- socket, clone, execve, and executable-mapping restoration probes denied with
  `EPERM` after the host seal;
- exact three-op final-link registry and ELF audit;
- binary, snapshot, bundle, manifest, completion, refusal output, final-link
  proof, environment metadata, Deno source archive, Cargo lock, and Cargo source
  closure byte-equal across A/B;
- CycloneDX, source/notice closure, and unsigned in-toto provenance retained.

## Limitations

- Same Apple Silicon Docker Desktop/LinuxKit host; no independent builder.
- Linux/arm64 construction ran through Docker platform emulation.
- Cargo compiler output was observed in the controlled terminal; the retained
  evidence contains exact commands, final build metadata, static/link audits,
  mutation outputs, and all output identities rather than disposable target
  caches or a duplicate full compiler transcript.
- No raw root, trusted init/launcher, libkrun composition, host runner, or
  composed profile is claimed before canonical reconciliation.
- No VM, HVF, libkrun guest, signing, publication, installation, service,
  arbitrary workload, runtime selection, or admission occurred.

Confidence is high for the same-host deterministic fixed-fixture runtime build
and its tested refusal surface, and intentionally absent for guest behavior or
product admission.
