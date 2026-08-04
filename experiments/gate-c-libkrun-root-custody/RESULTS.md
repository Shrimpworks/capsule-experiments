# P0-1 immutable runtime-root custody results

Date: 2026-08-02

Decision: **PATCH-CANDIDATE — the narrow raw-only FD-native libkrun API passed the controlled local
and owned-guest corpus; the same final installed App Sandbox corpus is still required.** This is a
fail-closed development decision, not backend admission. P0-1C remains incomplete and therefore
does not support PASS.

## FD-native fallback result

The governed patch adds only
`krun_add_read_only_raw_root_fd(ctx, fd, expected_device, expected_inode, expected_length)` for the
fixed `runtime-root:vda:raw:read-only` role. It immediately owns a `F_DUPFD_CLOEXEC` duplicate,
validates the finalized `O_RDONLY` unlinked mode-`0400` regular file and exact identity/length, and
routes imago directly from an owned `File`. It accepts no pathname, format, autodetection, mount,
write, or backend option.

Observed on the pinned source and owned local guest:

- clean apply and reverse dry-run passed; composition with the retained P0-2 direct-root and P0-3
  console patches applied, built, and passed 53 Rust tests;
- the focused C contract passed 13/13 normally and under AddressSanitizer/UndefinedBehaviorSanitizer;
- source audit found zero path inputs, device path opens, or runner pathname-disk imports;
- pinned imago raw I/O remained one `preadv` and one `pwritev` site; positional reads preserved the
  shared offset and writes were refused through both read-only raw configuration and `O_RDONLY`;
- all five deliberate mutations were detected: pathname fallback, writable acceptance,
  wrong-object duplication, shared-offset I/O, and caller-close/lifetime failure;
- the local wrong/closed/reused/writable descriptor, CLOEXEC/fork, shared flags/offset, caller-close,
  path replacement, alias/mapping, source isolation, and constructor/runner lifetime corpus passed;
- four fixed-probe unsandboxed HVF guest runs matched finalized host descriptor, guest `/dev/vda`,
  and post-stop host digest at
  `b442fe91619a2542c059038b66221923f15fd5fae5de98ae531415ae12586ef1`, with zero root-path opens;
  and
- the ad-hoc App Sandbox runner again aborted in `secinit` before `main` because the host had no
  valid signing identity. This is an environmental limitation and makes no custody inference.

Patch/API/ABI/ownership, imago, supply-chain, and composition review is retained in
`FD_NATIVE_PATCH_REVIEW.md`; selected evidence is in `evidence/2026-08-02-fd-native/`.

## Hypothesis and exact sequence

The experiment tested whether a concurrent baseline same-user attacker can change or substitute
bytes observed by pinned libkrun after this exact sequence:

1. exclusive creation of an unguessable regular file;
2. complete population through the creator descriptor;
3. a distinct `O_RDONLY` open while the sole pathname exists;
4. closure of every construction-owned writable descriptor/mapping;
5. unlink of the sole pathname and revalidation of access mode, mode bits, device, inode, type,
   length, and zero link count;
6. SHA-256 and length calculation through that exact retained descriptor;
7. direct fork/exec inheritance into the runner;
8. FD-native raw block attachment and guest raw-device SHA-256 comparison.

The run used an owned 128 MiB ext4 root and `/usr/local/libexec/capsule-root-digest` as a fixed
trusted guest probe. It did not run arbitrary or user-supplied code.

## P0-1A: stable attachment identity

| Case | Observation | Disposition |
| --- | --- | --- |
| Pinned source consumers | `Block::new` contains one metadata `OpenOptions` open and one imago `open_sync`; the public API stores the supplied path string. | Two consumers confirmed. |
| Dynamic consumers | The interposed exact libkrun dylib made two `open("/dev/fd/4", O_RDONLY)` calls. Both returned `O_RDONLY` descriptors with the inherited descriptor's device/inode. | Pass in the unsandboxed exact-binary run. |
| Original pathname fallback | The custody pathname was unlinked before runner exec, libkrun was given only `/dev/fd/4`, both observed opens matched the unlinked inode, and source inspection found no alternate stored pathname. | No fallback observed or present in the audited raw path. |
| Lifetime | The unlinked object remained readable after the constructing parent closed its copy while a forked runner retained it; no pathname could reacquire it. | Pass for local fork/exec and process-crash model. |
| Wrong FD | FD 198 failed descriptor preflight with `EBADF`. | Fail closed. |
| Reused FD | A decoy object at the inherited number failed device/inode/length/digest binding before libkrun. | Fail closed in the runner manifest layer; stock libkrun itself does not bind expected identity. |
| `CLOEXEC`/fork | Fork preserved the descriptor; exec with `FD_CLOEXEC` closed it; clearing only that descriptor's bit preserved it across exec. | Direct inheritance must clear `CLOEXEC` deliberately and audit the post-exec FD set. |
| Open-file description | `/dev/fd/N` duplicates shared offsets and status flags. `pread` left the shared offset unchanged. | Shared state is real; the adapter must not mutate status flags/offsets after handoff. |
| Positional I/O | Pinned imago 0.2.3 uses `preadv`/`pwritev` for raw storage. | Guest I/O is positional in the audited route. |

