# Gate C P0-3 local console correctness results

Date: 2026-08-02; sanitizer/coverage follow-up: 2026-08-03

Decision: **a governed correctness patch is required before this console route can proceed**.

The pinned stock route contains ordinary reliability failures at the boundary Capsule intends to
use: control messages can index unknown ports, repeated open messages can retake already-consumed
queues, malformed control descriptor shapes are not rejected before reading, and the transmit
thread can wait only on output readiness while shutdown joins that thread before signaling its stop
event. Partial output followed by a zero return or error can also reach an equality assertion or
lose already completed progress.

The retained candidate patch removes those specific panic/wait paths and passed the local library
suite. It is evidence for a patch decision only. It is not a complete console review, sanitizer
campaign, accepted backend profile, or P0-3 closure.

## Exact source and environment

| Item | Value |
| --- | --- |
| libkrun | 1.19.4 commit `728df8125077d0db44265f6e997c72b81b65c015` |
| Patch SHA-256 | `584ce48548fe969684fe3c55e57fbf56e7dae40af28c241c24c47b138faf1283` |
| Host | macOS 26.5.2 (25F84), arm64 |
| Rust | rustc/cargo 1.93.1 |
| C compiler | Apple clang 21.0.0 |
| Network use | Disabled for the retained Cargo run |

The exact retained source checkout also contains two pre-existing Gate C modifications outside the
console directory. `verify.sh` deliberately archives the named upstream commit and applies only this
experiment's patch, so those unrelated working-tree changes cannot affect the result.

## Candidate changes

The patch:

- accepts only one exact readable control object and completes rejected descriptors with zero use;
- checks every port identifier before indexing;
- suppresses duplicate or already-active start requests;
- refuses missing RX/TX queue state without panicking and restores a partially acquired pair;
- lets the transmit wait observe the same stop event as shutdown and signals that event before
  joining either port thread;
- removes the complete-write assertion, retains partial progress, and stops processing the current
  descriptor chain when the output cannot complete it; and
- adds four focused regression tests for descriptor shape, port identifier bounds, duplicate start
  scheduling, and shutdown interruption of a full output pipe.

## Observed verification

`cargo test --offline -p krun-devices --lib` passed all **51 tests**: the pre-existing 47 tests and
the four new focused cases. Targeted `rustfmt --check`, patch application from a clean archive, and
repository `git diff --check` also passed.

The 2026-08-03 strongest locally available offline follow-up also passed:

- warning-denying `cargo clippy` for the `krun-devices` library, allowing only the already-known
  deprecated `GuestMemory::try_access` use;
- all 51 tests under AddressSanitizer using pinned local rustc 1.98.0-nightly
  (`57d06900f`, 2026-05-27);
- 25 consecutive shutdown-interruption repetitions; and
- four restoration mutations covering malformed control acceptance, unchecked port IDs,
  duplicate start scheduling, and stop-blind output waiting. Every mutation was caught by its
  focused regression.

`cargo-llvm-cov` 0.8.4 measured the four changed files at **13/88 functions (14.772727%)**,
**90/728 lines (12.362637%)**, and **156/1,091 regions (14.298808%)**. File line coverage was
35/275 (12.727273%) for `device.rs`, 0/137 for `port.rs`, 55/225 (24.444444%) for `port_io.rs`, and
0/91 for `process_tx.rs`. These low values—especially the two zero-coverage files—are retained
counterevidence. The sanitizer run and four caught mutants do not substitute for direct queue,
thread, shutdown-order, and partial-write coverage.

## Limitations and remaining work

- The patch has not been accepted upstream or independently reviewed.
- The test is library-level and synthetic; it does not compose a signed runner, VM, launcher, or
  the sibling typed-port protocol.
- The `dup`-then-`O_NONBLOCK` implementation still changes flags on the caller's shared open-file
  description. Capsule must provide dedicated endpoints and retain a pre/post flag canary, or adopt
  a separately reviewed FD construction change.
- The retained sanitizer/coverage campaign exposes substantial unexecuted console code. Direct
  coverage of `port.rs` and `process_tx.rs`, malformed queue/descriptor paths, partial-then-error,
  caller flags, and thread shutdown ordering remains mandatory.
- The patch still uses deprecated `GuestMemory::try_access`; replacement with reviewed slice
  iteration remains appropriate before a final dependency patch.
- Output failure after partial progress is preserved as partial completion and logged, but the final
  product must bind that condition into its fixed terminal classification rather than treating it as
  ordinary completion.
- Directional negative-FD behavior remains an implementation observation rather than a public API
  contract and requires the sibling profile canary or a governed directional API.

Therefore the stock route is not supportable as-is. Capsule may continue only with a governed patch
plus the remaining direct coverage work and later composition with the typed protocol; otherwise
it should replace this transport. The local source archive and patch artifact are experiment inputs,
not a shippable governed fork.
