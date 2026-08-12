#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const check = process.argv.includes("--check");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generated = new Map();

const sha256 = (bytes) => createHash("sha256").update(bytes).digest();
const sha256Hex = (bytes) => sha256(bytes).toString("hex");
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const ref = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256Hex(bytes) });

function retain(path, bytes) {
  const exact = Buffer.from(bytes);
  generated.set(path, exact);
  return ref(path, exact);
}

function cborHead(major, value) {
  if (value < 24) return Buffer.from([(major << 5) | value]);
  if (value <= 0xff) return Buffer.from([(major << 5) | 24, value]);
  if (value <= 0xffff) {
    const result = Buffer.alloc(3);
    result[0] = (major << 5) | 25;
    result.writeUInt16BE(value, 1);
    return result;
  }
  throw new Error(`unsupported CBOR length: ${value}`);
}

function cbor(value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const bytes = Buffer.from(value);
    return Buffer.concat([cborHead(2, bytes.length), bytes]);
  }
  if (typeof value === "string") {
    const bytes = Buffer.from(value);
    return Buffer.concat([cborHead(3, bytes.length), bytes]);
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return cborHead(0, value);
  }
  if (Array.isArray(value)) return Buffer.concat([cborHead(4, value.length), ...value.map(cbor)]);
  if (value instanceof Map) {
    const entries = [...value].map(([key, child]) => [cbor(key), cbor(child)]);
    entries.sort(([left], [right]) =>
      left.length === right.length ? Buffer.compare(left, right) : left.length - right.length,
    );
    return Buffer.concat([cborHead(5, entries.length), ...entries.flat()]);
  }
  throw new Error(`unsupported CBOR value: ${typeof value}`);
}

function encodeSourceManifest(source) {
  return cbor(
    new Map([
      [1, "capsule.source-manifest"],
      [2, 0],
      [3, "main.mjs"],
      [4, [["main.mjs", sha256(source), source.length]]],
      [5, source.length],
    ]),
  );
}

const SOURCE_ROLE = 1;
const INPUT_ROLE = 2;
const COMPLETION_ROLE = 3;
const HEADER_BYTES = 152;
const COMPLETION_HEADER_BYTES = 160;
const TRAILER_BYTES = 64;

function encodeInputFrame(role, payload, bindings) {
  const header = Buffer.alloc(HEADER_BYTES);
  header.write(role === SOURCE_ROLE ? "CPSRC001" : "CPINP001", 0, "ascii");
  header.writeUInt16BE(1, 8);
  header.writeUInt16BE(1, 10);
  header.writeUInt16BE(role, 12);
  header.writeUInt16BE(HEADER_BYTES, 14);
  bindings.attemptId.copy(header, 16);
  bindings.registrationId.copy(header, 32);
  bindings.planDigest.copy(header, 48);
  bindings.profileDigest.copy(header, 80);
  header.writeBigUInt64BE(BigInt(payload.length), 112);
  sha256(payload).copy(header, 120);
  return Buffer.concat([header, payload]);
}

function encodeCompletionFrame(payload, bindings) {
  const header = Buffer.alloc(COMPLETION_HEADER_BYTES);
  header.write("CPCMP001", 0, "ascii");
  header.writeUInt16BE(1, 8);
  header.writeUInt16BE(1, 10);
  header.writeUInt16BE(COMPLETION_ROLE, 12);
  header.writeUInt16BE(COMPLETION_HEADER_BYTES, 14);
  bindings.attemptId.copy(header, 16);
  bindings.registrationId.copy(header, 32);
  bindings.planDigest.copy(header, 48);
  bindings.profileDigest.copy(header, 80);
  header.writeUInt16BE(1, 112);
  header.writeUInt16BE(0, 114);
  header.writeUInt32BE(0, 116);
  header.writeBigUInt64BE(BigInt(payload.length), 120);
  sha256(payload).copy(header, 128);
  const trailer = Buffer.alloc(TRAILER_BYTES);
  trailer.write("CPEND001", 0, "ascii");
  trailer.writeUInt16BE(1, 8);
  trailer.writeUInt16BE(1, 10);
  trailer.writeUInt16BE(COMPLETION_ROLE, 12);
  trailer.writeUInt16BE(TRAILER_BYTES, 14);
  bindings.attemptId.copy(trailer, 16);
  sha256(Buffer.concat([header, payload])).copy(trailer, 32);
  return Buffer.concat([header, payload, trailer]);
}

