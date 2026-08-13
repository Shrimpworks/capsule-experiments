#!/usr/bin/env node
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const original = JSON.parse(await fs.readFile(path.join(root, "evidence/result.json"), "utf8"));
const cases = [
  ["portal-app-group-created", (value) => (value.effects.portalAppGroupCreated = true)],
  ["rewritten-group-prefix", (value) => (value.signedReadback.currentSupervisor.appGroup = `group.${value.signedReadback.currentSupervisor.appGroup}`)],
  ["raw-profile-retained", (value) => (value.profiles.rawProfilesRetainedInGit = true)],
  ["bundle-launched", (value) => (value.effects.bundleLaunched = true)],
  ["container-accessed", (value) => (value.effects.containerAccessed = true)],
  ["keychain-accessed", (value) => (value.effects.keychainItemAccessed = true)],
  ["accepted-adr", (value) => (value.claimBoundary.adr0045 = "Accepted")],
  ["passed-container-matrix", (value) => (value.claimBoundary.e1ContainerMatrix = "PASSED")],
];

for (const [name, mutate] of cases) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "capsule-e1-profile-mutation."));
  try {
    await fs.cp(root, temporary, { recursive: true });
    const candidate = JSON.parse(JSON.stringify(original));
    mutate(candidate);
    await fs.writeFile(path.join(temporary, "evidence/result.json"), `${JSON.stringify(candidate, null, 2)}\n`);
    const verification = spawnSync(process.execPath, [path.join(temporary, "scripts/verify.mjs")], {
      encoding: "utf8",
    });
    assert.notEqual(verification.status, 0, `${name} unexpectedly passed`);
    console.log(`refused mutation: ${name}`);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
