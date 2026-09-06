# Governed `deno_core` C2A passive execution profile

Date: 2026-08-04

Work item: C2A passive execution-profile preparation

Status: `PASSED`

Scope: exact passive machine, descriptor, runner, kernel/init, governed-libkrun, transport,
teardown, restoration, and C2B evidence contract only

Evidence: exact JSON fixture and schema plus independent Go and Node known-answer validators

Remaining work: build and identify every final runnable artifact, close the launcher-child and
scratch-limit contracts, then run the complete C2B matrix under separate authorization

Next action: request separate authorization for C2B only after every refusing field below closes

Parent governed-runtime status: `IN_PROGRESS — TRENDING_GOOD`

C2B and runtime/profile admission: `BLOCKED`

Control evidence: `RUNTIME-001` and `VMM-001` remain `unsupported`

## Scope and result

C2A freezes the exact profile that must exist before any owned disposable development guest may
run. Its executable fixture is
[`passive-execution-profile.json`](../../schemas/conformance/c2a-governed-deno-core/passive-execution-profile.json),
26,850 bytes with SHA-256
`d4ce88888186266f5d251e6246c889b1fd46d7746bb0ba56bcc4b3ce4675992f`. The fixture consumes the
9,289-byte C1 fixture at SHA-256
`d5d75e638a15be6c9f4a3230d17309d085f6ec103a73b64d9e0fd656a5423c9e` as an exact-byte,
read-only input. C2A does not change C1 bytes or semantics.

The C1 plan binding is explicit: object type `capsule.execution-plan`, version 0, media type
`application/capsule.execution-plan+cbor;v=0`, source profile `capsule.mjs-source/v0`, canonical
inline JSON v0, and the four required digest roles `runtimeBundleDigest`, `profileRegistryDigest`,
`backendValidationDigest`, and `backendConfigurationDigest`. The selected composed runtime-profile
identity and digest remain null. They cannot be inferred from the machine/transport candidates and
are a separate refusal blocker.

This slice is passive and refusing. It creates no process, runtime adapter, backend consumer,
descriptor, VM, guest, credential, signature, release, or admission state and executes no source.
`PASSED` therefore applies only to the preparation contract and its independent validation. It is
not execution, isolation, runtime-surface, backend, transport, teardown, or product-admission
evidence.

## Governed source and final artifact closure

C2A binds the C1 Deno head `9adb0b68b55bca81644827f1e7749a3acb091bed`, `rusty_v8` head
`80e863ddb942a4aa2b384e794fc23e35b9d2bb15`, runtime binary
`56d3acefd2cc2f5136a0b8143c47131e49a58fbf66382dfd3e84f715ce8e2898`, snapshot
`4e8965217d5a6675a880326eee6f690bbeec7e7cb243decf2f3e9f453a871a2c`, two-file bundle
`0cc08f93e82fcfe68b033e8807975a3bd67068a817da811a87a73aedc3f23937`, and root
manifest/tar/gzip identities from C1.

The governed libkrun source candidate is upstream `728df8125077d0db44265f6e997c72b81b65c015`, governed
base `4ea8d1de861ed1c0636fc800b6da8fb71a086aa5`, follow-up head
`8a2c91943793668f31a1cf7af431933be935bb58`, and merge
`cf0333cdba478cc34a8570a65b38412da7fd3ecc`. The unchanged five-patch aggregate is
`d19fd0ff159c699acccda2621519de45a09408bf3847b418ac34e02b79e805d5`; its raw-root FD and console
patches are `48cdbc307b3fa1209fa0ec68fc3f817634af312983d68f0de259db86c0b43333` and
`584ce48548fe969684fe3c55e57fbf56e7dae40af28c241c24c47b138faf1283`. These are governed source
identities, not final runnable artifact admission. C2A also records libkrunfw 5.5.0 archive
`5bfae6efee63dbdf04a8fac2a69d772d9f900af2f54c4429b4acdfd6d86b9979`, Linux 6.12.91
`kernel.c` input `96561a4e5dccec0364a28ac32c5668e13e31180d083f412c9f8be7599380c70d`, and imago 0.2.3
positional I/O as provenance inputs only.

The following required final identities are unresolved and remain null: host runner, governed
libkrun dynamic library, libkrunfw dynamic library, runnable firmware bytes, runnable guest-kernel
image, trusted init, trusted launcher, final no-journal raw runtime root, and composed governed
runtime-bundle manifest. The profile refuses until all nine have final SHA-256 values and are
revalidated together. Historical experiment runner, libkrun, libkrunfw, root, and launcher-source
hashes are recorded explicitly as non-reusable evidence; they cannot fill these fields.

## Exact host-runner descriptors

