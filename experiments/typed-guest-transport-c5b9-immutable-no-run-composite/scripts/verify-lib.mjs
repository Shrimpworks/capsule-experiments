import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { validateProfile } from "./verify-profile.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

function symbols(path) {
  const output = execFileSync("nm", ["-g", path], { encoding: "utf8" });
  const defined = [];
  const undefinedSymbols = [];
  for (const line of output.trim().split("\n")) {
    const fields = line.trim().split(/\s+/u);
    if (fields.includes("T")) defined.push(fields.at(-1));
    if (fields.includes("U")) undefinedSymbols.push(fields.at(-1));
  }
  return { defined: defined.sort(), undefinedSymbols: undefinedSymbols.sort() };
}

function filesBelow(root, current = root) {
  const output = [];
  for (const name of readdirSync(current).sort()) {
    const absolute = join(current, name);
    if (statSync(absolute).isDirectory()) output.push(...filesBelow(root, absolute));
    else if (relative(root, absolute) !== "manifests/archive-manifest.json") output.push(absolute);
  }
  return output;
}

function verifyCompletion(frame, payload, planBytes, profileBytes, attemptId) {
  assert.equal(frame.subarray(0, 8).toString("ascii"), "CPCMP001");
  assert.equal(frame.readUInt16BE(12), 3); assert.equal(frame.readUInt16BE(14), 160);
  assert.equal(frame.subarray(16, 32).toString("hex"), attemptId);
  assert.equal(frame.subarray(48, 80).toString("hex"), sha256(planBytes));
  assert.equal(frame.subarray(80, 112).toString("hex"), sha256(profileBytes));
  assert.equal(frame.readBigUInt64BE(120), BigInt(payload.length));
  assert.equal(frame.subarray(128, 160).toString("hex"), sha256(payload));
  assert.deepEqual(frame.subarray(160, 160 + payload.length), payload);
  const trailer = frame.subarray(160 + payload.length);
  assert.equal(trailer.length, 64); assert.equal(trailer.subarray(0, 8).toString("ascii"), "CPEND001");
  assert.equal(trailer.subarray(16, 32).toString("hex"), attemptId);
  assert.equal(trailer.subarray(32).toString("hex"), sha256(Buffer.concat([frame.subarray(0, 160), payload])));
}

