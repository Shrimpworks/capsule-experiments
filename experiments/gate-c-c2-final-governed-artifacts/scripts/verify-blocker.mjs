#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [corp, experiments, deno, rustyV8, libkrun] = process.argv.slice(2);
if (![corp, experiments, deno, rustyV8, libkrun].every(Boolean)) {
  console.error("usage: verify-blocker.mjs CORP EXPERIMENTS DENO RUSTY_V8 LIBKRUN");
  process.exit(2);
}

const expected = {
  c1: { size: 9289, sha256: "d5d75e638a15be6c9f4a3230d17309d085f6ec103a73b64d9e0fd656a5423c9e" },
  c2a: { size: 26850, sha256: "d4ce88888186266f5d251e6246c889b1fd46d7746bb0ba56bcc4b3ce4675992f" },
  candidateSelf: "78cf2e99e58a4e79413f22889dd19f794ac7cdce3e4ec5c167d6c2051d19afaa",
  evidenceMerge: "fa03d7043b4f0653081d6c5733d597f49f6efd1c",
  evidenceTree: "f80775335232ff4750f62998e5cc4d8e120ce90e",
  deno: {
    head: "9adb0b68b55bca81644827f1e7749a3acb091bed",
    tree: "72edd0f7b5f83b918945860653714e344c8a303f",
    merge: "ea18b9dc21ff8ebd19347be7095f47937ee14ec2",
    parents: ["14eea3160ae5834476aa3b9d317b8d41d991b982", "9adb0b68b55bca81644827f1e7749a3acb091bed"],
  },
  rustyV8: {
    head: "80e863ddb942a4aa2b384e794fc23e35b9d2bb15",
    tree: "d8950a7a1ee907761720b23d24eaa9b63aa33b10",
    merge: "cbf56de2e1156b1cf1561fdbaea7172a0aa056f4",
    parents: ["eddede228a9214c4dfb6a85aeca22abc0679100d", "80e863ddb942a4aa2b384e794fc23e35b9d2bb15"],
  },
  libkrun: {
    head: "8a2c91943793668f31a1cf7af431933be935bb58",
    tree: "ffa4131ddcc6ec66edd623381dae94189ccd3fee",
    merge: "cf0333cdba478cc34a8570a65b38412da7fd3ecc",
    parents: ["4ea8d1de861ed1c0636fc800b6da8fb71a086aa5", "8a2c91943793668f31a1cf7af431933be935bb58"],
  },
  runtimeHarness: "2797c74c1aedb599661110e8d7c093a4868bf17490ad5bf44952eb7416067de7",
  runtimeNominalSource: "a236a49337021c709875a6e921910418f8801b78627e504aaf93a5bb636622ca",
  runtimeInput: "dcca912dd4ddd9c93c1efd3e6aecf33dd2d0c0ef75b36d0b8acf89cae752264a",
  c2aSource: "c8e940feb89b342de2d5e6bd13c413226676de9a539fce34c4107516e635b475",
  c2aInput: "9de0c909cfb111bd99c3b0b5f7a10972894270c2867022a71b6b6f3c0cd1af6e",
  patchAggregate: "d19fd0ff159c699acccda2621519de45a09408bf3847b418ac34e02b79e805d5",
};

