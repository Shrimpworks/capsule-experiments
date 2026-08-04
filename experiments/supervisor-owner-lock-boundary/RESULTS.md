# Supervisor owner-lock boundary results

Date: 2026-08-03 (America/Toronto)

Repository baseline: `c68dfb1535b6763ad7c89d5f401fa9002f225b26` (`origin/main`).

Decision: **conditional local-semantics pass; select explicit BSD `flock` on an enrolled
pre-created sibling object for later implementation, with no production or installed-storage
claim.**

## Question and defensive scope

The experiment asks which narrow macOS primitive can provide one installation-global Supervisor
owner before store open, recovery, archive, or adapter work, replacing the current injected
in-process owner assertion without adding authority.

The harness used only mode-restricted files and child processes under one owned temporary
directory. It created no product executable, service, LaunchAgent, helper, key, credential,
backend, runtime, or guest and touched no unrelated process. All children belonged to the harness.

## Environment

| Item | Observed value |
| --- | --- |
| Host/kernel | arm64 MacBookPro host; Darwin 25.5.0 |
| macOS | 26.5.2 build 25F84 |
| Effective UID | 501 |
| Python | 3.14.6 |
| Apple clang | 21.0.0 (`clang-2100.1.1.101`) |
| Privilege | ordinary current user; no sudo, root, helper, or second-user fixture |

Repository verification used Node.js 22.22.1, pnpm 10.28.2, Go 1.26.5 (`darwin/arm64`),
golangci-lint 2.12.2 (built with Go 1.26.2 at `c0d3ddc`), and govulncheck 1.6.0 against
`https://vuln.go.dev` updated 2026-07-27 20:14:16 UTC.

The full machine-readable run is
[`evidence/2026-08-03/local-run.json`](evidence/2026-08-03/local-run.json).

## Alternatives and exact observations

| Mechanism | Observed local semantics | Disposition |
| --- | --- | --- |
| POSIX `F_SETLK` write record lock | Independent process contended and death released it. Fork did not inherit the process lock. It survived same-process exec only while a descriptor remained. A second open in the same process joined the lock, and closing that other descriptor released all process record locks for the file. | Reject: process-wide/any-close behavior is too fragile. |
| `F_OFD_SETLK` | Present in the macOS 26 SDK and Python. Independent descriptions contended; dup/fork retained the lock until last close; `CLOEXEC` released it and non-`CLOEXEC` exec retained it. It contended with POSIX and BSD attempts on this host. | Not selected: desired semantics, but newly exposed at the unresolved macOS floor and no advantage over `flock`. |
| BSD `flock(LOCK_EX | LOCK_NB)` | Independent descriptions/processes contended; dup/fork shared ownership until last close; closing an unrelated open did not release it; `CLOEXEC` released on exec; process death released it. | Select for later implementation. |
| `open(... O_EXLOCK | O_NONBLOCK)` | Available and mutually contended with `flock`, demonstrating the same lock domain. | Not selected: acquisition-before-validation adds no rename/replacement protection. |
| launchd/store-inode/create-on-start alternatives | Not run as product mechanisms. Existing retained evidence and file semantics show they do not cover offline state ownership, atomic store-inode replacement, or crash-stale sentinel handling. | Reject by architecture/contract. |

## Object and startup observations

- The selected opener accepted only the pre-created mode-0600 regular file with exact effective
  UID, device, inode, and link count one.
- Missing, final-component symlink, wrong mode, hard link, directory, and injected UID/device/inode
  expectation mismatches refused. Missing startup created no file. No real cross-UID `chown` case
  was attempted because the scope prohibited root/another user.
- A retained directory descriptor plus `openat` remained attached to the original directory after
  its pathname was renamed and replaced.
- While a `flock` descriptor was held, renaming the object moved the lock with its inode. A new file
  at the original pathname could be locked concurrently. Enrolled inode comparison refused that
  replacement, but the observation proves the parent directory must be protected from same-UID
  mutation.
- Unlinking the held object removed its path while the descriptor-scoped lock remained until
  close. Normal startup must therefore refuse absence, never recreate it.
- A duplicate startup returned busy before the harness recorded any store read, recovery
  enumeration, mutation, or adapter marker; the exact store digest remained unchanged.
- `SIGKILL` of the owner released the last descriptor. The successor observed the exact order
  `lock-acquired`, `store-opened`, `recovery-enumerated`, `attempts-enabled`.

## Selected contract and inference

The narrow implementation is `openat(O_RDONLY|O_NOFOLLOW|O_CLOEXEC)` against a trusted retained
state-root descriptor, exact `fstat` enrollment checks, `flock(LOCK_EX|LOCK_NB)`, then descriptor
and directory-entry revalidation before store open. The descriptor remains opaque and open for the
entire process lifetime. A fresh in-memory owner-session ID is generated only after the OS lock and
store validation and binds sealed store/effect/archive values; it does not replace the lock.

The local observations support those syscall and ordering semantics. They do not by themselves
show that another same-UID process cannot reach or replace the lock. Product use depends on the
separately installed, enrolled Supervisor-private protected state root. Device/inode checks detect
startup substitution but cannot prevent mutation by an actor that can write the parent directory.

The selection is orthogonal to the Source Preparer P0 HOLD retained in draft PR #72 at `a12041c`.
This harness observed cooperating-process ownership and startup exclusion only. It did not prove
source-store confidentiality or integrity, protected-container membership, worker confinement, or
store-genesis/update authority. A future composition would need a separate protected root and
enrolled owner domain for the Source Preparer after those properties are independently proven;
sharing the Supervisor lock or owner-session domain would widen authority.

The trusted installer creates/enrolls the object exactly once for a new installation and ordinary
updates preserve it. Missing, moved, restored-to-new-inode, or replaced state requires an offline
authorized forward-repair/new-installation ceremony; normal Supervisor startup and the daemon may
not create it.

## Confidence and limitations

Confidence is high for the exact local descriptor, process-death, contention, and pathname
observations on macOS 26.5.2. Confidence is conditional for product selection because installed
protected-container and distribution behavior remain untested.

Not observed:

- Apple-signed installed Supervisor integration or protected state-root denial;
- wrong user, simultaneous/fast-switched session, logout/login, screen lock, reboot, sleep/wake,
  launchd restart/backoff, or restart storm;
- prepared update, package replacement, restore, state-root relocation, or lock re-enrollment;
- macOS versions below 26 or the final supported floor;
- real cross-UID ownership denial, Full Disk Access/user-consent override, task-port, root, or
  administrator adversaries;
- real APFS power interruption, production database/archive/backup, authenticated IPC, approvals,
  runtime/backend, or guest behavior.

No cross-user protection, rollback resistance, continuous service, authenticated IPC, production
readiness, source-store protection, worker confinement, or general same-UID containment is
claimed.

## Reproduction and retained artifacts

```sh
./experiments/supervisor-owner-lock-boundary/run.sh
```

Retained artifacts are the harness, this report, and the exact JSON run. The prototype must remain
under `experiments/` and must not be imported by product packages. It may be removed only after the
Go/Darwin port and Apple-signed installed matrix retain equivalent descriptor, death, replacement,
session, update, and refusal-before-state evidence.
