# Governed `deno_core` physical-omission experiment

Status: **PHYSICAL-OMISSION-PASS; NO RUNTIME ADMISSION** on 2026-08-02.

This development-only experiment defensively tests one narrow `RUNTIME-001` construction question:
can exact `deno_core` 0.409.0 omit nonessential built-in ops before registration with a small,
reviewable patch while preserving Capsule's fixed dependency-free JavaScript fixture and unchanged
prohibited-power contract?

For the exact construction, the answer is yes. A one-file upstream patch reduces the central
built-in registry from 99 ops to three bootstrap-required ops. Two ASLR-controlled clean builds
produce identical custom snapshots and binaries, the runtime observes only the three ops, and the
final binary exposes only their three built-in op symbols. See [RESULTS.md](RESULTS.md).

This is not a runtime/backend selection, hostile-code boundary, TypeScript implementation,
continuous-integrity claim, or production code. `RUNTIME-001` remains unsupported and execution
requiring it must continue to refuse.

## Authorized scope

The experiment is confined to this repository, the exact public Deno identities retained by the
prior Deno experiment, fixed benign Capsule fixtures, controlled local processes, and the owned
isolated Linux/arm64 development container. Do not use it for arbitrary workloads, other systems,
identities, credentials, user data, backends, guests, or deployments.

## Layout

- `PHASE_A.md` and `review-phase-a.sh`: pre-mutation inventory, lower bound, and stop rule.
- `patches/`: the physical allowlist patch, deterministic sidecar-order patch, and one deliberate
  `op_print` restoration mutation.
- `fixtures/`: byte-identical copies of the exact retained benign Capsule fixtures plus two fixed
  refusal mutations; the probe refuses every source/input byte sequence outside its embedded
  allowlist.
- `probe/`: non-production snapshot builder, fixed-fixture wrapper, and Linux/arm64 point-in-time seal.
- `scripts/`: exact-input checks, preparation, two-build reproduction, fixed probes, and syscall
  trace verification.
- `evidence/2026-08-02/`: bounded retained identities, observations, hashes, and verification.

The probe embeds exact fixed fixtures copied byte-for-byte from
`../gate-c-deno-runtime-authority/fixtures/`; two additional fixed files test source/input refusal.
Their identities are retained in the evidence.
Generated `.work/` source and Cargo targets are ignored. Product packages must not import this
experiment.

## Exact identities

- Deno v2.9.4 tag commit `14eea3160ae5834476aa3b9d317b8d41d991b982`.
- Deno source archive SHA-256
  `95f9d8361809f2d2f3ee2d8a6955951dcf96c2f4bbeb540c2d6fdd9363e6dc94`.
- `deno_core` 0.409.0 crate SHA-256
  `16b44f6f84139c39ec2f8d1b838412eb84ecaa9837103f7b12169896fd8778b4`.
- `v8` 150.2.0 crate SHA-256
  `c7f4e905df70d6c00b95e69c5f0831fd5eb5889b0116ae2b30293578c19cd1bc`.
- Linux/arm64 `rusty_v8` archive SHA-256
  `8d91df74c8a671c23f880e64038023f49e07ca85c96e15d76a87e2aac9b20595`.
- Owned local build-image ID
  `sha256:b8483b5baafc8f085feb4a48ef34993b182de50d86ed03fd13b98b166e7a0ad6`.

The local image has no repository digest and is therefore retained evidence for the owned
development environment, not an independently reconstructible or admissible builder.

## Reproduce

The scripts never fetch or dynamically select inputs. Supply the exact local files and a local
read-only Cargo registry containing the locked packages:

```sh
experiment=./experiments/gate-c-deno-core-physical-omission

"$experiment/scripts/prepare-source.sh" \
  /path/to/deno_core-0.409.0.crate \
  /path/to/deno-v2.9.4-source.tar.gz \
  /path/to/librusty_v8-arm64.a.gz

"$experiment/scripts/build-twice.sh" \
  /path/to/librusty_v8-arm64.a.gz \
  /path/to/cargo/registry \
  /tmp/capsule-deno-build-a \
  /tmp/capsule-deno-build-b

"$experiment/scripts/verify-runtime.sh" \
  /tmp/capsule-deno-build-a/release/capsule-deno-core-physical-omission

mkdir -p /tmp/capsule-deno-evidence
"$experiment/scripts/trace-seal.sh" \
  /tmp/capsule-deno-build-a/release/capsule-deno-core-physical-omission \
  /tmp/capsule-deno-evidence/nominal.strace
```

`build-twice.sh` deliberately uses `/usr/bin/setarch aarch64 -R` and therefore relaxes the
container's default Docker seccomp profile for the build process only. Network remains absent, the
root is read-only, capabilities are dropped, no-new-privileges is set, the exact V8 archive and
Cargo registry are local mounts, and Cargo runs locked/offline with one job. Phase B also found
that upstream drained a randomized module map directly into the snapshot sidecar; the three-line
second patch sorts that existing vector by module name before serialization without changing the
format. The initial nondeterministic builds are retained rather than hidden.

To reproduce the native-op restoration test, apply
`patches/mutations/restore-op-print.patch` to a separately prepared patched source, build a
separate binary, and pass it as the optional second argument to `verify-runtime.sh`. The fixed
registry assertion must reject the four-op binary before the fixture runs.