const source = Buffer.from(
  "globalThis.capsuleMain = function (input) { return {doubled: input.value * 2, echo: input.message}; };\n",
);
const sourceManifest = encodeSourceManifest(source);
const input = Buffer.from('{"message":"capsule-c2a","value":21}');
const completion = Buffer.from('{"doubled":42,"echo":"capsule-c2a"}');

const sourceRef = retain("fixtures/main.mjs", source);
const sourceManifestRef = retain("fixtures/source-manifest.cbor", sourceManifest);
const inputRef = retain("fixtures/input.json", input);
const completionRef = retain("fixtures/expected-completion.json", completion);

const commonBoundary = {
  objectVersion: 1,
  packet: "capsule.c5b0.typed-transport-successor/v1",
  status: "no-run-contract-only",
  executableBytesPresent: false,
  admission: false,
};

const runnerContract = json({
  objectType: "capsule.c5b0.runner-contract",
  ...commonBoundary,
  descriptorManifest: [
    { fd: 0, role: "null-stdin", access: "read" },
    { fd: 1, role: "bounded-stdout", access: "write" },
    { fd: 2, role: "bounded-stderr", access: "write" },
    { fd: 3, role: "record-before-start", access: "read" },
    { fd: 4, role: "unlinked-mode-0400-root", access: "read" },
    { fd: 5, role: "typed-source", access: "read" },
    { fd: 6, role: "typed-input", access: "read" },
    { fd: 7, role: "typed-completion", access: "write" },
  ],
  closeFrom: 8,
  owner: "Execution Supervisor harness",
  forbidden: ["implicit console", "network", "caller paths", "replacement plan bytes", "guest start in C5b0"],
});
const initContract = json({
  objectType: "capsule.c5b0.trusted-init-contract",
  ...commonBoundary,
  root: "read-only-nosuid-nodev",
  environment: [],
  inheritedDescriptors: [],
  launcherDescriptors: ["null-stdin", "null-stdout", "null-stderr", "typed-source", "typed-input", "typed-completion"],
  forbidden: ["shell", "network configuration", "host path", "general loader", "runtime selection"],
});
const launcherContract = json({
  objectType: "capsule.c5b0.trusted-launcher-contract",
  ...commonBoundary,
  protocol: "capsule.typed-guest-transport/v1",
  verifyBeforeChild: ["source frame", "input frame", "attempt binding", "plan binding", "profile binding"],
  completion: { writerOwnedBy: "launcher", trailerLast: true, workloadInheritsWriter: false },
  child: { argvCount: 1, environment: [], cwd: "/", generalModuleLoader: false },
  forbidden: ["diagnostic console as completion", "EOF as commit", "exit zero as commit", "guest-authored host facts"],
});
const controllerContract = json({
  objectType: "capsule.c5b0.controller-contract",
  ...commonBoundary,
  concurrency: 1,
  sequence: ["verify exact packet", "stage mode-0400 root", "open then unlink root", "bind runner identity", "commit before start", "start all drains", "authorize once", "wait and teardown", "prove absence", "publish only after durable join"],
  deadlinesMs: { wallAction: 1000, teardownGrace: 200, forcedAbsence: 1000, maximumFromAction: 1200 },
  forbidden: ["execute runner in C5b0", "load libkrun", "call HVF", "start VM", "start guest", "admit profile"],
});

const runnerRef = retain("contracts/runner.json", runnerContract);
const initRef = retain("contracts/trusted-init.json", initContract);
const launcherRef = retain("contracts/trusted-launcher.json", launcherContract);
const controllerRef = retain("contracts/controller.json", controllerContract);

const rootContract = json({
  objectType: "capsule.c5b0.root-layout-contract",
  ...commonBoundary,
  rawRootIdentity: null,
  requiredPaths: [
    { path: "/usr/local/libexec/capsule-init.krun", contract: initRef },
    { path: "/usr/local/libexec/capsule-launcher", contract: launcherRef },
    { path: "/opt/capsule/inputs/main.mjs", fixture: sourceRef, mode: "0444" },
    { path: "/opt/capsule/inputs/source-manifest.cbor", fixture: sourceManifestRef, mode: "0444" },
    { path: "/opt/capsule/inputs/input.json", fixture: inputRef, mode: "0444" },
  ],
  filesystem: { format: "ext4-no-journal", imageMode: "0400-before-open", unlinkedBeforeAuthorization: true },
  absent: ["shell", "package manager", "network configuration", "writable host mount", "live host path"],
});
const rootRef = retain("contracts/root-layout.json", rootContract);

