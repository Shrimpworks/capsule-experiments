# Apple Container Gate C spike

Status: development-only disposable research fixture. Product packages must not import this code.

Owner: Gate C research task delegated from Codex task `019fb58b-04a8-7121-98c9-82d304cf82a5`.

Purpose: adversarially probe the exact Apple Container backend installed on the test Mac. The
fixture image contains a dependency-free Bun program that inspects network/IPC, mounts, cgroups,
descriptors, memory, process, disk, output, cancellation, and teardown behavior.

Removal/replacement condition: remove after the Gate C decision is incorporated into a reviewed ADR
and the cases are replaced by the shared backend attack corpus. Do not use this image or its result
as authoritative runtime evidence outside the exact environment recorded in `RESULTS.md`.

The image intentionally invokes Bun FFI to call Linux `AF_VSOCK`; this is an attack probe, not an
endorsed runtime capability.

The measured environment, adversarial cases, observed-versus-inferred findings, cleanup record,
and Gate C decision are in [`RESULTS.md`](RESULTS.md).
