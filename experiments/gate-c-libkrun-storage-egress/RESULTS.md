# Gate C libkrun storage and egress results

Date: 2026-07-31

Decision: **conditional pass for a development-only raw-block staging profile; no production or
`validated-local` posture change.**

The exact libkrun/HVF runner attached separate raw read-only root, source, and input devices plus a
12 MiB per-attempt raw writable scratch/output device. Guest writes to source and input failed with
`EROFS`; the scratch filesystem reached `ENOSPC`; post-stop extraction accepted one bounded regular
file and rejected an over-limit file, a hard-linked declared file, a sparse declared file, and an
injected character device. Fresh disks, one-use attempt directories, exact runner crash/timeout
cleanup, and an App Sandbox allow/deny pair passed.

This is not a complete safe extractor or immutable-custody implementation. A live same-user host
write changed a source backing file while its read-only guest device was active. The spike detected
the post-stop digest mismatch, but detection after guest read is not prevention of execution on
changed bytes. The shell/`debugfs` collector is deliberately disposable test tooling, not trusted
product code, and Docker Desktop retained file-sharing descriptors after its containers exited.
Those conditions keep the decision conditional.

## Hypothesis and threat

Hypothesis: libkrun's raw-only block API can provide fixed device topology and physical scratch
bounds without virtiofs, live host directories, image probing, or guest ambient host access, while
a separate post-stop parser gate can prevent hostile filesystem objects from becoming artifacts.

Threats exercised: mutation of approved input bytes, guest writes to read-only devices, disk/output
exhaustion, sparse logical-size abuse, links and special files, hostile names and metadata, partial
output release, runner crash/timeout, disk reuse, cross-attempt state leakage, missing App Sandbox
path authority, and test-parser overreach.

## Exact environment and inputs

| Item | Observed value |
| --- | --- |
| Repository revision | `1f9f55bf2c7cc25b936dc9e2ceb343113f398c3c` (dirty worktree; this experiment uncommitted) |
| Host | MacBookPro18,4, arm64 |
| macOS | 26.5.2 (25F84), Darwin 25.5.0 |
| Hypervisor support | `kern.hv_support=1` |
| Xcode / clang | Xcode 26.6 (17F113), Apple clang 21.0.0 |
| Rust / Go / LLD | Rust 1.93.1, Go 1.26.5, LLD 22.1.8 |
| Docker | client/server 29.6.1 |
| libkrun | 1.19.4 at `728df8125077d0db44265f6e997c72b81b65c015`, with the two patches retained by the parent spike |
| libkrunfw/kernel | libkrunfw 5.5.0 / Linux 6.12.91 |
| Root fixture | Alpine `sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce` |
| ext4 build/parser fixture | Ubuntu `sha256:0e0a0fc6d18feda9db1590da249ac93e8d5abfea8f4c3c0c849ce512b5ef8982` |
| Signing | Developer ID Application, Team ID `3DDR84M4JS`, hardened runtime |

Final generated evidence-point hashes (ignored artifacts are reproducible from retained scripts):

| Artifact | SHA-256 |
| --- | --- |
| signed runner | `f14b6366bd341345aebe0b63457696acd705356ac10beb34976f9fa159ca2e7e` |
| signed libkrun copy | `7d07681b2a56e18b3ef4caba12ec27bc5846f086fdec517680a26094a0d11d99` |
| signed libkrunfw copy | `538a0be2078f99b36fd874838c183dc2fc4f9df4e3a0d065f431295e4dbe2d1d` |
| guest storage probe | `4164090de431574d70c66721fadec66c37a6533388aed066ad6012d1563c9dad` |
| root raw disk | `5f82fff76ad267020e1b219b7bf70fe60fd3500290de539d7b8f31615f2988d0` |
| source raw disk | `c6a4ad211dea184f3c2facecc2b457772a4694352fd4673f7ed5241875c156ce` |
| input raw disk | `30c27e69e79d6ee777e920fc9a07d05976271090da732872b02787b75f2fe96d` |
| empty scratch template | `4144b4485a40d7532843799a5c6afab93907ead5d99db9367b96dda34168d628` |
| extracted valid artifact | `96b3bd43e7aaf166783b5ebe224a0143799f4162d6829c094ffa2d27f250fba3` |

