#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const original = JSON.parse(readFileSync(join(root, "manifests/recovery-plan.json"), "utf8"));
const clone = () => JSON.parse(JSON.stringify(original));
const refuses = (plan) => {
  const r = plan.artifacts.denoCoreExecutable;
  const f = plan.artifacts.libkrunfw;
  const k = plan.artifacts.kernel;
  return plan.repositoryBaseline === "5a2f835e8c9df8279237f940f5af757e119593bd" &&
    plan.capsuleSource === "22acf665797e248028c2625586322f698bc2ba74" &&
    plan.exactByteRecoveryStatus === "BLOCKED" &&
    plan.completeExecutableSuccessorStatus === "BLOCKED" &&
    plan.controlledExecutionStatus === "BLOCKED" &&
    r.requiredSha256 === "e781a90236cdf1272a9a16189c6be033164fa25a5aa9e52376ef998982ec0a77" &&
    r.retainedBytesAvailable === false &&
    f.requiredSha256 === "0b14f4b8005dafd33c38df5935b9efdb6381c724224b3967ba1cecbecf10b6e9" &&
    f.retainedBytesAvailable === false &&
    k.disposition === "EVIDENCE_ONLY" &&
    plan.artifacts.separateFirmware.disposition === "INAPPLICABLE" &&
    plan.runtimeReconstruction.rustyV8.archive.available === true &&
    plan.runtimeReconstruction.rustyV8.binding.available === true &&
    plan.runtimeReconstruction.builder.imageAvailable === false &&
    plan.libkrunfwReconstruction.allAcquisitionInputsAvailable === false;
};

const mutations = [
  ["movable-baseline", (x) => { x.repositoryBaseline = "main"; }],
  ["invent-runtime-bytes", (x) => { x.artifacts.denoCoreExecutable.retainedBytesAvailable = true; }],
  ["wrong-runtime-digest", (x) => { x.artifacts.denoCoreExecutable.requiredSha256 = "0".repeat(64); }],
  ["invent-libkrunfw-bytes", (x) => { x.artifacts.libkrunfw.retainedBytesAvailable = true; }],
  ["promote-derived-kernel", (x) => { x.artifacts.kernel.disposition = "RUNTIME_INPUT"; }],
  ["invent-separate-firmware", (x) => { x.artifacts.separateFirmware.disposition = "AVAILABLE"; }],
  ["remove-recovered-rusty-v8-input", (x) => { x.runtimeReconstruction.rustyV8.archive.available = false; }],
  ["false-executable-claim", (x) => { x.completeExecutableSuccessorStatus = "PASSED"; }],
];

if (!refuses(original)) throw new Error("canonical plan does not satisfy refusal predicate");
for (const [name, mutate] of mutations) {
  const candidate = clone();
  mutate(candidate);
  if (refuses(candidate)) throw new Error(`mutation unexpectedly accepted: ${name}`);
  console.log(`${name}=REFUSED`);
}
console.log(`mutationCount=${mutations.length}`);