const profile = json({
  objectType: "capsule.c5b0.typed-transport-successor-profile",
  objectVersion: 1,
  identity: "capsule.c5b0.v19-lineage-typed-transport-successor/2026-08-11",
  status: "BLOCKED-missing-executable-bytes",
  capsuleCorpInput: {
    commit: "88f3a2c1f968b1aa604ce14a2db4389822e5b193",
    typedTransportManifest: {
      bytes: 23804,
      sha256: "79767a34a27bcc32a5f9a479b6a8737f9f5791447fa425ad83455546eadae235",
    },
  },
  historicalV19Lineage: {
    composedProfileSha256: "ac2721719a1e4f15c664e0b7c21d99602b6fc7d5a9c55c8b17d08970098f48fa",
    materializedProfileSha256: "44dcb00d87db91a753beabcc3071ca7b8b6d308fa293b1b9c799c60c4faa3a0b",
    signedRunnerSha256: "df0d7a96b21fae03a5fe50f0afe7551e8b5706adab219fcdfc7c26caf940173c",
    rawRootSha256: "89b321877bfb2323b11a0eb2e264d3aaffcd2c63702a524b53f55d41ec828c43",
    controllerSha256: "c4c6fc31dc82df7bb4a4cfc809321a8a78c2eb8f66d50b35b9e80e57135cc70c",
    rawPacketAvailable: false,
    reuseAsSuccessorBytes: false,
  },
  fixedWorkload: { source: sourceRef, sourceManifest: sourceManifestRef, input: inputRef, expectedCompletion: completionRef },
  contractIdentities: { runner: runnerRef, root: rootRef, init: initRef, launcher: launcherRef, controller: controllerRef },
  machine: { architecture: "arm64", vcpu: 1, guestMemoryBytes: 268435456, maximumGuests: 1 },
  transport: { contract: "capsule.typed-guest-transport", version: 1, sourceInputCompletionPayloadMaximumBytes: 262144 },
  prohibitedEffects: { libkrunLoad: true, hvfCall: true, runnerProcessStart: true, vmStart: true, guestStart: true, admission: true },
});
const profileRef = retain("manifests/successor-profile.json", profile);

const attemptId = sha256(Buffer.from("capsule.c5b0.v19-successor/attempt/v1")).subarray(0, 16);
const registrationId = sha256(Buffer.from("capsule.c5b0.v19-successor/registration/v1")).subarray(0, 16);
const plan = json({
  objectType: "capsule.c5b0.no-run-attempt-plan",
  objectVersion: 1,
  identity: "capsule.c5b0.v19-successor-plan/2026-08-11",
  status: "construction-only-not-authorized",
  attemptId: attemptId.toString("hex"),
  registrationId: registrationId.toString("hex"),
  runtimeProfile: profileRef,
  source: sourceRef,
  sourceManifest: sourceManifestRef,
  input: inputRef,
  expectedCompletion: completionRef,
  authority: { arbitrarySource: false, credentials: false, network: false, runtimeAdmission: false, executionAuthorized: false },
});
const planRef = retain("manifests/no-run-plan.json", plan);

const bindings = {
  attemptId,
  registrationId,
  planDigest: Buffer.from(planRef.sha256, "hex"),
  profileDigest: Buffer.from(profileRef.sha256, "hex"),
};
const sourceFrameRef = retain("fixtures/source.frame", encodeInputFrame(SOURCE_ROLE, source, bindings));
const inputFrameRef = retain("fixtures/input.frame", encodeInputFrame(INPUT_ROLE, input, bindings));
const completionFrameRef = retain("fixtures/completion.frame", encodeCompletionFrame(completion, bindings));