Signing timestamps and ext4 UUID/time fields make rebuilt Mach-O and raw-disk hashes
non-reproducible even when their pinned source inputs are unchanged. Runtime manifests must bind
the distributed bytes rather than assume these hashes are universal build outputs.

## Architecture exercised

The runner called `krun_add_disk`, not `krun_add_disk2` or `krun_add_disk3`; the selected API fixes
the format to raw and performs no image-format probe. Devices were attached in fixed order:

| Guest device | Content | libkrun access | Guest mount |
| --- | --- | --- | --- |
| `/dev/vda` | runtime/root | read-only | root `ro,nosuid,nodev` |
| `/dev/vdb` | source | read-only | `/capsule/source`, `ro,nodev,nosuid,noexec` |
| `/dev/vdc` | input | read-only | `/capsule/input`, `ro,nodev,nosuid,noexec` |
| `/dev/vdd` | attempt scratch/output | read-write | `/capsule/scratch`, `nodev,nosuid,noexec` |

No virtiofs share, host directory, network device, host socket, or implicit vsock was configured.
The parent libkrun build enables only `BLK=1`.

The guest storage program modeled a trusted launcher. Its root parent mounted the fixed devices,
set `no_new_privs`, launched exactly one child as UID/GID 65534 with no supplementary groups, waited,
synced, and unmounted all three data filesystems before VM exit. The child reported zero effective
capabilities. The harness refused extraction without both a mode-specific child completion record
and `PROBE_STORAGE_UNMOUNTED`; runner exit status alone was insufficient because an early iteration
observed host status 0 after the child failed.

The post-stop test collector copied the already bounded raw image to a unique parser inbox, checked
that the original was not open, then ran `e2fsck`/`debugfs` in a Docker container with no network, a
read-only container root, all capabilities dropped, `no-new-privileges`, 32 PIDs, 128 MiB memory,
and 0.5 CPU. It addressed only the fixed `/result/data.json` slot and checked filesystem health,
regular-file type, link count one, logical size, allocated blocks, exact mode/owner, ACL absence,
and extended-attribute absence before copying and hashing. Shell parsing of `debugfs` output is
spike tooling and is not proposed for the Supervisor.

## Commands

The final evidence run used:

```sh
./build-guest-probe.sh
./prepare-fixtures.sh
CAPSULE_SIGNING_IDENTITY='Developer ID Application: Dylan Steele (3DDR84M4JS)' ./build-runner.sh
./run-tests.sh
```

`run-tests.sh` is intentionally non-overwriting. Reproducing from a prior run requires removing
only ignored `.runs/` and generated `.build/` evidence, then rebuilding. It must not be pointed at
product content or a broad host directory.

## Observed evidence

