# Gate C follow-up: libkrun console and lifecycle bounds

Status: **development-only feasibility spike; no production or validated-posture claim**.

Owner: Capsule core. Remove or replace this experiment after the evidenced mechanisms are
independently reviewed and implemented behind the production backend interface, or after a later
ADR rejects the libkrun/HVF candidate.

## Question

Can a host controller bound console capture, wall timeout, cancellation, and teardown outside the
guest, including when guest output blocks or the guest does not cooperate? Which CPU and memory
values are exact mechanisms rather than rate estimates or accounting?

This follow-up preserves the parent spike's one signed VMM process/one VM invariant, raw immutable
root disk, compiled-out network, disabled implicit vsock, trusted non-root launcher, and durable
record-before-start control pipe. It adds only development harness surfaces; product packages do
not import this code.

## Retained mechanisms

- The controller owns separate stdout/stderr pipes, continuously drains or deliberately stalls
  them, retains at most a fixed prefix per stream, discards overflow, and appends a fixed
  truncation marker after EOF. It never stores unbounded raw output.
- Wall timeout and cancellation timers run independently of the drain goroutines.
- Every signal is preceded by comparison of the live PID/start/path/code identity/CDHash against
  the durable record. A mismatch is unresolved and is not killed by name or PID alone.
- `SIGTERM` requests libkrun's documented aarch64/macOS GPIO shutdown event through the context's
  shutdown eventfd. After a fixed grace, the controller re-verifies the exact runner and uses
  `SIGKILL`. An `ignore` mode is retained solely to exercise the forced path.
- CPU/RAM inputs are a closed profile allowlist. Two explicitly named below-floor probe profiles
  exist only to retain negative evidence; unsupported user profiles are rejected rather than
  clamped or passed through as arbitrary backend flags.

## Build and run

The parent experiment retains the pinned libkrun/libkrunfw sources and immutable Alpine fixture.
If its generated root disk is absent, `build.sh` invokes its retained fixture scripts.

```sh
CAPSULE_SIGNING_IDENTITY='Developer ID Application: Dylan Steele (3DDR84M4JS)' ./build.sh
./run-corpus.sh
```

The corpus covers quiet completion, candidate CPU/memory profiles, an unsupported profile,
sustained stdout/stderr flood, pipe backpressure, a reader stall and resume, capture truncation,
console-reader closure, wall timeout, cancellation, graceful eventfd shutdown, exact forced kill,
concurrent attempts, three controller crash checkpoints, and a busy/output-blocked non-cooperative
guest analogue. Generated products and full run directories are ignored under `.build/` and
`.runs/`; the result document records the evidence selected from the run.

## Scope limits

This is host-specific observation on one macOS/Apple-silicon/libkrun configuration. A configured
vCPU count is not a host CPU percentage or exact CPU-time quota. Configured guest RAM is a VM
hardware-size mechanism, while host RSS is accounting and includes VMM behavior not captured by
guest RAM. Wall scheduling has measured overshoot. The forced path depends on the recorded exact
runner identity and the prior one-process/one-VM evidence; it does not prove safety against a
compromised kernel, Hypervisor.framework, libkrun, or host administrator.

See [RESULTS.md](RESULTS.md) for observations, inferences, limitations, residual risk, and the
decision.
