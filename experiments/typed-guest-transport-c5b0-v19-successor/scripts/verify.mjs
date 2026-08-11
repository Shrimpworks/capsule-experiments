#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(process.argv[2] ?? defaultRoot);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest();
const sha256Hex = (bytes) => sha256(bytes).toString("hex");

function refuse(condition, message) {
  if (!condition) throw new Error(message);
}

async function exact(path, bytes, digest) {
  const value = await readFile(join(root, path));
  refuse(value.length === bytes && sha256Hex(value) === digest, `${path}: C5a retained input mismatch`);
  return value;
}

async function json(path) {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

function keys(value, expected, label) {
  refuse(
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort()),
    `${label}: closed key set mismatch`,
  );
}

const c5aExpected = {
  "inputs/c5a/manifest.json": [23804, "79767a34a27bcc32a5f9a479b6a8737f9f5791447fa425ad83455546eadae235"],
  "inputs/c5a/accept-source-ordinary.bin": [254, "b2c078bd69eb05a961ad6e61d75b204c88582582bc7cd03216dcd2c2a09160c3"],
  "inputs/c5a/accept-input-ordinary.bin": [188, "686dbc7ed9547fff8af344001a05ea683ff7b30e4d7d56ff0ee101d3bef0719e"],
  "inputs/c5a/accept-completion-succeeded.bin": [259, "37a59e181d4a6be1b09eac4c469747ee296f225d8a8fa786ffe93ea6ebeeac00"],
  "inputs/c5a/payload-source-ordinary.bin": [102, "6cec48e6a12bc1ae24f4b724ccf2c393388cabd3cd96c9b5f65990e4408856a1"],
  "inputs/c5a/payload-input-ordinary.bin": [36, "9de0c909cfb111bd99c3b0b5f7a10972894270c2867022a71b6b6f3c0cd1af6e"],
  "inputs/c5a/payload-completion-ordinary.bin": [35, "bb7234ee486b0fbccc2091859ec93499e6a14ea7d6e091cdef60a0e2a6e8371c"],
};
for (const [path, [bytes, digest]] of Object.entries(c5aExpected)) await exact(path, bytes, digest);

const c5a = await json("inputs/c5a/manifest.json");
refuse(c5a.contract === "capsule.typed-guest-transport" && c5a.version === 1, "C5a contract mismatch");
refuse(c5a.effects && Object.values(c5a.effects).every((effect) => effect === false), "C5a effect mismatch");

const source = await readFile(join(root, "fixtures/main.mjs"));
refuse(source.length === 103, "source length mismatch");
refuse(sha256Hex(source) === "c8e940feb89b342de2d5e6bd13c413226676de9a539fce34c4107516e635b475", "source digest mismatch");
const sourceManifest = await readFile(join(root, "fixtures/source-manifest.cbor"));
refuse(sourceManifest.length === 89, "SourceManifest length mismatch");
refuse(sha256Hex(sourceManifest) === "712b1bd9739e4f6b0b027600207cbb08fb21b159a57bd34a15cf0ff8f32661b0", "SourceManifest digest mismatch");
const input = await readFile(join(root, "fixtures/input.json"));
const completion = await readFile(join(root, "fixtures/expected-completion.json"));
refuse(input.toString() === '{"message":"capsule-c2a","value":21}', "input bytes mismatch");
refuse(completion.toString() === '{"doubled":42,"echo":"capsule-c2a"}', "completion bytes mismatch");

const profileBytes = await readFile(join(root, "manifests/successor-profile.json"));
const profile = JSON.parse(profileBytes);
keys(
  profile,
  ["objectType", "objectVersion", "identity", "status", "capsuleCorpInput", "historicalV19Lineage", "fixedWorkload", "contractIdentities", "machine", "transport", "prohibitedEffects"],
  "profile",
);
refuse(profile.status === "BLOCKED-missing-executable-bytes", "profile must remain blocked");
refuse(profile.historicalV19Lineage.composedProfileSha256 === "ac2721719a1e4f15c664e0b7c21d99602b6fc7d5a9c55c8b17d08970098f48fa", "v19 lineage mismatch");
refuse(profile.historicalV19Lineage.rawPacketAvailable === false && profile.historicalV19Lineage.reuseAsSuccessorBytes === false, "lost v19 bytes must remain unavailable");
refuse(
  JSON.stringify(Object.keys(profile.contractIdentities).sort()) ===
    JSON.stringify(["controller", "init", "launcher", "root", "runner"]),
  "profile contract set mismatch",
);
refuse(Object.values(profile.prohibitedEffects).every((value) => value === true), "profile prohibition mismatch");

for (const [role, path] of Object.entries({
  runner: "contracts/runner.json",
  root: "contracts/root-layout.json",
  init: "contracts/trusted-init.json",
  launcher: "contracts/trusted-launcher.json",
  controller: "contracts/controller.json",
})) {
  const bytes = await readFile(join(root, path));
  const reference = profile.contractIdentities[role];
  refuse(reference.path === path && reference.bytes === bytes.length && reference.sha256 === sha256Hex(bytes), `${role} contract identity mismatch`);
  const contract = JSON.parse(bytes);
  refuse(contract.status === "no-run-contract-only" && contract.executableBytesPresent === false && contract.admission === false, `${role} contract boundary mismatch`);
}