| Case | Observation | Result |
| --- | --- | --- |
| Device topology | Guest sysfs reported `vdb` and `vdc` read-only and `vdd` writable. Source/input payload SHA-256 values matched the host manifest. | Pass |
| Guest mutation | Opening both source and input payloads for truncate/write failed with `EROFS` as UID/GID 65534. Their raw-disk hashes matched before and after all ordinary attempts. | Pass for guest read-only enforcement |
| Pre-start mutation | Flipping one byte in a copied input raw disk changed its hash; preflight rejected it and retained `runnerStarted=false`. | Pass |
| Live host mutation | While a guest held a source device read-only, another same-user host process changed the raw backing file from `c6a4…6ce` to `fd554c…94c` in the retained final run. Post-stop hashing detected the mismatch. | Counterevidence: libkrun read-only is not host immutability |
| Physical quota | Every scratch raw file remained exactly 12,582,912 logical bytes. A sequential guest writer reached `ENOSPC` after 6,672,384 bytes of payload. | Pass for this fixed raw-device bound; host pressure not tested |
| Sparse/oversized write | The guest created a 33,554,432-byte declared output inode with `Blockcount: 0` on the 12 MiB disk. The collector rejected it with exit 72 and released no file. | Pass |
| Bounded output | A 30-byte regular declared output was accepted and hashed. With an 8-byte approved cap the same output was rejected with exit 70; no partial artifact was created. | Pass; rejection, not silent truncation |
| Hard link | The declared regular output had link count 2 after the guest created a second name. The collector rejected it with exit 69. | Pass |
| Symlink | Offline inspection observed a symlink to `/etc/passwd`. It was never followed or copied. | Pass as adversarial observation |
| FIFO/socket | Offline inspection observed FIFO and socket inodes in the output directory. Neither was opened or copied. | Pass as adversarial observation |
| Device | The unprivileged guest received `EPERM` when creating a device. A character-device inode injected directly into a raw fixture as the declared slot was rejected with exit 69. | Pass |
| Names/metadata | ext4 retained `..dotdot`, `%2e%2e`, newline, and bidi filenames; a mode-0777 file retained a user xattr. Fixed slot assignment avoided converting names into host paths. | Observation; complete directory enumeration remains product work |
| Clean stop | Successful cases recorded child completion, explicit filesystem unmount, runner stop, clean read-only `e2fsck`, and then extraction. | Pass |
| Runner crash | After `PROBE_READY_CRASH`, exact runner PID 92882 was killed (`137`), observed absent, and only its named scratch image was deleted after recording its digest. | Pass for tested checkpoint |
| Wall timeout | After the same ready checkpoint and 250 ms delay, exact runner PID 92911 received `SIGTERM` (`143`), was observed absent, and its named scratch image was deleted without extraction. | Pass for tested checkpoint |
| Reuse | A second preparation for the consumed `valid` attempt ID was refused because the attempt directory already existed. | Pass for harness one-use rule |
| Cross-job leakage | Every independent guest case reported `PROBE_FRESH_SCRATCH priorMarker=false` before writing its own marker. | Pass across tested fresh copies |
| App Sandbox allow | The Developer-ID bundle with `app-sandbox`, `hypervisor`, three exact read-only path exceptions, and one exact read-write path exception completed the valid case. | Pass; temporary exception is spike-only |
| App Sandbox deny | The otherwise identical sandboxed bundle without disk exceptions failed in virtio-blk configuration with runner status 125. | Pass |

The PIDs above are evidence from one run, not reusable identities. The parent Gate C design still
requires PID, start time, code identity, executable location, and the durable start handshake for
authoritative lifecycle control.

## Observation versus inference

Observed:

- libkrun exposed the four fixed virtio block devices with the configured guest-visible read-only
  state and no configured virtiofs/network/vsock path;
- guest source/input mutation returned `EROFS`;
- the fixed raw disk produced `ENOSPC` while a sparse inode exceeded its physical image size;
- the exact post-stop cases and exit codes above occurred;
- changed raw backing bytes changed the digest before or after execution;
- the sandbox allow/deny pair differed only by embedded filesystem exceptions;
- after Docker test containers exited, a `com.apple.Virtualization.VirtualMachine` XPC process
  retained read descriptors for the exact source/input fixture paths.

Inferred, not proven:

- the fixed image length is a useful upper bound on guest-allocatable blocks, but it does not prove
  host physical-allocation, APFS free-space, or I/O-latency budgets under pressure;
- the retained XPC descriptors likely came from Docker Desktop file sharing, because Docker was the
  only tested component using Virtualization.framework and bind-mounted the fixture directory. The
  process attribution was not independently proven;
- a dedicated parser sandbox with exact input/output handles can replace the test collector, but
  that product parser and its lifecycle do not exist yet;
- App Sandbox narrows the signed runner's path authority. It does not prove that an unsandboxed
  same-user attacker cannot mutate a backing file in component storage.

## Concrete safe staging and extraction design

1. The Content Broker snapshots only bounded regular-file data-fork bytes. It does not accept a
   caller path, directory, symlink, archive, device, FIFO, socket, resource fork, or xattr contract.
2. The Supervisor resolves fixed logical source/input slots and receives attempt-scoped content
   handles. A reviewed builder creates one raw ext4 source disk and one raw ext4 input disk with a
   closed feature set, fixed ownership/mode, fixed internal paths, and recorded byte length and
   SHA-256. Raw image construction is not performed from guest-controlled filesystem metadata.
