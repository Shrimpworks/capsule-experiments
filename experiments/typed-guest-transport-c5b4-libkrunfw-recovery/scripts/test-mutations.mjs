#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cases = [
  ["archive-byte", "inputs/libkrunfw-prebuilt-aarch64.tgz", async (path) => { const bytes = await readFile(path); bytes[4096] ^= 1; await writeFile(path, bytes); }],
  ["artifact-byte", "artifacts/libkrunfw.5.dylib", async (path) => { const bytes = await readFile(path); bytes[4096] ^= 1; await writeFile(path, bytes); }],
  ["false-independent-build", "manifests/recovery.json", async (path) => { const value = JSON.parse(await readFile(path)); value.build.byteComparison = "DIFFERENT"; await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); }],
  ["separate-firmware-authority", "manifests/recovery.json", async (path) => { const value = JSON.parse(await readFile(path)); value.canonicalDecision.separateFirmware = "BOUND"; await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); }],
  ["false-preferred-source-closure", "manifests/recovery.json", async (path) => { const value = JSON.parse(await readFile(path)); value.sourceAvailability.preferredFormKernelSourceComplete = true; await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); }],
];

const results = [];
for (const [id, relativePath, mutate] of cases) {
  const temporary = await mkdtemp(join(tmpdir(), "capsule-c5b4-mutation-"));
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
