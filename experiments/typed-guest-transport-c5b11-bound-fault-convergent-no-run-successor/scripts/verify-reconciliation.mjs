import assert from "node:assert/strict";

import { nominalEffects } from "./verify-profile.mjs";

export const failureKinds = [
  "provider-error", "not-applied", "indeterminate", "echo-mismatch", "fact-mismatch",
];
export const createdRecovery = [
  "fence-attempt",
  "lookup-fenced-attempt",
  "request-teardown-once",
  "reconcile-teardown-outcome",
  "reconcile-terminal-state",
  "reconcile-authoritative-absence",
  "reconcile-fixed-root-removal",
];
export const completionRecovery = [
  "fence-attempt",
  "lookup-fenced-attempt",
  "reopen-stored-completion",
  "replay-exact-stored-completion",
];

export function buildReconciliationFixture() {
  const primaryFailureCases = [];
  for (const [index, effect] of nominalEffects.entries()) {
    const sequence = index + 1;
    for (const failure of failureKinds) {
      const processCreated = sequence >= 3;
      const trace = sequence >= 12
        ? completionRecovery
        : processCreated ? createdRecovery : ["record-unresolved-cleanup"];
      primaryFailureCases.push({ sequence, effect, failure, processCreated, trace: [...trace] });
    }
  }
  const createdRecoveryFailureCases = createdRecovery.map((failedStep, index) => ({
    failedStep,
    trace: [...createdRecovery.slice(0, index + 1), "record-unresolved-cleanup"],
    rootRemovalAllowed: index > createdRecovery.indexOf("reconcile-authoritative-absence"),
    terminalDisposition: "unresolved-cleanup-durable",
  }));
  const completionRecoveryFailureCases = completionRecovery.map((failedStep, index) => ({
    failedStep,
    trace: [...completionRecovery.slice(0, index + 1), "record-unresolved-cleanup"],
    storedCompletionDelivered: false,
    terminalDisposition: "unresolved-cleanup-durable",
  }));
  const teardownOutcomeCases = failureKinds.map((outcome) => ({
    outcome,
    requestCount: 1,
    trace: [...createdRecovery],
    nonIdempotentEffectRedriven: false,
  }));
  return {
    objectType: "capsule.c5b11.reconciliation-matrix",
    objectVersion: 1,
    performed: false,
    primaryFailureCases,
    createdRecoveryFailureCases,
    completionRecoveryFailureCases,
    teardownOutcomeCases,
    durableRecordFailure: {
      attemptRemainsFenced: true,
      cleanupResolved: false,
      terminalDisposition: "recovery-required-no-success",
    },
  };
}

export function validateReconciliationFixture(value) {
  assert.deepEqual(value, buildReconciliationFixture(), "exhaustive reconciliation state matrix");
  for (const item of value.primaryFailureCases.filter(({ processCreated, sequence }) =>
    processCreated && sequence < 12)) {
    assert.deepEqual(item.trace, createdRecovery, `${item.effect}/${item.failure} convergence`);
    assert.equal(item.trace.indexOf("reconcile-terminal-state") <
      item.trace.indexOf("reconcile-authoritative-absence"), true, "terminal before absence");
    assert.equal(item.trace.indexOf("reconcile-authoritative-absence") <
      item.trace.indexOf("reconcile-fixed-root-removal"), true, "absence before root removal");
  }
  for (const item of value.primaryFailureCases.filter(({ sequence }) => sequence >= 12)) {
    assert.deepEqual(item.trace, completionRecovery, `${item.effect}/${item.failure} stored replay`);
  }
  for (const item of value.teardownOutcomeCases) {
    assert.equal(item.requestCount, 1, `${item.outcome} teardown requested once`);
    assert.equal(item.nonIdempotentEffectRedriven, false, `${item.outcome} no redrive`);
  }
  for (const item of [...value.createdRecoveryFailureCases, ...value.completionRecoveryFailureCases]) {
    assert.equal(item.trace.at(-1), "record-unresolved-cleanup", `${item.failedStep} durable unresolved`);
  }
  assert.deepEqual(value.durableRecordFailure, {
    attemptRemainsFenced: true,
    cleanupResolved: false,
    terminalDisposition: "recovery-required-no-success",
  }, "durable unresolved record failure remains fenced");
  return true;
}