3. Before approval consumption becomes a backend side effect, the Supervisor durably records exact
   runtime/source/input hashes, lengths, filesystem profile, scratch-template hash, physical scratch
   length, output limits, parser profile, and attempt ID. A changed object refuses launch.
4. The Supervisor creates a fresh scratch raw file from a reviewed empty template using
   create-exclusive semantics. Its name is Supervisor-generated, its length exactly equals the
   approved scratch limit/profile, and its lifecycle record transitions `prepared -> issued` before
   runner authorization. An issued or consumed ID/disk is never attached again.
5. The signed App-Sandboxed runner receives only sealed Supervisor configuration. It opens only the
   component-owned raw objects, calls the raw-only libkrun API, and attaches source/input read-only
   plus scratch read-write. Temporary absolute-path exceptions are forbidden in the product.
6. A trusted guest launcher mounts source/input `ro,nodev,nosuid,noexec`, scratch
   `nodev,nosuid,noexec`, starts the unprivileged workload with zero capabilities and
   `no_new_privs`, then syncs and unmounts after the workload. Guest exit and unmount are separate
   evidence; either missing event blocks extraction.
7. After the exact runner is proven stopped, the Supervisor verifies source/input hashes again and
   verifies scratch path identity and exact raw length. A mismatch classifies the attempt as
   integrity-failed and quarantines all output. Post-stop hashing is supplemental detection, not a
   substitute for immutable custody.
8. The Supervisor passes a read-only handle for the raw scratch disk—not a host path or directory—to
   a fresh disposable parser sandbox with no network, fixed CPU/memory/PID/time/output limits, an
   immutable parser root, and an independently reconcilable lifecycle. The parser is explicitly
   told `raw + exact ext4 profile`; it never probes qcow2, VMDK, or another image format.
9. A purpose-built parser walks the entire allowed output subtree by inode and byte-safe directory
   entry, never by shell text. It rejects filesystem errors, unknown ext4 features, undeclared
   entries, directories below a file slot, symlinks, link count other than one, devices, FIFOs,
   sockets, sparse/overlapping/out-of-range extents, xattrs, ACLs, unexpected owners/modes/times,
   excessive inode/entry counts, and logical or allocated bytes above exact limits.
10. The parser streams each fixed regular slot through a host-enforced `limit + 1` pipe while
    hashing. Exceeding the bound discards the complete candidate and emits only a bounded code; it
    never silently publishes a prefix as the artifact. Accepted bytes are written create-exclusive
    to a fresh Broker-owned content object, fsynced, re-statted without following links, and bound
    into the artifact manifest by digest and exact length.
11. Artifact release waits for input/source post-check, runner absence, clean parser completion,
    output validation, parser teardown, and terminal Supervisor classification. Crash, timeout,
    parser failure, digest mismatch, or teardown ambiguity releases nothing.
12. Reconciliation treats lifecycle records as authority. It deletes only a path/handle that still
    matches the exact attempt record after no runner or parser owns it. Missing files or processes
    do not rewrite issued/consumed state into reusable state.

The live-mutation result makes an already-open, host-immutable raw object (or an OS-enforced
component-storage mechanism with equivalent proof) a blocking design need. `chmod`, path secrecy,
advisory locks, App Sandbox applied only to the runner, and post-stop hashing are insufficient by
themselves. If the existing libkrun path API cannot participate in that mechanism, Capsule needs a
reviewed upstream/fork API or a separately justified storage authority design before product use.

## Product contract consequences

These are proposed integration inputs, not edits made by this track:

- distinguish `scratchStorageBytes` (physical raw-device length/profile) from output artifact count,
  per-artifact logical bytes, total logical bytes, and parser resource limits;
- bind source/input disk byte length, SHA-256, raw format, filesystem profile/features, fixed slot
  mapping, and read-only requirement into the registered plan/backend material without exposing
  host or guest paths to the agent;
- bind the scratch template/profile, exact per-attempt disk length, output subtree/slots, parser
  identity/profile, and no-reuse policy into backend validation and attempt state;