The Supervisor creates every parent endpoint with `O_CLOEXEC`, validates its identity and open
file description, and uses fixed spawn file actions to place only these descriptors in the runner:

| FD | Role | Access | Producer → consumer | Lifetime |
| ---: | --- | --- | --- | --- |
| 0 | runner stdin `/dev/null` | `O_RDONLY` | Supervisor → runner | runner |
| 1 | runner stdout | `O_WRONLY` | runner → continuous Supervisor drain | runner |
| 2 | runner stderr | `O_WRONLY` | runner → continuous Supervisor drain | runner |
| 3 | record-before-start control | `O_RDONLY` | Supervisor one-byte `G` writer → runner | closes after authorization and before VM start |
| 4 | finalized unlinked mode-0400 runtime root | `O_RDONLY` | Supervisor custody → governed root-FD API | caller copy closes after owned `F_DUPFD_CLOEXEC` duplicate |
| 5 | registered-source console input | `O_RDONLY` | Supervisor writer → guest reader | runner or governed duplicate |
| 6 | approved-input console input | `O_RDONLY` | Supervisor writer → guest reader | runner or governed duplicate |
| 7 | completion console output | `O_WRONLY` | trusted launcher → Supervisor cap+1 drain | runner or governed duplicate |

`dup2` at exec is the only time the selected child copies lose `CLOEXEC`. The runner enumerates
exactly FDs 0 through 7 before any libkrun call and closes everything from 8 upward. Missing,
extra, swapped, closed-and-reused, aliased, wrong-mode, wrong-role, or status-flag/offset-sharing
descriptors refuse before VM start. Approval, evidence, and installation keys; stores; Mach/XPC
services; network sockets; databases; logs; temporary files; writable root aliases; and live host
paths are forbidden extras.

The governed multiport calls are fixed: port 0 `capsule.source` uses input FD 5 and no output,
port 1 `capsule.input` uses input FD 6 and no output, and port 2 `capsule.completion` uses no input
and output FD 7. Their expected guest nodes are `/dev/hvc0`, `/dev/vport0p1`, and
`/dev/vport0p2`. The implicit console must be disabled and C2B must prove the exact inventory.

## Guest-launcher descriptor boundary

Before it creates a child, the trusted launcher owns only FDs 0 through 5: null stdin, null stdout,
null stderr, registered source, approved input, and completion. It closes from 6 upward. The
completion endpoint is never inherited by the workload. The post-verification workload child
manifest remains null because the trusted launcher implementation and its exact child protocol do
not yet exist. That missing contract is a hard refusal, not a license to infer argv, environment,
working directory, paths, or descriptor assignments.

## Bounded development machine and transport

The single candidate is arm64 libkrun/HVF with one vCPU, 256 MiB guest RAM, 1,000 ms wall time,
and concurrency one. Those values are the narrowest retained development candidates; C2B still has
to prove their exact enforcement in composition. CPU-time enforcement, host/VMM memory enforcement,
and the byte ceiling for memory-only guest scratch are unsupported, remain null, and make the
profile inactive. An unknown, different, unavailable, approximated, defaulted, or clamped value
refuses the attempt.

Source and canonical input each allow 262,144 payload bytes, a 152-byte header, and 262,296
physical bytes. Completion allows 262,144 JSON bytes, a 160-byte header, a 64-byte commit trailer,
and 262,368 physical bytes. The Supervisor retains through cap+1, 262,369 bytes, continuously
drains all further bytes, and refuses oversize output. EOF is not commit. Runner stdout and stderr
each retain a 4,096-byte prefix, use a 32,768-byte drain buffer, and preserve the observed 4,194
maximum capture-file bound per stream. Plan values may narrow these maxima only if the selected
value is enforced exactly; post-approval clamping is forbidden.

## Teardown and success

Wall action begins at 1,000 ms and cancellation acts immediately, independently of guest
cooperation and drains. A 200 ms best-effort grace exists but is unsupported as a success claim.
Forced teardown is `SIGKILL`; C2B must prove authoritative absence within the selected 1,000 ms
forced-absence deadline and 1,200 ms maximum from initial action. Before signaling, the Supervisor
must match PID, start time, uid/gid, executable path, code identifier, Team ID, cdhash, and code
requirement. Identity mismatch remains unresolved: it does not signal an unverified process and
cannot produce success.

The trusted launcher must wait for and prove the complete child tree absent before writing the
completion commit. Ordinary success requires source, input, and runtime integrity; a valid bounded
completion committed last; terminal runner lifecycle; child-tree absence; authoritative runner
absence; and no required cleanup. Runner exit, zero exit, EOF, guest prose, or a pre-teardown
completion never establishes workload success alone.

