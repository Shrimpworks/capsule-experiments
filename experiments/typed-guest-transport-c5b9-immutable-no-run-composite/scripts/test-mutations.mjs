#!/usr/bin/env node

import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyCandidate } from "./verify-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = resolve(root, "..", "..");
verifyCandidate(root, repository, { verifyPredecessors: false });
const cases = [
  ["component-digest", (p) => { p.components.libkrun.sha256 = "0".repeat(64); }, /libkrun digest/],
  ["root-size", (p) => { p.components.runtimeRoot.bytes += 1; }, /runtime root size/],
  ["controller-abi", (p) => { p.abi.effectUndefinedController.pop(); }, /controller ABI/],
  ["libkrun-abi", (p) => { p.abi.libkrunExportsCoverImports = false; }, /ABI export/],
  ["operation-provider", (p) => { p.abi.fixedOperationPort.provider = "test-double"; }, /operation port/],
  ["execution-authorization", (p) => { p.authorization.executionAuthorized = true; }, /authorization/],
  ["caller-authority", (p) => { p.authorization.callerSelectedAuthority = true; }, /authorization/],
  ["guest-effect", (p) => { p.effects.guestStarted = true; }, /effects/],
  ["transport-cap", (p) => { p.transport.payloadMaximumBytes += 1; }, /payload cap/],
  ["completion-last", (p) => { p.transport.completionLast = false; }, /completion-last/],
  ["teardown-order", (p) => { p.transport.teardownOrder.reverse(); }, /teardown/],
  ["historical-identity-reuse", (p) => { p.historicalV19V27.identityReused = true; }, /historical/],
  ["predecessor-substitution", (p) => { p.predecessors.c5b8RootBinding = "0".repeat(40); }, /Expected values/],
];
for (const [name, mutate, expected] of cases) {
  const temp = mkdtempSync(join(tmpdir(), `capsule-c5b9-${name}-`));
  try {
    cpSync(root, temp, { recursive: true });
    const path = join(temp, "contracts/composite-profile.json");
    const profile = JSON.parse(readFileSync(path)); mutate(profile);
    writeFileSync(path, `${JSON.stringify(profile, null, 2)}\n`);
    assert.throws(() => verifyCandidate(temp, repository, { verifyPredecessors: false }), expected, name);
  } finally { rmSync(temp, { recursive: true, force: true }); }
}

const extraInventory = mkdtempSync(join(tmpdir(), "capsule-c5b9-closed-inventory-extra-"));
try {
  cpSync(root, extraInventory, { recursive: true });
  writeFileSync(join(extraInventory, "undeclared.txt"), "unexpected\n");
  assert.throws(
    () => verifyCandidate(extraInventory, repository, { verifyPredecessors: false }),
    /archive inventory mismatch/,
    "closed-inventory-extra",
  );
} finally { rmSync(extraInventory, { recursive: true, force: true }); }

console.log(`passed ${cases.length + 1} C5b9 mutations`);
