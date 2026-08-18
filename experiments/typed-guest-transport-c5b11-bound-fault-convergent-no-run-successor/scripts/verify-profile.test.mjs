#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateProfile } from "./verify-profile.mjs";
import { validateIndependentOracle, validateReconciliationFixture } from "./verify-reconciliation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const actualProfile = JSON.parse(readFileSync(join(root, "contracts/fixed-runner-profile.json")));
const actualMatrix = JSON.parse(readFileSync(join(root, "fixtures/reconciliation-matrix.json")));
const actualOracle = JSON.parse(readFileSync(join(root, "oracles/independent-recovery-oracle.json")));
const clone = (value) => structuredClone(value);

test("accepts the exact C5b11 profile", () => validateProfile(actualProfile));
test("accepts the oracle-derived reconciliation matrix", () =>
  validateReconciliationFixture(actualMatrix, actualOracle));
test("accepts the independent cursor and teardown oracle", () => validateIndependentOracle(actualOracle));

for (const [name, mutate, expected] of [
  ["stale C5b8 profile", (p) => { p.bindingLayers.attemptRuntimeProfile.sha256 = "06079eea39ce9a2e0547837555a6953787d8c32d614f0ec7b9b07ef408de04cd"; }, /Expected values|not equal/u],
  ["driver omitted from outer composition", (p) => { p.bindingLayers.outerComposition.bindsSupervisorDriver = false; }, /true/u],
  ["duplicate libkrun owner", (p) => { p.ownership.duplicateLibkrunOwnership = true; }, /false/u],
  ["execute request widened", (p) => { p.executionRequest.acceptedFields.push("source"); }, /registrationId/u],
  ["host present", (p) => { p.authorization.host = "host"; }, /null/u],
  ["execution authorized", (p) => { p.authorization.executionAuthorized = true; }, /false/u],
  ["effect performed", (p) => { p.performedEffects.runnerStarted = true; }, /performed effects/u],
  ["redrive allowed", (p) => { p.faultConvergence.nonIdempotentRedrive = true; }, /false/u],
  ["unresolved cleanup lost", (p) => { p.faultConvergence.unresolvedCleanupDurable = false; }, /true/u],
  ["stored replay weakened", (p) => { p.faultConvergence.replayExactBytes = false; }, /true/u],
]) {
  test(`rejects ${name}`, () => {
    const candidate = clone(actualProfile);
    mutate(candidate);
    assert.throws(() => validateProfile(candidate), expected);
  });
}

test("rejects missing absence in every process-may-exist fault path", () => {
  const candidate = clone(actualMatrix);
  for (const item of candidate.primaryFailureCases.filter(({ processMayExist, sequence }) =>
    processMayExist && sequence < 12)) {
    item.trace = item.trace.filter((step) => step !== "reconcile-authoritative-absence");
  }
  assert.throws(() => validateReconciliationFixture(candidate, actualOracle), /reconciliation matrix/u);
});

test("rejects ambiguous spawn bypass", () => {
  const candidate = clone(actualMatrix);
  for (const item of candidate.ambiguousSpawnCases) item.processMayExist = false;
  assert.throws(() => validateReconciliationFixture(candidate, actualOracle), /reconciliation matrix/u);
});

test("rejects a missing recovery-step failure crossing", () => {
  const candidate = clone(actualMatrix);
  candidate.recoveryStepFailureCases.pop();
  assert.throws(() => validateReconciliationFixture(candidate, actualOracle), /reconciliation matrix/u);
});

test("rejects contradictory immediate-unresolved teardown crossing", () => {
  const candidate = clone(actualMatrix);
  candidate.recoveryStepFailureCases.push({
    path: "created", step: 16, effect: "request-teardown-once", failure: "provider-error",
    trace: ["request-teardown-once", "record-unresolved-cleanup"],
    durableResumeStep: 17, originalEffectRedriven: false,
  });
  assert.throws(() => validateReconciliationFixture(candidate, actualOracle), /reconciliation matrix/u);
});

test("rejects teardown outcome that does not continue to reconciliation", () => {
  const candidate = clone(actualMatrix);
  candidate.teardownOutcomeCases[0].immediateUnresolved = true;
  candidate.teardownOutcomeCases[0].trace = ["request-teardown-once", "record-unresolved-cleanup"];
  assert.throws(() => validateReconciliationFixture(candidate, actualOracle), /reconciliation matrix/u);
});

test("rejects non-monotone durable recovery cursor", () => {
  const candidate = clone(actualMatrix);
  candidate.reopenRetryCases.find(({ interruptedStep }) => interruptedStep === 16)
    .durableResumeStep = 15;
  assert.throws(() => validateReconciliationFixture(candidate, actualOracle), /reconciliation matrix/u);
});

test("rejects oracle that restores immediate-unresolved teardown", () => {
  const candidate = clone(actualOracle);
  candidate.createdRecovery.find(({ step }) => step === 16).genericImmediateUnresolved = true;
  assert.throws(() => validateIndependentOracle(candidate), /false/u);
});

test("rejects a missing interruption reopen path", () => {
  const candidate = clone(actualMatrix);
  candidate.reopenRetryCases.pop();
  assert.throws(() => validateReconciliationFixture(candidate, actualOracle), /reconciliation matrix/u);
});

test("rejects missing exact stored replay in every response-loss path", () => {
  const candidate = clone(actualMatrix);
  for (const item of candidate.primaryFailureCases.filter(({ sequence }) => sequence >= 12)) {
    item.trace = item.trace.filter((step) => step !== "replay-exact-stored-completion");
  }
  assert.throws(() => validateReconciliationFixture(candidate, actualOracle), /reconciliation matrix/u);
});