## Fixed benign known answer

The only C2B workload is the following 103-byte `main.mjs`:

```js
globalThis.capsuleMain = function (input) { return {doubled: input.value * 2, echo: input.message}; };
```

Its SHA-256 is `c8e940feb89b342de2d5e6bd13c413226676de9a539fce34c4107516e635b475`.
The deterministic-CBOR single-member SourceManifest is 89 bytes at
`712b1bd9739e4f6b0b027600207cbb08fb21b159a57bd34a15cf0ff8f32661b0`. The 36-byte canonical
input `{"message":"capsule-c2a","value":21}` has SHA-256
`9de0c909cfb111bd99c3b0b5f7a10972894270c2867022a71b6b6f3c0cd1af6e`. The only expected result
JSON is the 35-byte `{"doubled":42,"echo":"capsule-c2a"}` at
`bb7234ee486b0fbccc2091859ec93499e6a14ea7d6e091cdef60a0e2a6e8371c`, carried in a succeeded
completion whose commit is last.

## Complete C2B matrix

The fixture names 91 exact cases in eleven groups. C2B must run all of them against the final
composition and retain individual dispositions:

| Group | Cases | Required boundary |
| --- | ---: | --- |
| preflight and identities | 5 | exact C1, every final artifact, source ancestry/patches, inactive admission, concurrency refusal |
| runner descriptors | 10 | exact 0–7 manifest, missing/extra/wrong/swapped/reused/CLOEXEC/open-description/ambient/control faults |
| root custody and device | 8 | finalized unlinked read-only identity, both consumers, guest digest, alias/path/journal/crash mutations |
| runtime surface | 7 | exact globals, three ops, zero extensions, one module, V8 flags, restoration negatives, known answer |
| no-loader V6 | 8 | static/export/dynamic/import-meta/specifier/restoration/fallback refusal |
| file-open and syscall traces | 8 | closed runner/launcher/runtime open sets and no exec/fork/socket/native-loader/unexpected device access |
| real P0-3 transport | 12 | all 43 vectors, C1 cap boundaries, cap+1 and 4× drain, chunk/fault/stall/reset/cancel/commit/workload-ownership cases |
| launcher and child tree | 8 | verify-before-child, fixed child state, completion custody, source/input faults, bounded result, death and descendant cleanup |
| death, cancel, and teardown | 12 | runner/guest death, pre/post-commit death, timeout/cancel/blocking, forced absence, Supervisor recovery, identity mismatch |
| device, network, restoration | 6 | exact device/mount inventory, no NullFs/virtiofs/network/vsock, read-only root, no cross-attempt state, all mutations |
| evidence and classification | 7 | complete manifest, distinct dispositions, byte/trace/drain/mutation evidence, guest-report limitation, no admission claim |

The 18 mandatory restoration mutations reintroduce ops/extensions/loaders/globals/string code
generation; pathname or writable-root authority; NullFs/virtiofs; network/vsock; external
kernel/firmware paths; invalid port bounds and console lifecycle; descriptor faults; workload
completion custody; early commit; EOF/runner-zero success; resource clamping; weakened forced
teardown; excess concurrency; and null or historical artifact substitution. Every mutation must be
caught by its named control.

## Evidence retention and blockers

C2B must retain exact C1/C2A bytes; source/patch/build/artifact manifests; installed code identity;
host and guest FD manifests with `fcntl` and object-identity observations; file-open/syscall/device/
mount/network/process-tree traces; all transport bytes and accounting; globals/ops/modules/loader
results; teardown and recovery timelines; every restoration command/result; and separate input,
runtime, runner, completion, and teardown dispositions. Guest-reported completion is evidence, not
attestation.

C2B is `BLOCKED` on the nine final artifact identities, composed runtime-profile identity and
digest, trusted-launcher child contract, exact
bounded scratch mechanism, governed libkrun baseline/verifier invariant and independent review,
P0-1C/P0-2/P0-3 real transport/P0-4B closure, and separate explicit authorization to create an
owned disposable guest. The owners are the governed runtime/libkrun construction and review
slices, the launcher protocol slice, and the orchestrator/user who can explicitly authorize the
controlled C2B guest experiment. No unreviewed download or historical substitute may unblock it.

Work stops if progress would require changing C1, restoring a prohibited runtime surface,
accepting execute-time paths or replacement plan/backend/image/mount data, inventing artifact
bytes, clamping resources, equating runner exit with committed completion, or creating a guest or
using credentials without separate authorization. Even a passing C2B result would leave runtime/
profile admission `BLOCKED` and `RUNTIME-001`/`VMM-001` unsupported until the later admission and
installed-evidence gates close.
