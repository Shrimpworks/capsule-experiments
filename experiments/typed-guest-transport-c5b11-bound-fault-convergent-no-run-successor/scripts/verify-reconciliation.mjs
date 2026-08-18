import assert from "node:assert/strict";

/* This verifier deliberately imports no candidate profile, generator, effect,
 * or trace constants. Its only model input is the separately retained literal
 * oracle, whose provenance and digest are checked by verify-lib.mjs. */

function expectedMatrix(oracle) {
  const created = oracle.createdRecovery;
  const completion = oracle.completionRecovery;
  const primaryFailureCases = [];
  for (const nominal of oracle.nominalEffects) {
    for (const failure of oracle.failureKinds) {
      const path = nominal.failureClass === "completion-response-loss" ? completion
        : nominal.failureClass === "pre-creation" ? null : created;
      primaryFailureCases.push({
        sequence: nominal.sequence,
        effect: nominal.effect,
        failure,
        processMayExist: nominal.failureClass !== "pre-creation",
        trace: path ? path.map(({ effect }) => effect) : ["record-unresolved-cleanup"],
      });
    }
  }
  const recoveryStepFailureCases = [];
  const reopenRetryCases = [];
  for (const [pathName, path] of [["created", created], ["completion", completion]]) {
    for (const [index, item] of path.entries()) {
      if (item.genericImmediateUnresolved !== false) {
        for (const failure of oracle.failureKinds) {
          recoveryStepFailureCases.push({
            path: pathName,
            step: item.step,
            effect: item.effect,
            failure,
            trace: [...path.slice(0, index + 1).map(({ effect }) => effect), "record-unresolved-cleanup"],
            durableResumeStep: item.resumeStepAfterInterruption,
            originalEffectRedriven: false,
          });
        }
      }
      const resumeIndex = path.findIndex(({ step }) => step >= item.resumeStepAfterInterruption);
      reopenRetryCases.push({
        path: pathName,
        interruptedStep: item.step,
        recoveryStep: item.step,
        durableResumeStep: item.resumeStepAfterInterruption,
        trace: ["lookup-recovery-cursor", ...path.slice(resumeIndex).map(({ effect }) => effect)],
        originalEffectRedriven: false,
      });
    }
  }
  return {
    objectType: "capsule.c5b11.reconciliation-matrix",
    objectVersion: 2,
    performed: false,
    primaryFailureCases,
    ambiguousSpawnCases: primaryFailureCases.filter(({ sequence }) => sequence === 2),
    recoveryStepFailureCases,
    reopenRetryCases,
    teardownOutcomeCases: oracle.failureKinds.map((outcome) => ({
      outcome,
      requestCount: 1,
      trace: created.map(({ effect }) => effect),
      resumeStepAfterAmbiguousResponse: 17,
      immediateUnresolved: false,
      nonIdempotentEffectRedriven: false,
    })),
    durableRecordFailure: {
      attemptRemainsFenced: true,
      processMayExist: true,
      cleanupResolved: false,
      terminalDisposition: "recovery-required-no-success",
    },
  };
}

