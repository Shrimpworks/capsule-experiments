#!/usr/bin/env node

import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePreflight, verifyArchiveInventory } from "./verify-profile.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const original = JSON.parse(await readFile(join(root, "contracts/preflight.json"), "utf8"));
const cases = [
  ["execution-authorization", (p) => { p.authorization.executionAuthorized = true; }, /execution authorization/u],
  ["component-substitution", (p) => { p.components.hostRunner.sha256 = "0".repeat(64); }, /hostRunner component/u],
  ["host-root-size", (p) => { p.observedBindings.hostRunnerRootBytes = 100663296; }, /host runner root/u],
  ["host-root-digest", (p) => { p.observedBindings.hostRunnerRootSha256 = p.observedBindings.c5b9RootSha256; }, /host runner root digest/u],
  ["start-enter-order", (p) => { p.observedBindings.startEnterNominalOrdinal = 22; }, /start-enter nominal ordinal|effect ordering/u],
  ["candidate-disposition", (p) => { p.exactCandidate.disposition = "PASSED"; }, /candidate disposition/u],
  ["contradiction-removal", (p) => { p.exactCandidate.contradictions.pop(); }, /closed contradiction set/u],
  ["caller-authority", (p) => { p.requiredSuccessor.callerSelectedAuthority = true; }, /caller authority/u],
  ["guest-effect", (p) => { p.effects.guestStarted = true; }, /effects boundary/u],
];
for (const [name, mutate, pattern] of cases) {
  const profile = structuredClone(original);
  mutate(profile);
  assert.throws(() => validatePreflight(profile), pattern, name);
}

const extraInventory = await mkdtemp(join(tmpdir(), "capsule-c5b-preflight-inventory-"));
try {
  await cp(root, extraInventory, { recursive: true });
  await writeFile(join(extraInventory, "undeclared.txt"), "unexpected\n");
  await assert.rejects(() => verifyArchiveInventory(extraInventory), /closed archive inventory/u,
    "closed-inventory-extra");
} finally {
  await rm(extraInventory, { recursive: true, force: true });
}

console.log(`C5b controlled-harness mutation tests PASSED (${cases.length + 1} cases)`);