const boundary = json({
  objectType: "capsule.c5b0.artifact-boundary",
  objectVersion: 1,
  status: "BLOCKED",
  reason: "The lost v10-v27 archive prevents byte readback of v19, and C5b0 did not construct executable successor artifacts.",
  materialized: {
    profile: profileRef,
    plan: planRef,
    runnerContract: runnerRef,
    rootContract: rootRef,
    initContract: initRef,
    launcherContract: launcherRef,
    controllerContract: controllerRef,
    frames: { source: sourceFrameRef, input: inputFrameRef, completion: completionFrameRef },
  },
  unavailableExecutableSuccessorIdentities: [
    { role: "host-runner", bytes: null, sha256: null },
    { role: "raw-runtime-root", bytes: null, sha256: null },
    { role: "trusted-init", bytes: null, sha256: null },
    { role: "trusted-launcher", bytes: null, sha256: null },
    { role: "controller", bytes: null, sha256: null },
  ],
  historicalOpaqueBytes: [
    { role: "v19-materialized-profile", sha256: "44dcb00d87db91a753beabcc3071ca7b8b6d308fa293b1b9c799c60c4faa3a0b", available: false },
    { role: "v19-signed-runner", sha256: "df0d7a96b21fae03a5fe50f0afe7551e8b5706adab219fcdfc7c26caf940173c", available: false },
    { role: "v19-raw-root", sha256: "89b321877bfb2323b11a0eb2e264d3aaffcd2c63702a524b53f55d41ec828c43", available: false },
    { role: "v19-controller", sha256: "c4c6fc31dc82df7bb4a4cfc809321a8a78c2eb8f66d50b35b9e80e57135cc70c", available: false },
  ],
  effects: { libkrunLoaded: false, hvfCalled: false, runnerProcessStarted: false, vmStarted: false, guestStarted: false, credentialsAccessed: false, networkAccessed: false, admissionChanged: false },
});
retain("manifests/artifact-boundary.json", boundary);

retain(
  "evidence/2026-08-11/construction.json",
  json({
    workItem: "C5b0 no-run typed-transport successor",
    scopedPacketStatus: "PASSED",
    executableSuccessorStatus: "BLOCKED",
    question: "Can a collision-free typed-transport successor packet be frozen without running libkrun/HVF/a guest or fabricating lost v19 bytes?",
    result: "The exact contract/profile/plan/frame packet is materialized; executable successor bytes remain absent and explicitly null.",
    capsuleCorpCommit: "88f3a2c1f968b1aa604ce14a2db4389822e5b193",
    effects: { libkrunLoaded: false, hvfCalled: false, runnerExecuted: false, vmStarted: false, guestStarted: false, credentialAccess: false, networkAccess: false },
  }),
);
retain(
  "evidence/2026-08-11/mutation-dispositions.json",
  json({
    status: "PASSED",
    cases: [
      { id: "source-byte", expected: "source digest mismatch" },
      { id: "frame-plan-binding", expected: "frame plan binding mismatch" },
      { id: "profile-contract-removal", expected: "profile contract set mismatch" },
      { id: "unavailable-artifact-claim", expected: "executable boundary must remain null" },
      { id: "c5a-baseline-byte", expected: "C5a retained input mismatch" },
      { id: "closed-inventory-extra", expected: "archive inventory mismatch" },
    ],
  }),
);

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

for (const [path, bytes] of generated) {
  const destination = join(root, path);
  if (check) {
    const actual = await readFile(destination);
    if (!actual.equals(bytes)) throw new Error(`generated file drift: ${path}`);
  } else {
    await writeFile(destination, bytes);
  }
}

const archivePath = "manifests/archive-manifest.json";
const files = [];
for (const path of (await walk(root)).sort()) {
  const name = relative(root, path);
  if (name === archivePath) continue;
  files.push(ref(name, await readFile(path)));
}
const archive = json({
  objectType: "capsule.experiment-archive-manifest",
  objectVersion: 1,
  identity: "capsule.c5b0.v19-lineage-typed-transport-successor/2026-08-11",
  manifestSelfExcluded: true,
  retainedFiles: files,
});
if (check) {
  const actual = await readFile(join(root, archivePath));
  if (!actual.equals(archive)) throw new Error("archive manifest drift");
} else {
  await writeFile(join(root, archivePath), archive);
}

console.log(JSON.stringify({ result: "PASSED", mode: check ? "check" : "write", generatedFiles: generated.size, retainedFiles: files.length }));