export function verifyCandidate(candidateRoot, repositoryRoot = resolve(candidateRoot, "..", ".."), { verifyPredecessors = true } = {}) {
  const profilePath = join(candidateRoot, "contracts/composite-profile.json");
  const planPath = join(candidateRoot, "contracts/no-run-composite.json");
  const profile = readJson(profilePath);
  const plan = readJson(planPath);
  validateProfile(profile);
  assert.deepEqual(profile.predecessors, {
    c5b2: "5a2f835e8c9df8279237f940f5af757e119593bd",
    c5b4: "068e221dafa7cf3e9a945cee7e8bf077eeed1c6b",
    c5b7: "78485fb91a31733c568fe43e5fa295474e5956e1",
    c5b8RootBinding: "b0819d76883eb86cbbc03b2b7033fe55bedbf713",
  });
  for (const [name, reference] of Object.entries(profile.components)) {
    const bytes = readFileSync(join(repositoryRoot, reference.path));
    assert.equal(bytes.length, reference.bytes, `${name} bytes`);
    assert.equal(sha256(bytes), reference.sha256, `${name} digest`);
  }

  const controllerSymbols = symbols(join(repositoryRoot, profile.components.controller.path));
  const effectSymbols = symbols(join(repositoryRoot, profile.components.rootBoundEffects.path));
  const runnerSymbols = symbols(join(repositoryRoot, profile.components.hostRunner.path));
  const libkrunSymbols = symbols(join(repositoryRoot, profile.components.libkrun.path));
  assert.deepEqual(controllerSymbols.defined, profile.abi.controllerDefined);
  assert.deepEqual(controllerSymbols.undefinedSymbols, []);
  assert.deepEqual(effectSymbols.undefinedSymbols.filter((name) => name.startsWith("_c5b3_")), profile.abi.effectUndefinedController);
  assert.deepEqual(effectSymbols.undefinedSymbols.filter((name) => name.startsWith("_krun_")), profile.abi.effectLibkrunImports);
  assert.deepEqual(effectSymbols.undefinedSymbols.filter((name) => name === "_c5b8_controlled_test_operation"), [profile.abi.fixedOperationPort.symbol]);
  assert.deepEqual(runnerSymbols.undefinedSymbols.filter((name) => name.startsWith("_krun_")), profile.abi.runnerLibkrunImports);
  const exports = new Set(libkrunSymbols.defined);
  assert.equal(profile.abi.libkrunSymbols.every((name) => exports.has(name)), true, "libkrun ABI export coverage");
  assert.deepEqual(effectSymbols.undefinedSymbols, [
    ...profile.abi.effectUndefinedController,
    profile.abi.fixedOperationPort.symbol,
    ...profile.abi.effectLibkrunImports,
  ].sort(), "closed effect-object undefined surface");

  assert.equal(plan.objectType, "capsule.c5b9.no-run-composite-plan");
  assert.equal(plan.compositeProfile.sha256, sha256(readFileSync(profilePath)));
  assert.deepEqual(plan.authorization, profile.authorization);
  const predecessorRoot = join(repositoryRoot, "experiments/typed-guest-transport-c5b8-c5b7-root-binding-successor");
  const predecessorPlanBytes = readFileSync(join(predecessorRoot, "contracts/no-run-plan.json"));
  const predecessorProfileBytes = readFileSync(join(predecessorRoot, "contracts/root-binding-profile.json"));
  assert.equal(plan.executionPlan.sha256, sha256(predecessorPlanBytes));
  assert.equal(plan.executionProfile.sha256, sha256(predecessorProfileBytes));
  const predecessorPlan = JSON.parse(predecessorPlanBytes);
  const completion = readFileSync(join(candidateRoot, "fixtures/completion.frame"));
  const payload = readFileSync(join(repositoryRoot, "experiments/typed-guest-transport-c5b0-v19-successor/fixtures/expected-completion.json"));
  verifyCompletion(completion, payload, predecessorPlanBytes, predecessorProfileBytes, predecessorPlan.attemptId);
  assert.equal(plan.fixtures.completion.sha256, sha256(completion));

  if (verifyPredecessors) {
    for (const experiment of [
      "typed-guest-transport-c5b2-governed-input-closure",
      "typed-guest-transport-c5b4-libkrunfw-recovery",
      "typed-guest-transport-c5b7-deterministic-runtime-root",
      "typed-guest-transport-c5b8-c5b7-root-binding-successor",
    ]) {
      execFileSync(process.execPath, [join(repositoryRoot, "experiments", experiment, "scripts/verify.mjs")], {
        cwd: repositoryRoot, stdio: "pipe",
      });
    }
  }

  const manifestPath = join(candidateRoot, "manifests/archive-manifest.json");
  assert.equal(existsSync(manifestPath), true, "archive manifest missing");
  const manifest = readJson(manifestPath);
  const actual = filesBelow(candidateRoot).map((absolute) => {
    const bytes = readFileSync(absolute);
    return { path: relative(candidateRoot, absolute), bytes: bytes.length, sha256: sha256(bytes) };
  });
  assert.deepEqual(manifest.files, actual, "archive inventory mismatch");
  assert.equal(manifest.files.some(({ path }) => /\.(dylib|ext4|o)$/u.test(path)), false, "component bytes must not be duplicated");
  return { status: "PASSED", retainedFiles: actual.length, componentCount: Object.keys(profile.components).length, completionFrameSha256: sha256(completion), effects: "NONE" };
}