Selected evidence: `source-audit.txt`, `guest-nojournal.json`, `guest-nojournal.stderr`, and
`local-custody.json` under `evidence/2026-08-02/`.

## P0-1B: frozen-object construction

The selected run finalized a distinct descriptor with:

- access mode `O_RDONLY`;
- regular-file mode `0400`;
- device `16777232`, inode `114928173` for that run;
- length `134217728`;
- link count zero;
- SHA-256 `01012163484a9a186636149102456e88efc2bbbb14f65b34dae833141bd3b4a4`.

Both libkrun consumers and the guest observed that exact digest and length. The post-stop host
descriptor digest remained identical.

Negative controls established why every step is necessary:

- `O_CREAT|O_EXCL` rejected a pre-created symlink with `EEXIST`;
- a retained writable descriptor changed an already unlinked object;
- a retained writable mapping changed an already unlinked object after its creator FD closed;
- replacing the removed pathname did not change the retained descriptor;
- mutating a writable original source did not change the independently copied custody object; and
- a journaled ext4 control produced host digest
  `741e884e440a0b73a632285bc16daca97de6c0ac30a485567b5595a6dc376c92` but guest raw-device digest
  `bdfa180366d943c9c508a4fc80de80255b03fa2b69858d45af606aea10f6063a` while both libkrun opens and
  the post-stop host digest still matched the host object. Disabling the journal made the views
  equal. This was guest page-cache/journal-view behavior, not observed host mutation, and it means
  runtime-bundle construction must either prohibit journal replay or prove an equally exact mount
  mechanism before raw guest digest comparison is meaningful.

## P0-1C: adversarial end-to-end custody

| Case | Observation | Status |
| --- | --- | --- |
| Pre-creation substitution | Existing symlink rejected by exclusive creation. | Pass locally. |
| Known create-to-finalize name | A same-UID process opened a writable alias and created a hard link in an ordinary `0700` same-owner directory. | Expected negative; ordinary mode bits are not protected storage. |
| Hard links/aliases/mappings | Retained writable aliases and mappings mutated the object after unlink. Closing all of them before finalization prevented those routes in the constructed case. | Sequence requirement confirmed. |
| Path replacement | A new object at the removed name had a different inode and could not substitute the retained object. | Pass locally. |
| Wrong/reused descriptor | Closed and substituted numbers failed runner preflight. | Pass locally. |
| Shared-offset interference | Ordinary seek changed all duplicated offsets; positional reads did not. | Hazard measured; audited libkrun route uses positional I/O. |
| Supervisor crash/recovery | A forked runner retained and hashed the unlinked object after the constructing parent closed it; recovery could not reacquire it by path. After the last descriptor closed, no path existed. | Pass for bounded local process model. |
| Full owned guest | Final descriptor, both libkrun opens, guest `/dev/vda`, and post-stop host descriptor all matched for the no-journal root. | Pass unsandboxed. |
| App Sandbox | The ad-hoc hardened bundle aborted in `secinit` before `main`; `security find-identity` reported zero valid identities. | Environmental limitation; no inference. |
| Protected construction store | No valid signed installed Supervisor container was available. The ordinary same-UID control succeeded, proving mode bits/secrecy cannot substitute. | Open blocker. |
| Debugger/task port and explicit grants | Cannot be meaningfully tested against the exact enrolled hardened runner because that runner did not start. | Exact installed denial/grant corpus remains. |
| Power loss/APFS pressure/session/reboot | Not exercised by this bounded local task. | Deferred exact installed recovery evidence. |

## Observations versus inference

Observed:

- stock libkrun's two raw block consumers duplicated the intended inherited read-only object in the
  unsandboxed exact-dylib run;
- the audited imago path used positional I/O;
- the full no-journal guest digest matched; and
- the listed local negative cases behaved as recorded.

Not established:

- App Sandbox permission for `/dev/fd/N` in the final Developer ID/notarized installed bundle;
- code-identity-protected construction against a named same-UID attacker;
- task-port/debug denial or explicit foreign-container grant behavior for final enrolled bytes;
- a closed role-specific inherited FD manifest for the complete runner; or
- P0-1 as a whole, backend admission, production readiness, or `validated-local` posture.

## Decision and exact remaining test

Choose **PATCH-CANDIDATE** for the retained governed API. It accepts an already finalized read-only
descriptor, takes duplicate ownership immediately, stores no pathname, rejects writable,
non-regular, linked, wrong-mode, wrong-identity, and unsupported control inputs, and constructs both
device identity and imago storage from owned descriptors. It adds no helper or privilege.

Then rebuild the final signed/notarized app and rerun this exact sequence inside the enrolled
Supervisor's protected container, with direct inheritance to the hardened runner. The outside
baseline same-UID attacker must know the in-progress pathname and still fail writable open, hard
link, rename/replacement, mapping, debugger/task-port, and explicit-grant attempts. Both internal
consumers (or their FD-native replacements), guest digest, crash/recovery cases, and closed FD
manifest must pass on those final bytes. Failure of the exact final installed form or its corpus
selects `PATCH-NOT-VIABLE` or `REJECT-LIBKRUN-FOR-V0`; the passing local result alone cannot close
P0-1.