function refuse(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readExact(path, identity, label) {
  const bytes = readFileSync(path);
  refuse(bytes.length === identity.size, `${label} size mismatch`);
  refuse(sha256(bytes) === identity.sha256, `${label} digest mismatch`);
  return bytes;
}

function git(repo, args, encoding = "utf8") {
  return execFileSync("git", ["-C", repo, ...args], { encoding, stdio: ["ignore", "pipe", "pipe"] });
}

function verifyGitIdentity(repo, identity, label) {
  refuse(git(repo, ["rev-parse", `${identity.head}^{commit}`]).trim() === identity.head, `${label} head absent`);
  refuse(git(repo, ["rev-parse", `${identity.head}^{tree}`]).trim() === identity.tree, `${label} tree mismatch`);
  const parents = git(repo, ["show", "-s", "--format=%P", identity.merge]).trim().split(" ");
  refuse(JSON.stringify(parents) === JSON.stringify(identity.parents), `${label} merge parents mismatch`);
  for (const parent of identity.parents) {
    execFileSync("git", ["-C", repo, "merge-base", "--is-ancestor", parent, identity.merge]);
  }
}

const c1Path = join(corp, "schemas/conformance/c1-governed-deno-core/controlled-development-profile.json");
const c2aPath = join(corp, "schemas/conformance/c2a-governed-deno-core/passive-execution-profile.json");
readExact(c1Path, expected.c1, "C1 fixture");
const c2aBytes = readExact(c2aPath, expected.c2a, "C2A fixture");
const c2a = JSON.parse(c2aBytes);
refuse(sha256(Buffer.from(c2a.knownAnswer.source.utf8)) === expected.c2aSource, "C2A source mismatch");
refuse(sha256(Buffer.from(c2a.knownAnswer.canonicalInput.utf8)) === expected.c2aInput, "C2A input mismatch");

const candidatePath = join(corp, "schemas/conformance/governed-deno-core-release-candidate/candidate-manifest.json");
const candidateBytes = readFileSync(candidatePath);
const candidateText = candidateBytes.toString("utf8");
const candidate = JSON.parse(candidateText);
refuse(candidate.selfDigest.sha256 === expected.candidateSelf, "candidate self-digest field mismatch");
const needle = `    "sha256": "${expected.candidateSelf}"\n  },\n  "status"`;
refuse(candidateText.split(needle).length === 2, "candidate self-digest encoding mismatch");
refuse(sha256(Buffer.from(candidateText.replace(needle, `    "sha256": "${"0".repeat(64)}"\n  },\n  "status"`))) === expected.candidateSelf, "candidate self-digest mismatch");
refuse(candidate.evidence.mergeCommit === expected.evidenceMerge, "candidate evidence merge mismatch");
refuse(candidate.evidence.mergeTree === expected.evidenceTree, "candidate evidence tree mismatch");

refuse(git(experiments, ["rev-parse", `${expected.evidenceMerge}^{tree}`]).trim() === expected.evidenceTree, "evidence merge tree mismatch");
const harnessPath = "experiments/gate-c-deno-core-physical-omission/probe/src/main.rs";
const fixtureBase = "experiments/gate-c-deno-core-physical-omission/fixtures";
const harness = git(experiments, ["show", `${expected.evidenceMerge}:${harnessPath}`], null);
const nominal = git(experiments, ["show", `${expected.evidenceMerge}:${fixtureBase}/nominal.js`], null);
const runtimeInput = git(experiments, ["show", `${expected.evidenceMerge}:${fixtureBase}/input.json`], null);
refuse(sha256(harness) === expected.runtimeHarness, "runtime harness digest mismatch");
refuse(sha256(nominal) === expected.runtimeNominalSource, "runtime nominal source digest mismatch");
refuse(sha256(runtimeInput) === expected.runtimeInput, "runtime input digest mismatch");
const harnessText = harness.toString("utf8");
for (const requiredText of [
  "const FIXED_INPUT: &str = include_str!",
  "const FIXED_SOURCES: [&str; 5]",
  "if !FIXED_SOURCES.contains(&source.as_str())",
  "source is not an exact retained Capsule fixture",
  "if input_text != FIXED_INPUT",
  "input is not the exact retained Capsule fixture",
]) {
  refuse(harnessText.includes(requiredText), `runtime refusal seam missing: ${requiredText}`);
}
const sourceFixtures = [...harnessText.matchAll(/include_str!\("\.\.\/\.\.\/fixtures\/([^"\n]+\.(?:js|ts))"\)/g)]
  .map((match) => `${fixtureBase}/${match[1]}`);
refuse(sourceFixtures.length === 5, "runtime fixed-source fixture count mismatch");
for (const name of sourceFixtures) {
  const bytes = git(experiments, ["show", `${expected.evidenceMerge}:${name}`], null);
  refuse(sha256(bytes) !== expected.c2aSource, `C2A source unexpectedly accepted by ${name}`);
}
refuse(sha256(runtimeInput) !== expected.c2aInput, "C2A input unexpectedly accepted");

verifyGitIdentity(deno, expected.deno, "Deno");
verifyGitIdentity(rustyV8, expected.rustyV8, "rusty_v8");
verifyGitIdentity(libkrun, expected.libkrun, "libkrun");

const queuePath = join(libkrun, "governance/capsule-v1.19.4/PATCH_QUEUE.json");
const queue = JSON.parse(readFileSync(queuePath));
let canonicalPatchIdentity = "";
for (const patch of queue.patches) {
  const bytes = readFileSync(join(libkrun, "governance/capsule-v1.19.4", patch.file));
  refuse(sha256(bytes) === patch.sha256, `libkrun patch digest mismatch: ${patch.file}`);
  canonicalPatchIdentity += `${String(patch.order).padStart(4, "0")}:${patch.sha256}\n`;
}
refuse(sha256(Buffer.from(canonicalPatchIdentity)) === expected.patchAggregate, "libkrun patch aggregate mismatch");
refuse(queue.patchSetIdentity.value === expected.patchAggregate, "libkrun queue aggregate field mismatch");

const blocked = JSON.parse(readFileSync(join(experiments, "experiments/gate-c-c2-final-governed-artifacts/manifests/blocked-construction.json")));
refuse(blocked.status === "BLOCKED", "blocked manifest status mismatch");
refuse(blocked.requiredArtifacts.length === 9, "required artifact count mismatch");
refuse(blocked.requiredArtifacts.every((artifact) => artifact.size === null && artifact.sha256 === null), "a final artifact identity is non-null");
refuse(blocked.composedProfile.identity === null && blocked.composedProfile.sha256 === null && blocked.composedProfile.selfDigestSha256 === null, "composed profile is non-null");

console.log(JSON.stringify({
  result: "PASS-EXPECTED-BLOCKED",
  blockingInterface: "C2_RUNTIME_FIXED_FIXTURE_MISMATCH",
  c2a: { fixtureSha256: expected.c2a.sha256, sourceSha256: expected.c2aSource, inputSha256: expected.c2aInput },
  runtime: { candidateSelfDigestSha256: expected.candidateSelf, harnessSha256: expected.runtimeHarness, sourceFixtureCount: sourceFixtures.length },
  libkrunPatchAggregateSha256: expected.patchAggregate,
  finalArtifactIdentities: "all-null",
  guestExecution: "NOT_RUN",
}, null, 2));
