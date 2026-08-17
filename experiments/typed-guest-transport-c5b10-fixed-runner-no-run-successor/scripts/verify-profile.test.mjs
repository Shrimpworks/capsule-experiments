#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import { libkrunSymbols, nominalEffects, providerSymbols, validateProfile } from "./verify-profile.mjs";

const reference = (path) => ({ path, bytes: 1, sha256: "a".repeat(64) });
function validProfile() {
  return {
    objectType: "capsule.c5b10.fixed-runner-no-run-successor",
    objectVersion: 1,
    identity: "capsule.c5b10.fixed-runner-no-run-successor/2026-08-17",
    status: "construction-only-not-authorized",
    scopedStatus: "PASSED",
    parentStatus: "BLOCKED",
    productAdmission: "BLOCKED",
    repositoryBaseline: "7fc3af9c46895b340c3118a96cb50abb26b1d977",
    capsuleContext: "748fd0ef7a8fbf81a5c80f099c7592b88369d684",
    predecessors: {
      c5b7RuntimeRoot: "78485fb91a31733c568fe43e5fa295474e5956e1",
      c5b9NoRunComposite: "3965e6b5cc87d476da7f431d7ed8a5758011a1b8",
      c5bCompatibilityPreflight: "7fc3af9c46895b340c3118a96cb50abb26b1d977",
    },
    components: Object.fromEntries([
      "fixedRunnerSource", "fixedRunnerObject", "supervisorDriverSource",
      "supervisorEffectHeader", "supervisorDriverObject", "libkrun", "libkrunfw",
      "runtimeRoot", "sourceFrame", "inputFrame", "completionFrame",
    ].map((name) => [name, reference(name)])),
    runnerRoot: {
      bytes: 100663296,
      sha256: "5ad18f20cbc97c7a70ead3e795fd3649672513323041e913b0eb55b7acc88775",
      historicalRunnerBytes: 134217728,
      historicalRunnerSha256: "390a4786a20d45f1c691ec8c203f84f5e9d372a30e98f867cc8309a144ca6798",
      historicalIdentityAccepted: false,
    },
    ownership: {
      libkrunOwner: "fixed-host-runner-process",
      runnerLibkrunImports: [...libkrunSymbols],
      supervisorLibkrunImports: [],
      runnerSupervisorEffectImports: [],
      supervisorEffectProviderImports: [...providerSymbols],
      duplicateLibkrunOwnership: false,
      historicalRootBoundEffectObjectLinked: false,
    },
    effectAbi: {
      publicEntryPoint: "_c5b10_drive_registered_attempt",
      providerSymbols: [...providerSymbols],
      closedOutcomes: ["APPLIED", "NOT_APPLIED", "INDETERMINATE"],
      providersRetained: false,
      providerBindingStatus: "BLOCKED",
      requestEchoRequired: true,
      exactFactsRequired: true,
    },
    ordering: {
      nominalEffects: [...nominalEffects],
      faultOnlyEffects: ["request-teardown"],
      readyBeforeFrameWrites: true,
      frameWritesBeforeWriterClosure: true,
      writerClosureBeforeStart: true,
      startBeforeCompletionDrain: true,
      completionLast: true,
      terminalJoinBeforeAbsence: true,
      absenceBeforeRootRemoval: true,
      commitBeforeDelivery: true,
    },
    transport: {
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
    },
    executionRequest: {
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
    },
    authorization: {
      host: null,
      guest: null,
      executionAuthorization: null,
      executionAuthorized: false,
      constructionAuthorized: true,
      finalManifestAuthorizationRequired: true,
      callerSelectedAuthority: false,
    },
    performedEffects: { artifactLoaded: false, artifactExecuted: false, guestStarted: false },
    contradictionResolutions: Object.fromEntries([
      "runnerRootIdentity", "effectSequence", "perEffectAbi", "singleLibkrunOwner",
    ].map((name) => [name, { resolved: true, mechanism: name }])),
    limitations: ["one", "two", "three", "four"],
  };
}

test("accepts the exact closed no-run authority shape", () => {
  assert.doesNotThrow(() => validateProfile(validProfile()));
});

for (const [name, mutate, expected] of [
  ["root substitution", (value) => { value.runnerRoot.bytes = 134217728; }, /runner\/root identity/u],
  ["duplicate libkrun owner", (value) => { value.ownership.duplicateLibkrunOwnership = true; }, /false/u],
  ["effect order", (value) => { value.ordering.nominalEffects.reverse(); }, /deep-equal|Expected values|nominalEffects/u],
  ["execute request widening", (value) => { value.executionRequest.acceptedFields.push("source"); }, /execute-by-registration/u],
  ["host presence", (value) => { value.authorization.host = "host"; }, /authorization/u],
  ["guest presence", (value) => { value.authorization.guest = "guest"; }, /authorization/u],
  ["execution authorization", (value) => { value.authorization.executionAuthorized = true; }, /authorization/u],
  ["performed effect", (value) => { value.performedEffects.guestStarted = true; }, /performed effects/u],
  ["completion not last", (value) => { value.ordering.completionLast = false; }, /true/u],
  ["reopened contradiction", (value) => { value.contradictionResolutions.perEffectAbi.resolved = false; }, /resolved/u],
]) {
  test(`rejects ${name}`, () => {
    const value = validProfile();
    mutate(value);
    assert.throws(() => validateProfile(value), expected);
  });
}
