# Exact command classes and dispositions

The working paths below were local task-owned clones or build state. No command launched libkrun,
HVF, a VM, or a guest profile.

| Phase | Command | Disposition |
| --- | --- | --- |
| Clone | `git clone https://github.com/Shrimpworks/{capsule-experiments,capsule-corp,deno,rusty_v8,libkrun}.git` | passed |
| Runtime candidate | `node scripts/verify-governed-runtime-release-candidate.mjs --evidence-root … --deno-repo … --rusty-v8-repo … --libkrun-repo …` | passed, offline verification only |
| Passive tests | `node --test scripts/verify-governed-runtime-release-candidate.test.mjs scripts/verify-governed-deno-core-c1.test.mjs scripts/verify-governed-deno-core-c2a.test.mjs` | 25 passed |
| rusty_v8 inputs | `python3 scripts/governed/verify_inputs.py --require-submodules` | passed, 20 gitlinks |
| rusty_v8 arm64 | `python3 scripts/governed/verify_arm64_inputs.py --require-submodules` | passed, 22 cross packages |
| libkrun patches | `governance/capsule-v1.19.4/scripts/verify-patch-queue.sh` equivalent exact-commit reconstruction | passed; movable branch-tip check separately drifted |
| libkrunfw | `shasum -a 256 libkrunfw-prebuilt-aarch64.tgz libkrunfw/kernel.c` | exact retained hashes |
| Linux | `xz -t linux-6.12.91.tar.xz` and SHA-256 comparison to kernel.org signed checksum list | passed |
| Empty seed | `run-arm64-builder-volume.sh seed` with task-specific volume suffix | passed after standalone-clone correction |
| Connected acquisition | `run-arm64-builder-volume.sh prefetch` | passed, 263 Cargo archives |
| Decisive build | `run-arm64-builder-volume.sh build` | network disabled; link/readelf/QEMU self-probe passed; compilation intentionally interrupted after static blocker confirmation |
| Blocker proof | `node experiments/gate-c-c2-final-governed-artifacts/scripts/verify-blocker.mjs …` | `PASS-EXPECTED-BLOCKED` |

The first fresh Docker seed failed because a linked-worktree `.git` pointer was not valid in the
isolated volume. That failed seed was discarded. A standalone clone from the authorized
Shrimpworks origin was detached at the exact governed head and used for the accepted empty seed.

One downloaded Linux archive with a failed `xz -t` result was treated as a corrupt partial input
and never used. The fresh archive at the retained digest passed integrity verification.
