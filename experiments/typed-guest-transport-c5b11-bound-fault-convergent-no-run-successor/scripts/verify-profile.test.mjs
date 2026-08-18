#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateProfile } from "./verify-profile.mjs";
import { validateReconciliationFixture } from "./verify-reconciliation.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const actualProfile = JSON.parse(readFileSync(join(root, "contracts/fixed-runner-profile.json")));
const actualMatrix = JSON.parse(readFileSync(join(root, "fixtures/reconciliation-matrix.json")));
const clone = (value) => structuredClone(value);

test("accepts the exact C5b11 profile", () => validateProfile(actualProfile));
test("accepts the exhaustive reconciliation matrix", () => validateReconciliationFixture(actualMatrix));

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

test("rejects missing absence in every relevant fault path", () => {
  const candidate = clone(actualMatrix);
  for (const item of candidate.primaryFailureCases.filter(({ processCreated, sequence }) =>
    processCreated && sequence < 12)) {
    item.trace = item.trace.filter((step) => step !== "reconcile-authoritative-absence");
  }
  assert.throws(() => validateReconciliationFixture(candidate), /reconciliation state matrix/u);
});

test("rejects missing exact stored replay in every response-loss path", () => {
  const candidate = clone(actualMatrix);
  for (const item of candidate.primaryFailureCases.filter(({ sequence }) => sequence >= 12)) {
    item.trace = item.trace.filter((step) => step !== "replay-exact-stored-completion");
  }
  assert.throws(() => validateReconciliationFixture(candidate), /reconciliation state matrix/u);
});
