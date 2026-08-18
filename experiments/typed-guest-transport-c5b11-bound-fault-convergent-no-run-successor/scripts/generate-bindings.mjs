#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const check = process.argv.includes("--check");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = resolve(root, "..", "..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const reference = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes) });

const registrationId = "5273186561778ee1bb8d78c7911321ce";
const attemptId = "c5ab61f60d5ddc4c00a1bf50a8669344";
const staleC5b8ProfileSha256 = "06079eea39ce9a2e0547837555a6953787d8c32d614f0ec7b9b07ef408de04cd";

async function repositoryRef(path) {
  return reference(path, await readFile(join(repository, path)));
}

async function localRef(path) {
  return reference(path, await readFile(join(root, path)));
}

const predecessorSource = await readFile(join(repository,
  "experiments/typed-guest-transport-c5b8-c5b7-root-binding-successor/fixtures/source.frame"));
const predecessorInput = await readFile(join(repository,
  "experiments/typed-guest-transport-c5b8-c5b7-root-binding-successor/fixtures/input.frame"));
const predecessorCompletion = await readFile(join(repository,
  "experiments/typed-guest-transport-c5b9-immutable-no-run-composite/fixtures/completion.frame"));

const sourcePayload = predecessorSource.subarray(152);
const inputPayload = predecessorInput.subarray(152);
const completionPayloadBytes = Number(predecessorCompletion.readBigUInt64BE(120));
const completionPayload = predecessorCompletion.subarray(160, 160 + completionPayloadBytes);

const c5b7ProfilePath = "experiments/typed-guest-transport-c5b7-deterministic-runtime-root/manifests/runtime-root-profile.json";
const c5b7ArchivePath = "experiments/typed-guest-transport-c5b7-deterministic-runtime-root/manifests/archive-manifest.json";
const c5b6ArchivePath = "experiments/typed-guest-transport-c5b6-deno-static-reproduction/manifests/archive-manifest.json";
const c5b6ReleasePath = "experiments/typed-guest-transport-c5b6-deno-static-reproduction/inputs/release-manifest.json";
const c5b6ComparisonPath = "experiments/typed-guest-transport-c5b6-deno-static-reproduction/evidence/2026-08-12/same-host-comparison.json";
const c5b4RecoveryPath = "experiments/typed-guest-transport-c5b4-libkrunfw-recovery/manifests/recovery.json";
const c5b7ProfileBytes = await readFile(join(repository, c5b7ProfilePath));
const c5b7Profile = JSON.parse(c5b7ProfileBytes);
const c5b4Recovery = JSON.parse(await readFile(join(repository, c5b4RecoveryPath)));

const runtimeProfile = {
  objectType: "capsule.c5b11.attempt-runtime-profile",
  objectVersion: 1,
  identity: "capsule.c5b11.attempt-runtime-profile/2026-08-18",
  status: "construction-only-not-authorized",
  selectedBytes: {
    fixedRunnerSource: await localRef("source/fixed_runner.c"),
    fixedRunnerObject: await localRef("dist/fixed-runner.o"),
    libkrun: await repositoryRef("experiments/typed-guest-transport-c5b2-governed-input-closure/inputs/c2b-v4/libkrun.1.dylib"),
    libkrunfw: await repositoryRef("experiments/typed-guest-transport-c5b4-libkrunfw-recovery/artifacts/libkrunfw.5.dylib"),
    runtimeRoot: await repositoryRef("experiments/typed-guest-transport-c5b7-deterministic-runtime-root/dist/runtime-root.ext4"),
  },
  rootComposition: {
    identity: c5b7Profile.identity,
    repositoryBaseline: c5b7Profile.repositoryBaseline,
    profile: reference(c5b7ProfilePath, c5b7ProfileBytes),
    archiveManifest: await repositoryRef(c5b7ArchivePath),
    root: c5b7Profile.root,
  },
  runtimeContents: {
    executable: c5b7Profile.content.runtime,
    snapshot: c5b7Profile.content.snapshot,
    runtimeBundle: c5b7Profile.sourceInputs.runtimeBundle,
  },
  provenanceInputs: {
    c5b6MergeCommit: c5b7Profile.predecessors.c5b6Runtime.mergeCommit,
    c5b6ArchiveManifest: await repositoryRef(c5b6ArchivePath),
    c5b6ReleaseManifest: await repositoryRef(c5b6ReleasePath),
    c5b6SameHostComparison: await repositoryRef(c5b6ComparisonPath),
    runtimeProvenance: c5b7Profile.sourceInputs.runtimeProvenance,
    runtimeSbom: c5b7Profile.sourceInputs.runtimeSbom,
    runtimeNoticeClosure: c5b7Profile.sourceInputs.runtimeNoticeClosure,
  },
  sourceObligations: {
    libkrunfwRecoveryManifest: await repositoryRef(c5b4RecoveryPath),
    preferredFormKernelSourceComplete: c5b4Recovery.sourceAvailability.preferredFormKernelSourceComplete,
    distributionSourceComplianceStatus: c5b4Recovery.sourceAvailability.distributionSourceComplianceStatus,
    reason: c5b4Recovery.sourceAvailability.reason,
    dependencySourceAdmission: "BLOCKED",
  },
  runtimeRoot: {
    bytes: 100663296,
    sha256: "5ad18f20cbc97c7a70ead3e795fd3649672513323041e913b0eb55b7acc88775",
  },
  authority: {
    fixedRunner: true,
    fixedRuntime: true,
    fixedRoot: true,
    callerSelectableBytes: false,
    supervisorDriverIncluded: false,
    supervisorDriverLayer: "outer-composition",
    providerProvenance: "BLOCKED",
    crossHostReproducibility: "BLOCKED",
    installedComposition: "BLOCKED",
    runtimeProfileAdmission: "BLOCKED",
  },
  executionAuthorized: false,
};
const runtimeProfileBytes = json(runtimeProfile);
const runtimeProfileRef = reference("contracts/attempt-runtime-profile.json", runtimeProfileBytes);

