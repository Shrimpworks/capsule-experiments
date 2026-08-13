#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = JSON.parse(await fs.readFile(path.join(root, "evidence/result.json"), "utf8"));
const manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));

assert.equal(result.status, "PASSED");
assert.equal(result.parentStatus, "BLOCKED");
assert.equal(result.claimBoundary.profileSignatureGate, "PASSED");
assert.equal(result.claimBoundary.e1ContainerMatrix, "BLOCKED");
assert.equal(result.claimBoundary.adr0045, "Proposed");
assert.equal(result.profiles.rawProfilesRetainedInGit, false);
assert.equal(result.signedReadback.signedBundlesRetainedInGit, false);
assert.equal(result.signedReadback.hardenedRuntime, true);
assert.equal(result.signedReadback.appSandbox, true);
assert.equal(result.signedReadback.getTaskAllowPresent, false);
assert.equal(result.effects.explicitAppIdsCreated, 2);
assert.equal(result.effects.developmentProfilesCreated, 2);
assert.equal(result.effects.artifactsSigned, 3);
for (const [key, value] of Object.entries(result.effects)) {
  if (!["explicitAppIdsCreated", "developmentProfilesCreated", "artifactsSigned"].includes(key)) {
    assert.equal(value, false, `effect must remain false: ${key}`);
  }
}

assert.equal(
  result.signedReadback.currentSupervisor.appGroup,
  "3DDR84M4JS.com.capsulecorp.capsule.bootstrap.authority-e1",
);
assert.equal(
  result.signedReadback.currentCoordinator.appGroup,
  result.signedReadback.currentSupervisor.appGroup,
);
assert.notEqual(
  result.signedReadback.legacySupervisor.appGroup,
  result.signedReadback.currentSupervisor.appGroup,
);
assert.notEqual(
  result.signedReadback.legacySupervisor.bundleIdentifier,
  result.signedReadback.currentSupervisor.bundleIdentifier,
);

const expected = new Set(manifest.retained.map((entry) => entry.path));
const actual = new Set();
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute);
    else if (entry.isFile()) {
      const relative = path.relative(root, absolute);
      if (relative !== "manifest.json") actual.add(relative);
    } else throw new Error(`unsupported archive entry: ${absolute}`);
  }
}
await walk(root);
assert.deepEqual([...actual].sort(), [...expected].sort());
for (const entry of manifest.retained) {
  const bytes = await fs.readFile(path.join(root, entry.path));
  assert.equal(bytes.length, entry.bytes, entry.path);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256, entry.path);
}

console.log(`verified E1 signed-profile preflight: ${manifest.retained.length} retained files`);