const planBytes = await readFile(join(root, "manifests/no-run-plan.json"));
const plan = JSON.parse(planBytes);
refuse(plan.status === "construction-only-not-authorized", "plan authorization mismatch");
refuse(plan.runtimeProfile.sha256 === sha256Hex(profileBytes), "plan profile binding mismatch");
refuse(plan.source.sha256 === sha256Hex(source) && plan.sourceManifest.sha256 === sha256Hex(sourceManifest), "plan source binding mismatch");
refuse(plan.authority.executionAuthorized === false && Object.values(plan.authority).every((value) => value === false), "plan authority mismatch");

const bindings = {
  attempt: Buffer.from(plan.attemptId, "hex"),
  registration: Buffer.from(plan.registrationId, "hex"),
  plan: sha256(planBytes),
  profile: sha256(profileBytes),
};
refuse(bindings.attempt.length === 16 && !bindings.attempt.equals(Buffer.alloc(16)), "attempt identifier mismatch");
refuse(bindings.registration.length === 16 && !bindings.registration.equals(Buffer.alloc(16)), "registration identifier mismatch");
refuse(!bindings.attempt.equals(bindings.registration), "identifier domains collide");

function frame(path, expectedRole, expectedPayload) {
  return readFile(join(root, path)).then((bytes) => {
    const completionFrame = expectedRole === 3;
    const headerBytes = completionFrame ? 160 : 152;
    const expectedMagic = expectedRole === 1 ? "CPSRC001" : expectedRole === 2 ? "CPINP001" : "CPCMP001";
    refuse(bytes.subarray(0, 8).toString("ascii") === expectedMagic, `${path}: frame magic mismatch`);
    refuse(bytes.readUInt16BE(8) === 1 && bytes.readUInt16BE(10) === 1 && bytes.readUInt16BE(12) === expectedRole, `${path}: frame method mismatch`);
    refuse(bytes.readUInt16BE(14) === headerBytes, `${path}: frame header mismatch`);
    refuse(bytes.subarray(16, 32).equals(bindings.attempt), `${path}: frame attempt binding mismatch`);
    refuse(bytes.subarray(32, 48).equals(bindings.registration), `${path}: frame registration binding mismatch`);
    refuse(bytes.subarray(48, 80).equals(bindings.plan), `${path}: frame plan binding mismatch`);
    refuse(bytes.subarray(80, 112).equals(bindings.profile), `${path}: frame profile binding mismatch`);
    const lengthOffset = completionFrame ? 120 : 112;
    const digestOffset = completionFrame ? 128 : 120;
    refuse(bytes.readBigUInt64BE(lengthOffset) === BigInt(expectedPayload.length), `${path}: payload length mismatch`);
    refuse(bytes.subarray(digestOffset, digestOffset + 32).equals(sha256(expectedPayload)), `${path}: payload digest mismatch`);
    refuse(bytes.subarray(headerBytes, headerBytes + expectedPayload.length).equals(expectedPayload), `${path}: payload mismatch`);
    if (!completionFrame) {
      refuse(bytes.length === headerBytes + expectedPayload.length, `${path}: frame length mismatch`);
      return;
    }
    refuse(bytes.readUInt16BE(112) === 1 && bytes.readUInt16BE(114) === 0 && bytes.readUInt32BE(116) === 0, `${path}: completion status mismatch`);
    const trailer = bytes.subarray(headerBytes + expectedPayload.length);
    refuse(trailer.length === 64 && trailer.subarray(0, 8).toString("ascii") === "CPEND001", `${path}: trailer mismatch`);
    refuse(trailer.readUInt16BE(8) === 1 && trailer.readUInt16BE(10) === 1 && trailer.readUInt16BE(12) === 3 && trailer.readUInt16BE(14) === 64, `${path}: trailer fields mismatch`);
    refuse(trailer.subarray(16, 32).equals(bindings.attempt), `${path}: trailer attempt mismatch`);
    refuse(trailer.subarray(32).equals(sha256(bytes.subarray(0, headerBytes + expectedPayload.length))), `${path}: trailer digest mismatch`);
  });
}
await frame("fixtures/source.frame", 1, source);
await frame("fixtures/input.frame", 2, input);
await frame("fixtures/completion.frame", 3, completion);

const boundary = await json("manifests/artifact-boundary.json");
refuse(boundary.status === "BLOCKED", "artifact boundary must remain blocked");
refuse(boundary.unavailableExecutableSuccessorIdentities.length === 5, "executable boundary role count mismatch");
refuse(
  boundary.unavailableExecutableSuccessorIdentities.every((entry) => entry.bytes === null && entry.sha256 === null),
  "executable boundary must remain null",
);
refuse(boundary.historicalOpaqueBytes.every((entry) => entry.available === false), "historical opaque bytes cannot become available by assertion");
refuse(Object.values(boundary.effects).every((effect) => effect === false), "artifact boundary effect mismatch");

async function walk(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(child)));
    else result.push(child);
  }
  return result;
}

const archive = await json("manifests/archive-manifest.json");
const archivePath = "manifests/archive-manifest.json";
const actualPaths = (await walk(root)).map((path) => relative(root, path)).filter((path) => path !== archivePath).sort();
const declaredPaths = archive.retainedFiles.map(({ path }) => path);
refuse(JSON.stringify(declaredPaths) === JSON.stringify(actualPaths), "archive inventory mismatch");
for (const entry of archive.retainedFiles) {
  const bytes = await readFile(join(root, entry.path));
  refuse(bytes.length === entry.bytes && sha256Hex(bytes) === entry.sha256, `${entry.path}: archive identity mismatch`);
}

console.log(
  JSON.stringify({
    result: "PASSED",
    scopedPacket: "PASSED",
    executableSuccessor: "BLOCKED",
    retainedFiles: archive.retainedFiles.length,
    effects: "NONE",
  }),
);
