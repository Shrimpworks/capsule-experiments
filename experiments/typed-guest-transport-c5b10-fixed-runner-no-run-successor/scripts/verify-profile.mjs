import assert from "node:assert/strict";

const exactKeys = (value, expected, label) => {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} key set`);
};

export const nominalEffects = [
  "create-fixed-endpoints",
  "spawn-fixed-runner",
  "verify-ready-byte",
  "write-source-frame",
  "write-input-frame",
  "close-input-writers",
  "send-start-byte",
  "drain-and-validate-completion",
  "join-terminal-state",
  "prove-authoritative-absence",
  "remove-fixed-root",
  "commit-durable-completion",
  "deliver-stored-completion",
];

export const providerSymbols = [
  "_c5b10_supervisor_create_fixed_endpoints",
  "_c5b10_supervisor_spawn_fixed_runner",
  "_c5b10_supervisor_verify_ready_byte",
  "_c5b10_supervisor_write_source_frame",
  "_c5b10_supervisor_write_input_frame",
  "_c5b10_supervisor_close_input_writers",
  "_c5b10_supervisor_send_start_byte",
  "_c5b10_supervisor_drain_validate_completion",
  "_c5b10_supervisor_join_terminal_state",
  "_c5b10_supervisor_prove_authoritative_absence",
  "_c5b10_supervisor_remove_fixed_root",
  "_c5b10_supervisor_commit_durable_completion",
  "_c5b10_supervisor_deliver_stored_completion",
  "_c5b10_supervisor_request_teardown",
];

export const libkrunSymbols = [
  "_krun_add_console_port_inout",
  "_krun_add_read_only_raw_root_fd",
  "_krun_add_virtio_console_multiport",
  "_krun_create_ctx",
  "_krun_disable_implicit_console",
  "_krun_disable_implicit_init",
  "_krun_disable_implicit_vsock",
  "_krun_set_exec",
  "_krun_set_kernel_console",
  "_krun_set_root_disk_remount",
  "_krun_set_vm_config",
  "_krun_set_workdir",
  "_krun_start_enter",
];

export function validateProfile(profile) {
  exactKeys(profile, [
    "objectType", "objectVersion", "identity", "status", "scopedStatus",
    "parentStatus", "productAdmission", "repositoryBaseline", "capsuleContext",
    "predecessors", "components", "runnerRoot", "ownership", "effectAbi",
    "ordering", "transport", "executionRequest", "authorization",
    "performedEffects", "contradictionResolutions", "limitations",
  ], "profile");
  assert.equal(profile.objectType, "capsule.c5b10.fixed-runner-no-run-successor");
  assert.equal(profile.objectVersion, 1);
  assert.equal(profile.identity, "capsule.c5b10.fixed-runner-no-run-successor/2026-08-17");
  assert.equal(profile.status, "construction-only-not-authorized");
  assert.equal(profile.scopedStatus, "PASSED");
  assert.equal(profile.parentStatus, "BLOCKED");
  assert.equal(profile.productAdmission, "BLOCKED");
  assert.equal(profile.repositoryBaseline, "7fc3af9c46895b340c3118a96cb50abb26b1d977");
  assert.equal(profile.capsuleContext, "748fd0ef7a8fbf81a5c80f099c7592b88369d684");
  assert.deepEqual(profile.predecessors, {
    c5b7RuntimeRoot: "78485fb91a31733c568fe43e5fa295474e5956e1",
    c5b9NoRunComposite: "3965e6b5cc87d476da7f431d7ed8a5758011a1b8",
    c5bCompatibilityPreflight: "7fc3af9c46895b340c3118a96cb50abb26b1d977",
  });

  exactKeys(profile.components, [
    "fixedRunnerSource", "fixedRunnerObject", "supervisorDriverSource",
    "supervisorEffectHeader", "supervisorDriverObject", "libkrun",
    "libkrunfw", "runtimeRoot", "sourceFrame", "inputFrame", "completionFrame",
  ], "components");
  for (const [name, reference] of Object.entries(profile.components)) {
    assert.equal(typeof reference.path, "string", `${name} path`);
    assert.equal(Number.isSafeInteger(reference.bytes) && reference.bytes > 0, true, `${name} bytes`);
    assert.match(reference.sha256, /^[0-9a-f]{64}$/u, `${name} digest`);
  }

  assert.deepEqual(profile.runnerRoot, {
    bytes: 100663296,
    sha256: "5ad18f20cbc97c7a70ead3e795fd3649672513323041e913b0eb55b7acc88775",
    historicalRunnerBytes: 134217728,
    historicalRunnerSha256: "390a4786a20d45f1c691ec8c203f84f5e9d372a30e98f867cc8309a144ca6798",
    historicalIdentityAccepted: false,
  }, "runner/root identity");

  assert.equal(profile.ownership.libkrunOwner, "fixed-host-runner-process");
  assert.deepEqual(profile.ownership.runnerLibkrunImports, libkrunSymbols);
  assert.deepEqual(profile.ownership.supervisorLibkrunImports, []);
  assert.deepEqual(profile.ownership.runnerSupervisorEffectImports, []);
  assert.deepEqual(profile.ownership.supervisorEffectProviderImports, providerSymbols);
  assert.equal(profile.ownership.duplicateLibkrunOwnership, false);
  assert.equal(profile.ownership.historicalRootBoundEffectObjectLinked, false);

  assert.equal(profile.effectAbi.publicEntryPoint, "_c5b10_drive_registered_attempt");
  assert.deepEqual(profile.effectAbi.providerSymbols, providerSymbols);
  assert.deepEqual(profile.effectAbi.closedOutcomes, ["APPLIED", "NOT_APPLIED", "INDETERMINATE"]);
  assert.equal(profile.effectAbi.providersRetained, false);
  assert.equal(profile.effectAbi.providerBindingStatus, "BLOCKED");
  assert.equal(profile.effectAbi.requestEchoRequired, true);
  assert.equal(profile.effectAbi.exactFactsRequired, true);

  assert.deepEqual(profile.ordering.nominalEffects, nominalEffects);
  assert.deepEqual(profile.ordering.faultOnlyEffects, ["request-teardown"]);
  assert.equal(profile.ordering.readyBeforeFrameWrites, true);
  assert.equal(profile.ordering.frameWritesBeforeWriterClosure, true);
  assert.equal(profile.ordering.writerClosureBeforeStart, true);
  assert.equal(profile.ordering.startBeforeCompletionDrain, true);
  assert.equal(profile.ordering.completionLast, true);
  assert.equal(profile.ordering.terminalJoinBeforeAbsence, true);
  assert.equal(profile.ordering.absenceBeforeRootRemoval, true);
  assert.equal(profile.ordering.commitBeforeDelivery, true);

  assert.deepEqual(profile.transport, {
    payloadMaximumBytes: 262144,
    sourcePhysicalMaximum: 262296,
    inputPhysicalMaximum: 262296,
    completionPhysicalMaximum: 262368,
    completionRetentionBytes: 262369,
    readyByte: "R",
    startByte: "G",
    startWriterClosedAfterByte: true,
    completionTrailerLast: true,
    eofCommits: false,
    exitZeroCommits: false,
  }, "transport");

  assert.deepEqual(profile.executionRequest, {
    acceptedFields: ["registrationId"],
    registrationId: "5273186561778ee1bb8d78c7911321ce",
    attemptId: "c5ab61f60d5ddc4c00a1bf50a8669344",
    attemptBound: true,
    attemptIssuedBeforeEffects: true,
    replacementPlanBytes: false,
    replacementSourceBytes: false,
    replacementInputBytes: false,
    callerExecutableBytes: false,
    callerHostPaths: false,
    callerEndpoints: false,
    callerFlags: false,
    callerImages: false,
    callerMounts: false,
    callerBackendConfiguration: false,
    callerEnvironment: false,
  }, "execute-by-registration boundary");

  assert.deepEqual(profile.authorization, {
    host: null,
    guest: null,
    executionAuthorization: null,
    executionAuthorized: false,
    constructionAuthorized: true,
    finalManifestAuthorizationRequired: true,
    callerSelectedAuthority: false,
  }, "authorization boundary");
  assert.equal(Object.values(profile.performedEffects).every((value) => value === false), true,
    "performed effects must remain absent");

  exactKeys(profile.contradictionResolutions, [
    "runnerRootIdentity", "effectSequence", "perEffectAbi", "singleLibkrunOwner",
  ], "contradiction resolutions");
  for (const [name, resolution] of Object.entries(profile.contradictionResolutions)) {
    assert.equal(resolution.resolved, true, `${name} must be resolved`);
    assert.equal(typeof resolution.mechanism, "string", `${name} mechanism`);
  }
  assert.equal(Array.isArray(profile.limitations) && profile.limitations.length >= 4, true,
    "limitations");
}
