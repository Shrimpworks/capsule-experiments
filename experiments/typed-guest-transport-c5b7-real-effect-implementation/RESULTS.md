# Results

Scoped C5b7 implementation status: `PASSED`.

Parent C5b controlled composition: `BLOCKED`.

Product admission: `BLOCKED`.

## Observed

- Two production builds produced one byte-identical arm64 `MH_OBJECT`.
- The object exports only `c5b7_validate_execution_inputs` and
  `c5b7_execute_controller_actions`.
- Its undefined imports are the two exact C5b5 entry points, 14 exact libkrun entry points including
  context free, and `read`, `write`, and `close`.
- It contains no `main`, loader/rpath/dylib command, dynamic loading, environment lookup, spawn,
  executable-path selection, or filesystem deletion surface.
- The test double passed fixed call ordering, each selected first-error point, context cleanup,
  partial/zero/error writes, exact start byte and EOF, close refusal, closed owner requests,
  the real C5b3 controller's separately emitted teardown/absence/cleanup and commit/delivery steps,
  unknown action/effect, profile mismatch,
  cap+1, and 96-MiB root-size mismatch.
- Seven archive/source/object/profile mutation classes refused.

## Inference and limitation

Static import and test-double results show that the implementation expresses the frozen call
boundary and fails closed under the tested deterministic faults. They do not show that real
libkrun accepts the configuration, that HVF starts, that transport works across a VM, or that
teardown, absence, cleanup, and durable commit are implemented by an authorized owner.

The newly constructed 96-MiB runtime root is incompatible with the exact 128-MiB C5b5 profile
retained here. Complete composition remains blocked on a versioned rebinding and independent
composite verification.