export function validateIndependentOracle(oracle) {
  assert.equal(oracle.objectType, "capsule.c5b11.independent-recovery-oracle");
  assert.equal(oracle.provenance.authoredIndependentOfCandidateGenerator, true);
  assert.equal(oracle.provenance.importsCandidateConstants, false);
  assert.deepEqual(oracle.failureKinds,
    ["provider-error", "not-applied", "indeterminate", "echo-mismatch", "fact-mismatch"]);
  assert.deepEqual(oracle.nominalEffects.map(({ sequence }) => sequence),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.equal(oracle.nominalEffects[1].failureClass, "ambiguous-spawn-process-may-exist");
  assert.deepEqual(oracle.createdRecovery.map(({ step }) => step), [14, 15, 16, 17, 18, 19, 20]);
  assert.deepEqual(oracle.completionRecovery.map(({ step }) => step), [14, 15, 22, 23]);
  assert.equal(oracle.createdRecovery.find(({ step }) => step === 16).resumeStepAfterInterruption, 17,
    "ambiguous teardown response resumes at reconciliation, not request redrive");
  assert.equal(oracle.createdRecovery.find(({ step }) => step === 16).genericImmediateUnresolved, false,
    "teardown provider outcomes do not become immediate unresolved cleanup");
  assert.equal(oracle.createdRecovery.find(({ step }) => step === 16).providerOutcomeDisposition,
    "continue-to-step-17");
  assert.deepEqual(oracle.startupRecovery.freshProof,
    { outcome: "not-applied", fact: "attempt-fresh", failedSequence: 0,
      recoveryStep: 0, durableResumeStep: 0 });
  assert.deepEqual(oracle.cursorSemantics.createdAllowedPairs,
    [[14, 14], [15, 15], [16, 17], [17, 17], [18, 18], [19, 19], [20, 20]]);
  assert.deepEqual(oracle.cursorSemantics.completionAllowedPairs,
    [[14, 14], [15, 15], [22, 22], [23, 23]]);
  assert.equal(oracle.cursorSemantics.dispatchField, "durableResumeStep");
  assert.equal(oracle.cursorSemantics.monotone, true);
  assert.deepEqual(oracle.completionFields, [
    "magic", "protocol", "method", "role", "header-length", "attempt-id", "registration-id",
    "plan-digest", "profile-digest", "status", "flags", "reserved", "payload-length",
    "payload-digest", "trailer-magic", "trailer-protocol", "trailer-method", "trailer-role",
    "trailer-length", "trailer-attempt-id", "trailer-digest",
  ]);
  return true;
}

export function validateReconciliationFixture(value, oracle) {
  validateIndependentOracle(oracle);
  assert.deepEqual(value, expectedMatrix(oracle), "independent exhaustive reconciliation matrix");
  assert.equal(value.primaryFailureCases.length, 65, "all nominal/failure crossings");
  assert.equal(value.ambiguousSpawnCases.length, 5, "all ambiguous spawn outcomes");
  assert.equal(value.recoveryStepFailureCases.length, 50,
    "all generic recovery-step/failure crossings except one-shot teardown");
  assert.equal(value.reopenRetryCases.length, 11, "all interruption/reopen/resume paths");
  for (const item of value.ambiguousSpawnCases) {
    assert.equal(item.processMayExist, true, `${item.failure}: spawn may exist`);
    assert.deepEqual(item.trace, oracle.createdRecovery.map(({ effect }) => effect),
      `${item.failure}: full created convergence`);
  }
  for (const item of value.recoveryStepFailureCases) {
    assert.notEqual(item.step, 16, `${item.path}: teardown is not generic immediate-unresolved`);
    assert.equal(item.trace.at(-1), "record-unresolved-cleanup", `${item.path}/${item.effect} durable`);
    assert.equal(item.originalEffectRedriven, false, `${item.path}/${item.effect} no redrive`);
  }
  for (const item of value.reopenRetryCases) {
    assert.equal(item.trace[0], "lookup-recovery-cursor", `${item.path}/${item.interruptedStep} reopen`);
    assert.equal(item.recoveryStep, item.interruptedStep, `${item.path}/${item.interruptedStep} step`);
    assert.equal(item.durableResumeStep >= item.recoveryStep, true,
      `${item.path}/${item.interruptedStep} monotone cursor`);
    assert.equal(item.originalEffectRedriven, false, `${item.path}/${item.interruptedStep} no redrive`);
  }
  for (const item of value.teardownOutcomeCases) {
    assert.equal(item.immediateUnresolved, false, `${item.outcome}: teardown continues`);
    assert.equal(item.trace.includes("reconcile-teardown-outcome"), true,
      `${item.outcome}: teardown outcome reconciled`);
    assert.equal(item.trace.at(-1), "reconcile-fixed-root-removal",
      `${item.outcome}: created convergence completes`);
  }
  const createdTrace = oracle.createdRecovery.map(({ effect }) => effect);
  assert.equal(createdTrace.indexOf("reconcile-terminal-state") <
    createdTrace.indexOf("reconcile-authoritative-absence"), true, "terminal before absence");
  assert.equal(createdTrace.indexOf("reconcile-authoritative-absence") <
    createdTrace.indexOf("reconcile-fixed-root-removal"), true, "absence before root removal");
  return true;
}