const attemptPlan = {
  objectType: "capsule.c5b11.registered-attempt-plan",
  objectVersion: 1,
  identity: "capsule.c5b11.registered-attempt-plan/2026-08-18",
  registrationId,
  attemptId,
  runtimeProfile: runtimeProfileRef,
  payloads: {
    source: reference("fixtures/source.payload", sourcePayload),
    input: reference("fixtures/input.payload", inputPayload),
    completion: reference("fixtures/completion.payload", completionPayload),
  },
  payloadForms: {
    source: "exact-bytes",
    input: "canonical-json-utf8-v1",
    completion: "canonical-json-utf8-v1",
  },
  acceptedExecutionFields: ["registrationId"],
  replacementBytesAccepted: false,
  executionAuthorized: false,
};
const attemptPlanBytes = json(attemptPlan);
const attemptPlanRef = reference("contracts/attempt-plan.json", attemptPlanBytes);

function sourceOrInputFrame(magic, role, payload) {
  const header = Buffer.alloc(152);
  header.write(magic, 0, 8, "ascii");
  header.writeUInt16BE(1, 8);
  header.writeUInt16BE(1, 10);
  header.writeUInt16BE(role, 12);
  header.writeUInt16BE(152, 14);
  Buffer.from(attemptId, "hex").copy(header, 16);
  Buffer.from(registrationId, "hex").copy(header, 32);
  Buffer.from(attemptPlanRef.sha256, "hex").copy(header, 48);
  Buffer.from(runtimeProfileRef.sha256, "hex").copy(header, 80);
  header.writeBigUInt64BE(BigInt(payload.length), 112);
  Buffer.from(sha256(payload), "hex").copy(header, 120);
  return Buffer.concat([header, payload]);
}

function completionFrame(payload) {
  const header = Buffer.alloc(160);
  header.write("CPCMP001", 0, 8, "ascii");
  header.writeUInt16BE(1, 8);
  header.writeUInt16BE(1, 10);
  header.writeUInt16BE(3, 12);
  header.writeUInt16BE(160, 14);
  Buffer.from(attemptId, "hex").copy(header, 16);
  Buffer.from(registrationId, "hex").copy(header, 32);
  Buffer.from(attemptPlanRef.sha256, "hex").copy(header, 48);
  Buffer.from(runtimeProfileRef.sha256, "hex").copy(header, 80);
  header.writeUInt16BE(1, 112);
  header.writeUInt16BE(0, 114);
  header.writeUInt32BE(0, 116);
  header.writeBigUInt64BE(BigInt(payload.length), 120);
  Buffer.from(sha256(payload), "hex").copy(header, 128);
  const trailer = Buffer.alloc(64);
  trailer.write("CPEND001", 0, 8, "ascii");
  trailer.writeUInt16BE(1, 8);
  trailer.writeUInt16BE(1, 10);
  trailer.writeUInt16BE(3, 12);
  trailer.writeUInt16BE(64, 14);
  Buffer.from(attemptId, "hex").copy(trailer, 16);
  Buffer.from(sha256(Buffer.concat([header, payload])), "hex").copy(trailer, 32);
  return Buffer.concat([header, payload, trailer]);
}

const sourceFrame = sourceOrInputFrame("CPSRC001", 1, sourcePayload);
const inputFrame = sourceOrInputFrame("CPINP001", 2, inputPayload);
const completion = completionFrame(completionPayload);

const byteArray = (hex) => hex.match(/../gu).map((byte) => `0x${byte}`).join(", ");
const bindingHeader = Buffer.from(`/* Generated by scripts/generate-bindings.mjs; do not edit. */
#ifndef CAPSULE_C5B11_ATTEMPT_BINDINGS_H
#define CAPSULE_C5B11_ATTEMPT_BINDINGS_H
static const uint8_t c5b11_plan_sha256[32] = { ${byteArray(attemptPlanRef.sha256)} };
static const uint8_t c5b11_profile_sha256[32] = { ${byteArray(runtimeProfileRef.sha256)} };
static const uint8_t c5b11_source_frame_sha256[32] = { ${byteArray(sha256(sourceFrame))} };
static const uint8_t c5b11_input_frame_sha256[32] = { ${byteArray(sha256(inputFrame))} };
static const uint8_t c5b11_completion_frame_sha256[32] = { ${byteArray(sha256(completion))} };
#endif
`);

if (runtimeProfileRef.sha256 === staleC5b8ProfileSha256) {
  throw new Error("C5b11 runtime profile must not reuse the stale C5b8 digest");
}

const outputs = new Map([
  ["contracts/attempt-runtime-profile.json", runtimeProfileBytes],
  ["contracts/attempt-plan.json", attemptPlanBytes],
  ["fixtures/source.payload", sourcePayload],
  ["fixtures/input.payload", inputPayload],
  ["fixtures/completion.payload", completionPayload],
  ["source/attempt_bindings.h", bindingHeader],
  ["fixtures/source.frame", sourceFrame],
  ["fixtures/input.frame", inputFrame],
  ["fixtures/completion.frame", completion],
]);

for (const [path, bytes] of outputs) {
  const destination = join(root, path);
  if (check) {
    if (!(await readFile(destination)).equals(bytes)) throw new Error(`generated binding drift: ${path}`);
  } else {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
}

console.log(JSON.stringify({
  result: "PASSED",
  check,
  attemptPlanSha256: attemptPlanRef.sha256,
  runtimeProfileSha256: runtimeProfileRef.sha256,
  staleC5b8ProfileRejected: true,
}));