- require explicit storage-launcher events for workload completion, sync/unmount outcome, and
  refusal to extract on missing/failed events;
- add bounded terminal classifications for source/input digest mismatch, scratch identity/length
  mismatch, filesystem-integrity failure, unsafe artifact, output-limit violation, parser failure,
  parser teardown failure, and storage cleanup failure;
- make `ArtifactManifest` content identity originate only after post-stop parsing and bounded copy;
  guest filenames, sizes, errors, and parser strings remain user-only/untrusted and do not enter the
  default agent summary;
- keep exact scratch limits user-owned and approved. A backend unable to create/enforce the exact
  profile refuses the attempt rather than clamping or substituting a different value.

No shared schema, ADR, architecture, or posture document was changed by this track.

## Limitations and residual risk

- The same-user live-mutation race is unresolved and blocks an immutable-custody claim.
- `inspect-output.sh` trusts shell parsing of `e2fsck`/`debugfs` text and Docker lifecycle. It is a
  reproducible oracle for these fixtures, not a safe product parser.
- Docker Desktop's lingering file-sharing descriptors show that its opaque VM/helper lifecycle is
  unsuitable for authoritative extraction/cleanup. No Docker/OCI endpoint belongs in the proposed
  native live path.
- The spike did not fuzz ext4, libkrun block configuration, or malformed/corrupt superblocks,
  journals, extents, directory trees, checksums, feature flags, or parser crash behavior.
- Host disk pressure, APFS sparse-clone/accounting semantics, I/O throttling, fsync durability after
  power loss, sleep/wake, logout/login, and reboot were not tested.
- Crash and timeout were injected only after the guest reached its ready checkpoint. All staging,
  parser-copy, extraction-copy, and deletion boundaries still need fault injection.
- Cross-job leakage was tested across fresh template copies in one run, not long repetition,
  concurrency, host pressure, restored state, or allocator-remanence analysis.
- The injected device case modeled a corrupt or more privileged filesystem writer; the ordinary
  unprivileged guest could not create a device. A hostile kernel/VMM corpus remains separate work.
- Only one fixed JSON-like regular-file output slot was copied. Directory artifacts, multiple
  files, text/CSV/JSON validation, rich documents, archives, and media remain out of scope.
- The App Sandbox case used temporary absolute-path exceptions. Installed component-owned storage,
  notarization/Gatekeeper, and authority separation remain separate gates.
- No claim is made that libkrun, libkrunfw, Linux, ext4, Hypervisor.framework, Docker, or the host is
  free of vulnerabilities.

## Decision and fallback

**Conditional pass** for continuing the native development profile with four fixed raw block
devices and a fresh bounded scratch device. The observed mechanisms support exact guest read-only
attachments, a physical raw-device ceiling, explicit clean-stop sequencing, bounded fixed-slot
collection, fail-closed hostile-object cases, and attempt-local cleanup.

Conditions before product integration are:

1. prove immutable source/input custody against the in-scope same-user attacker, including the
   libkrun open/attach race;
2. implement and adversarially test a purpose-built disposable parser with exact lifecycle and no
   Docker Desktop/file-sharing dependency;
3. complete corrupt-ext4, parser fault, staging/extraction crash, host-pressure, repetition,
   concurrency, installed App Sandbox storage, and shared malicious-guest cases;
4. bind the exact limits, device/filesystem/parser profile, distributed bytes, and retained corpus
   into an accepted backend validation record.

Until then the safe fallback is inline JSON only through the fake backend for contract work, or no
artifact release from libkrun attempts whose storage custody, teardown, or parser state is not
fully resolved. Passing this track does not make the backend production-ready.

## Retained artifacts

Retained source consists of the raw-only runner, guest probe/trusted-launcher model, digest-checked
fixture builder, App Sandbox allow/deny bundles' source inputs, one-use corpus, bounded test
collector, selected final evidence in `evidence/final-run.txt`, this README, and this result. Bulky
disks, signed bundles, and full run manifests are ignored under `.build/` and `.runs/` and are
reproducible with the commands above.
