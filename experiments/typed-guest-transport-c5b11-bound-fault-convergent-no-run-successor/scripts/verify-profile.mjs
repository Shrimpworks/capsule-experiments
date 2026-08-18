import assert from "node:assert/strict";

const exactKeys = (value, expected, label) => {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} key set`);
};

export const nominalEffects = [
  "create-fixed-endpoints", "spawn-fixed-runner", "verify-ready-byte",
  "write-source-frame", "write-input-frame", "close-input-writers", "send-start-byte",
  "drain-and-validate-completion", "join-terminal-state", "prove-authoritative-absence",
  "remove-fixed-root", "commit-durable-completion", "deliver-stored-completion",
];

export const recoveryEffects = [
  "fence-attempt", "lookup-fenced-attempt", "request-teardown-once",
  "reconcile-teardown-outcome", "reconcile-terminal-state",
  "reconcile-authoritative-absence", "reconcile-fixed-root-removal",
  "record-unresolved-cleanup", "reopen-stored-completion", "replay-exact-stored-completion",
  "lookup-recovery-cursor",
];

export const providerSymbols = [
  "create_fixed_endpoints", "spawn_fixed_runner", "verify_ready_byte", "write_source_frame",
  "write_input_frame", "close_input_writers", "send_start_byte", "drain_validate_completion",
  "join_terminal_state", "prove_authoritative_absence", "remove_fixed_root",
  "commit_durable_completion", "deliver_stored_completion", "fence_attempt",
  "lookup_fenced_attempt", "request_teardown", "reconcile_teardown_outcome",
  "reconcile_terminal_state", "reconcile_authoritative_absence", "reconcile_fixed_root_removal",
  "record_unresolved_cleanup", "reopen_stored_completion", "replay_stored_completion",
  "lookup_recovery_cursor",
].map((name) => `_c5b11_supervisor_${name}`);

export const libkrunSymbols = [
  "_krun_add_console_port_inout", "_krun_add_read_only_raw_root_fd",
  "_krun_add_virtio_console_multiport", "_krun_create_ctx", "_krun_disable_implicit_console",
  "_krun_disable_implicit_init", "_krun_disable_implicit_vsock", "_krun_set_exec",
  "_krun_set_kernel_console", "_krun_set_root_disk_remount", "_krun_set_vm_config",
  "_krun_set_workdir", "_krun_start_enter",
];

export function validateProfile(profile) {
  exactKeys(profile, [
    "objectType", "objectVersion", "identity", "status", "scopedStatus", "parentStatus",
    "productAdmission", "repositoryBaseline", "capsuleContext", "predecessors", "components",
    "bindingLayers", "runnerRoot", "ownership", "effectAbi", "ordering", "faultConvergence",
    "transport", "executionRequest", "authorization", "performedEffects",
    "contradictionResolutions", "limitations",
  ], "profile");
  assert.equal(profile.objectType, "capsule.c5b11.bound-fault-convergent-no-run-successor");
  assert.equal(profile.objectVersion, 1);
  assert.equal(profile.identity, "capsule.c5b11.bound-fault-convergent-no-run-successor/2026-08-18");
  assert.equal(profile.status, "construction-only-not-authorized");
  assert.equal(profile.scopedStatus, "PASSED");
  assert.equal(profile.parentStatus, "BLOCKED");
  assert.equal(profile.productAdmission, "BLOCKED");
  assert.equal(profile.repositoryBaseline, "ecc3e5efb835931d2d2113d1bc20831a35aba8b4");
  assert.equal(profile.capsuleContext, "748fd0ef7a8fbf81a5c80f099c7592b88369d684");
  assert.equal(profile.predecessors.c5b10MergedCommit,
    "6eb030130734882de4529e647a5a0ac29af362f6");
  assert.equal(profile.predecessors.c5b10AcceptedEvidence, false);
  assert.deepEqual(profile.predecessors.c5b10ImportantFindings,
    ["stale-attempt-profile-binding", "incomplete-fault-reconciliation"]);

  for (const [name, reference] of Object.entries(profile.components)) {
    assert.equal(typeof reference.path, "string", `${name} path`);
    assert.equal(Number.isSafeInteger(reference.bytes) && reference.bytes > 0, true, `${name} bytes`);
    assert.match(reference.sha256, /^[0-9a-f]{64}$/u, `${name} digest`);
  }
  assert.equal(profile.components.runtimeRoot.bytes, 100663296);
  assert.equal(profile.components.runtimeRoot.sha256,
    "5ad18f20cbc97c7a70ead3e795fd3649672513323041e913b0eb55b7acc88775");
  assert.equal(profile.bindingLayers.attemptRuntimeProfile.excludesSupervisorDriver, true);
  assert.equal(profile.bindingLayers.outerComposition.bindsSupervisorDriver, true);
  assert.equal(profile.bindingLayers.attemptRuntimeProfile.sha256,
    profile.components.attemptRuntimeProfile.sha256);
  assert.notEqual(profile.bindingLayers.attemptRuntimeProfile.sha256,
    "06079eea39ce9a2e0547837555a6953787d8c32d614f0ec7b9b07ef408de04cd");
  assert.equal(profile.bindingLayers.attemptRuntimeProfile.binds.includes("runtimeExecutable"), true);
  assert.equal(profile.bindingLayers.attemptRuntimeProfile.binds.includes("runtimeSnapshot"), true);
  assert.equal(profile.bindingLayers.attemptRuntimeProfile.binds.includes("c5b7RootProfile"), true);
  assert.equal(profile.bindingLayers.attemptRuntimeProfile.binds.includes("c5b6Provenance"), true);

  assert.equal(profile.runnerRoot.bytes, 100663296);
  assert.equal(profile.runnerRoot.sha256, profile.components.runtimeRoot.sha256);
  assert.equal(profile.runnerRoot.historicalIdentityAccepted, false);
  assert.equal(profile.ownership.libkrunOwner, "fixed-host-runner-process");
  assert.deepEqual(profile.ownership.runnerLibkrunImports, libkrunSymbols);
  assert.deepEqual(profile.ownership.supervisorLibkrunImports, []);
  assert.deepEqual(profile.ownership.supervisorEffectProviderImports, providerSymbols);
  assert.equal(profile.ownership.duplicateLibkrunOwnership, false);
  assert.equal(profile.ownership.historicalRootBoundEffectObjectLinked, false);

  assert.equal(profile.effectAbi.publicEntryPoint, "_c5b11_drive_registered_attempt");
  assert.deepEqual(profile.effectAbi.providerSymbols, providerSymbols);
  assert.deepEqual(profile.effectAbi.closedOutcomes, ["APPLIED", "NOT_APPLIED", "INDETERMINATE"]);
  assert.equal(profile.effectAbi.profileEchoRequired, true);
  assert.equal(profile.effectAbi.frameEchoRequired, true);
  assert.equal(profile.effectAbi.providersRetained, false);
  assert.equal(profile.effectAbi.teardownIntentDurableBeforeSideEffectRequired, true);
  assert.equal(profile.effectAbi.teardownDurableResumeStep, 17);
  assert.equal(profile.effectAbi.recoveryCursorDurableAndMonotonicRequired, true);
  assert.deepEqual(profile.ordering.nominalEffects, nominalEffects);
  assert.deepEqual(profile.ordering.recoveryEffects, recoveryEffects);
  for (const value of Object.values(profile.ordering).filter((item) => typeof item === "boolean")) {
    assert.equal(value, true);
  }
  assert.equal(profile.faultConvergence.nonIdempotentRedrive, false);
  assert.equal(profile.faultConvergence.teardownRequestMaximum, 1);
  assert.equal(profile.faultConvergence.unresolvedCleanupDurable, true);
  assert.equal(profile.faultConvergence.commitResponseLossUsesStoredRecord, true);
  assert.equal(profile.faultConvergence.replayExactBytes, true);
  assert.equal(profile.faultConvergence.ambiguousSpawnProcessMayExist, true);
  assert.equal(profile.faultConvergence.startupRecoveryCursorLookup, true);
  assert.equal(profile.faultConvergence.recoveryStepFailureCrossProduct, true);
  assert.equal(profile.faultConvergence.interruptionReopenResume, true);

  assert.deepEqual(profile.executionRequest.acceptedFields, ["registrationId"]);
  for (const [key, value] of Object.entries(profile.executionRequest)) {
    if (key.startsWith("caller") || key.startsWith("replacement")) assert.equal(value, false, key);
  }
  assert.deepEqual(profile.authorization.host, null);
  assert.deepEqual(profile.authorization.guest, null);
  assert.deepEqual(profile.authorization.executionAuthorization, null);
  assert.equal(profile.authorization.executionAuthorized, false);
  assert.equal(Object.values(profile.performedEffects).every((value) => value === false), true,
    "performed effects must remain absent");
  for (const [name, resolution] of Object.entries(profile.contradictionResolutions)) {
    assert.equal(resolution.resolved, true, `${name} resolved`);
    assert.equal(typeof resolution.mechanism, "string", `${name} mechanism`);
  }
  assert.equal(profile.limitations.length >= 6, true, "limitations");
}
