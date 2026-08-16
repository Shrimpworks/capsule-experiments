#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePreflight, verifyArchiveInventory } from "./verify-profile.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = resolve(root, "..", "..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const profile = JSON.parse(await readFile(join(root, "contracts/preflight.json"), "utf8"));
validatePreflight(profile);

for (const [name, reference] of Object.entries(profile.components)) {
  const bytes = await readFile(join(repository, reference.path));
  assert.equal(bytes.length, reference.bytes, `${name} byte count`);
  assert.equal(sha256(bytes), reference.sha256, `${name} digest`);
}

const runnerSource = await readFile(join(repository, profile.components.hostRunnerSource.path), "utf8");
const adapterSource = await readFile(join(repository, profile.components.effectAdapter.path), "utf8");
const operationHeader = await readFile(join(repository, profile.components.operationHeader.path), "utf8");
assert.match(runnerSource, /CAPSULE_ROOT_BYTES UINT64_C\(134217728\)/u, "historical runner root size");
assert.match(runnerSource, /krun_start_enter\(context\)/u, "runner owns libkrun entry");
assert.match(operationHeader, /int32_t c5b8_controlled_test_operation\(/u, "fixed operation ABI");

const startEnter = adapterSource.indexOf("APPEND(C5B5_EFFECT_KRUN_START_ENTER");
const sourceWrite = adapterSource.indexOf("APPEND(C5B5_EFFECT_WRITE_SOURCE");
const inputWrite = adapterSource.indexOf("APPEND(C5B5_EFFECT_WRITE_INPUT");
assert.notEqual(startEnter, -1, "start-enter effect present");
assert.equal(startEnter < sourceWrite && startEnter < inputWrite, true,
  "start-enter precedes both frame writes");

const rootBoundSymbols = execFileSync("nm", ["-g", join(repository,
  profile.components.rootBoundEffects.path)], { encoding: "utf8" });
const runnerSymbols = execFileSync("nm", ["-g", join(repository,
  profile.components.hostRunner.path)], { encoding: "utf8" });
assert.match(rootBoundSymbols, / U _c5b8_controlled_test_operation$/mu,
  "root-bound object requires fixed operation provider");
assert.doesNotMatch(runnerSymbols, /_c5b8_controlled_test_operation/mu,
  "host runner does not implement the operation ABI");
for (const symbol of ["_krun_create_ctx", "_krun_start_enter"]) {
  assert.match(rootBoundSymbols, new RegExp(` U ${symbol}$`, "mu"),
    `root-bound object imports ${symbol}`);
  assert.match(runnerSymbols, new RegExp(` U ${symbol}$`, "mu"),
    `host runner imports ${symbol}`);
}

await verifyArchiveInventory(root);

console.log("C5b controlled-harness build-only preflight PASSED");
console.log("Direct C5b9 operation-provider binding candidate: NO_GO");
console.log("No libkrun/HVF load, runner, VM, guest, network, credential, or product mutation occurred.");
