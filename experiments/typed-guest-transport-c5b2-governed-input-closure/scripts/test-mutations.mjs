#!/usr/bin/env node

import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cases = [
  ["libkrun-byte", "inputs/c2b-v4/libkrun.1.dylib", async (path) => { const bytes = await readFile(path); bytes[4096] ^= 1; await writeFile(path, bytes); }],
  ["runner-byte", "inputs/c2b-v4/capsule-host-runner", async (path) => { const bytes = await readFile(path); bytes[4096] ^= 1; await writeFile(path, bytes); }],
  ["runtime-false-binding", "manifests/input-closure.json", async (path) => { const value = JSON.parse(await readFile(path)); value.governedArtifactClosure.denoCoreExecutable.retainedBytesAvailable = true; await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); }],
  ["libkrunfw-false-binding", "manifests/input-closure.json", async (path) => { const value = JSON.parse(await readFile(path)); value.governedArtifactClosure.libkrunfw.bindingStatus = "BOUND"; await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); }],
  ["firmware-path-authority", "manifests/input-closure.json", async (path) => { const value = JSON.parse(await readFile(path)); value.governedArtifactClosure.separateFirmware.bindingStatus = "BOUND"; await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); }],
  ["controller-invention", "manifests/input-closure.json", async (path) => { const value = JSON.parse(await readFile(path)); value.governedArtifactClosure.controlledTestController.path = "dist/controller"; await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); }],
  ["false-executable-claim", "manifests/input-closure.json", async (path) => { const value = JSON.parse(await readFile(path)); value.composition.executable = true; await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); }],
];

const results = [];
for (const [id, relativePath, mutate] of cases) {
  const temporary = await mkdtemp(join(tmpdir(), "capsule-c5b2-mutation-"));
  try {
    await cp(root, temporary, { recursive: true });
    await mutate(join(temporary, relativePath));
    const result = spawnSync(process.execPath, [join(temporary, "scripts/verify.mjs"), temporary], { encoding: "utf8" });
    if (result.status === 0) throw new Error(`${id}: mutation was accepted`);
    results.push({ id, disposition: "REFUSED" });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

const retained = JSON.parse(await readFile(join(root, "evidence/2026-08-12/mutation-dispositions.json")));
if (retained.status !== "PASSED" || JSON.stringify(retained.cases.map(({ id }) => id)) !== JSON.stringify(results.map(({ id }) => id))) {
  throw new Error("retained mutation inventory mismatch");
}
console.log(JSON.stringify({ result: "PASSED", cases: results }));
