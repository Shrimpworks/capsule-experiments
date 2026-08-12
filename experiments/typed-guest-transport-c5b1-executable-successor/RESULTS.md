# Results

## Decision

`PASSED` for the exact deterministic no-run construction slice. The five C5b0 null roles now have
fresh, byte-exact successor candidates. This does not recover v19 and does not make the composed
successor executable.

`BLOCKED` for complete executable composition, controlled C5b execution, and admission. A run
still requires the exact accepted governed runtime and libkrun/libkrunfw/kernel/firmware bytes, a
run-capable controller, exact owner/host/guest authorization, and the retained C5b fault/cleanup
matrix.

## Observed construction

| Role | Bytes | SHA-256 | Observation |
| --- | ---: | --- | --- |
| Host runner | 33,944 | `8b7ba0315d26326828210cc50588b723bc0be0529372263d592118e8debaadb4` | Fresh unsigned arm64 Mach-O; no UUID/signature; fixed root digest and delayed fixed-path loader |
| Raw runtime root | 8,388,608 | `578a8e6ba56da05252126567b15f7dcc07eab9dc2ad18820a9d1de53c8db3af5` | Extent-format, no-journal raw image; two executables and three immutable inputs; governed runtime absent |
| Trusted init | 365,352 | `c6c5f15dd386082e6b108c354afdca27327d6760efdefb54fe9d02e25b80e408` | Fresh stripped static arm64 Linux ELF; exact mounts/descriptors/launcher exec |
| Trusted launcher | 389,312 | `278467cd82499590154a9b1a34b0189096d3927c49fefd228dedc2f4db36ea98` | Fresh stripped static arm64 Linux ELF; exact C5b0 frames and completion-last logic |
| Controller | 33,064 | `0d56c595ac880d6c88a30bbb2246837407b9f684679315713c26f07aa2d212d8` | Fresh unsigned arm64 Mach-O hard-stop; cannot start the candidate |

Two clean builds in independent target directories reproduced all five bytes exactly. Static
inspection independently checked Mach-O and ELF classes, absence of UUID/code-signature commands,
the root superblock/features, extent traversal, embedded artifact/input equality, governed runtime
absence, predecessor known answers, closed inventory, and zero-effect status.

Seven mutations were refused: host-runner byte, embedded root input, journal restoration, C5b0
input substitution, false execution claim, governed-runtime path insertion, and undeclared file.

## Limitations

- No artifact was executed; executable format is not behavioral proof.
- The root deliberately cannot complete the workload because it contains no governed runtime.
- The runner's libkrun API shape is statically retained but not linked, loaded, or ABI-verified in
  this slice.
- The hard-stop controller is an evidence guard, not the future C5b lifecycle/fault controller.
- No libkrun/libkrunfw/kernel/firmware, identity, signature, endpoint, process, VM, guest, store, or
  product consumer participated.
- The five identities are new C5b1 candidates and are not v19 bytes or evidence-equivalent to v19.
