#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyCandidate } from "./verify-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = resolve(root, "..", "..");
const mutationRoot = mkdtempSync(join(tmpdir(), "capsule-c5b11-mutations."));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const profilePath = (candidate) => join(candidate, "contracts/fixed-runner-profile.json");
const fileRef = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes) });
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

function mutateProfile(candidate, mutate) {
  const path = profilePath(candidate);
  const value = JSON.parse(readFileSync(path, "utf8"));
  mutate(value);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function mutateComponent(candidate, component, mutate) {
  const path = profilePath(candidate);
  const profile = JSON.parse(readFileSync(path, "utf8"));
  const absolute = join(candidate, profile.components[component].path);
  const bytes = Buffer.from(readFileSync(absolute));
  mutate(bytes);
  writeFileSync(absolute, bytes);
  profile.components[component] = { path: profile.components[component].path,
    bytes: bytes.length, sha256: sha256(bytes) };
  writeFileSync(path, `${JSON.stringify(profile, null, 2)}\n`);
}

function mutateJsonComponent(candidate, component, mutate) {
  mutateComponent(candidate, component, (bytes) => {
    const value = JSON.parse(bytes);
    mutate(value);
    const replacement = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    assert.equal(replacement.length <= bytes.length + 4096, true);
    bytes.fill(0);
    replacement.copy(bytes);
    if (replacement.length !== bytes.length) {
      throw new Error("JSON mutation helper requires byte-neutral mutation");
    }
  });
}

function mutateMatrix(candidate, mutate) {
  const profileFile = profilePath(candidate);
  const profile = JSON.parse(readFileSync(profileFile, "utf8"));
  const absolute = join(candidate, profile.components.reconciliationMatrix.path);
  const value = JSON.parse(readFileSync(absolute, "utf8"));
  mutate(value);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  writeFileSync(absolute, bytes);
  profile.components.reconciliationMatrix = { path: profile.components.reconciliationMatrix.path,
    bytes: bytes.length, sha256: sha256(bytes) };
  writeFileSync(profileFile, `${JSON.stringify(profile, null, 2)}\n`);
}

function mutateAttemptProfile(candidate, mutate) {
  const profileFile = profilePath(candidate);
  const profile = JSON.parse(readFileSync(profileFile, "utf8"));
  const absolute = join(candidate, profile.components.attemptRuntimeProfile.path);
  const value = JSON.parse(readFileSync(absolute, "utf8"));
  mutate(value);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  writeFileSync(absolute, bytes);
  const reference = { path: profile.components.attemptRuntimeProfile.path,
    bytes: bytes.length, sha256: sha256(bytes) };
  profile.components.attemptRuntimeProfile = reference;
  Object.assign(profile.bindingLayers.attemptRuntimeProfile, reference);
  writeFileSync(profileFile, `${JSON.stringify(profile, null, 2)}\n`);
}

function substituteBoundComponent(candidate, component, outerKey) {
  mutateProfile(candidate, (profile) => {
    profile.components[component].sha256 = "0".repeat(64);
    if (outerKey) profile.bindingLayers.outerComposition[outerKey].sha256 = "0".repeat(64);
  });
}

function mutateDriverSource(candidate, from, to) {
  const profileFile = profilePath(candidate);
  const profile = JSON.parse(readFileSync(profileFile, "utf8"));
  const absolute = join(candidate, profile.components.supervisorDriverSource.path);
  const original = readFileSync(absolute, "utf8");
  assert.equal(original.includes(from), true, `missing source mutation target: ${from}`);
  const bytes = Buffer.from(original.replace(from, to));
  writeFileSync(absolute, bytes);
  const reference = { path: profile.components.supervisorDriverSource.path,
    bytes: bytes.length, sha256: sha256(bytes) };
  profile.components.supervisorDriverSource = reference;
  profile.bindingLayers.outerComposition.driverSource = reference;
  writeFileSync(profileFile, `${JSON.stringify(profile, null, 2)}\n`);
}

function mutateGeneratedBindings(candidate) {
  const profileFile = profilePath(candidate);
  const profile = JSON.parse(readFileSync(profileFile, "utf8"));
  const absolute = join(candidate, profile.components.generatedAttemptBindings.path);
  const original = readFileSync(absolute, "utf8");
  const changed = original.replace(
    /(c5b11_completion_frame_sha256\[32\] = \{ )0x[0-9a-f]{2}/u,
    (_match, prefix) => `${prefix}0xff`);
  assert.notEqual(changed, original);
  const bytes = Buffer.from(changed);
  writeFileSync(absolute, bytes);
  const reference = { path: profile.components.generatedAttemptBindings.path,
    bytes: bytes.length, sha256: sha256(bytes) };
  profile.components.generatedAttemptBindings = reference;
  profile.bindingLayers.outerComposition.generatedBindings = reference;
  writeFileSync(profileFile, `${JSON.stringify(profile, null, 2)}\n`);
}

function replaceBindingDigest(source, name, digest) {
  const byteArray = digest.match(/../gu).map((byte) => `0x${byte}`).join(", ");
  const expression = new RegExp(`(${name}\\[32\\] = \\{ )[^}]+( \\};)`, "u");
  assert.match(source, expression, `binding digest target: ${name}`);
  return source.replace(expression, `$1${byteArray}$2`);
}

function payloadFromFrame(frame, kind) {
  if (kind !== "completion") return frame.subarray(152);
  const bytes = Number(frame.readBigUInt64BE(120));
  return frame.subarray(160, 160 + bytes);
}

function rebuildFrame(original, kind, payload, planSha256) {
  if (kind !== "completion") {
    const header = Buffer.from(original.subarray(0, 152));
    Buffer.from(planSha256, "hex").copy(header, 48);
    header.writeBigUInt64BE(BigInt(payload.length), 112);
    Buffer.from(sha256(payload), "hex").copy(header, 120);
    return Buffer.concat([header, payload]);
  }
  const header = Buffer.from(original.subarray(0, 160));
  Buffer.from(planSha256, "hex").copy(header, 48);
  header.writeBigUInt64BE(BigInt(payload.length), 120);
  Buffer.from(sha256(payload), "hex").copy(header, 128);
  const trailer = Buffer.alloc(64);
  trailer.write("CPEND001", 0, 8, "ascii");
  trailer.writeUInt16BE(1, 8);
  trailer.writeUInt16BE(1, 10);
  trailer.writeUInt16BE(3, 12);
  trailer.writeUInt16BE(64, 14);
  header.subarray(16, 32).copy(trailer, 16);
  Buffer.from(sha256(Buffer.concat([header, payload])), "hex").copy(trailer, 32);
  return Buffer.concat([header, payload, trailer]);
}

function refreshArchiveManifest(candidate) {
  const manifestPath = join(candidate, "manifests/archive-manifest.json");
  const files = [];
  const visit = (directory) => {
    for (const entry of readFileDirectory(directory)) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (absolute !== manifestPath) {
        const bytes = readFileSync(absolute);
        files.push({ path: absolute.slice(candidate.length + 1), bytes: bytes.length, sha256: sha256(bytes) });
      }
    }
  };
  visit(candidate);
  files.sort((left, right) => left.path.localeCompare(right.path));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.files = files;
  writeFileSync(manifestPath, jsonBytes(manifest));
}

function readFileDirectory(path) {
  return readdirSync(path, { withFileTypes: true });
}

function rebindPayloadCandidate(candidate, {
  payloadChanges = {}, bindChangedPayloads = false, mutatePlan = () => {},
}) {
  const kinds = ["source", "input", "completion"];
  const componentNames = {
    source: "sourceFrame", input: "inputFrame", completion: "completionFrame",
  };
  const bindingNames = {
    source: "c5b11_source_frame_sha256", input: "c5b11_input_frame_sha256",
    completion: "c5b11_completion_frame_sha256",
  };
  const profileFile = profilePath(candidate);
  const profile = JSON.parse(readFileSync(profileFile, "utf8"));
  const planPath = join(candidate, profile.components.attemptPlan.path);
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const payloads = {};
  const originalFrames = {};
  for (const kind of kinds) {
    originalFrames[kind] = readFileSync(join(candidate, profile.components[componentNames[kind]].path));
    payloads[kind] = payloadChanges[kind] ?? payloadFromFrame(originalFrames[kind], kind);
    writeFileSync(join(candidate, plan.payloads[kind].path), payloads[kind]);
    if (bindChangedPayloads && payloadChanges[kind]) {
      plan.payloads[kind] = fileRef(plan.payloads[kind].path, payloads[kind]);
    }
  }
  mutatePlan(plan);
  const planBytes = jsonBytes(plan);
  writeFileSync(planPath, planBytes);
  const planReference = fileRef(profile.components.attemptPlan.path, planBytes);

  const frames = {};
  for (const kind of kinds) {
    frames[kind] = rebuildFrame(originalFrames[kind], kind, payloads[kind], planReference.sha256);
    const frameReference = fileRef(profile.components[componentNames[kind]].path, frames[kind]);
    writeFileSync(join(candidate, frameReference.path), frames[kind]);
    profile.components[componentNames[kind]] = frameReference;
  }

  const bindingPath = join(candidate, profile.components.generatedAttemptBindings.path);
  let bindingSource = readFileSync(bindingPath, "utf8");
  bindingSource = replaceBindingDigest(bindingSource, "c5b11_plan_sha256", planReference.sha256);
  for (const kind of kinds) {
    bindingSource = replaceBindingDigest(bindingSource, bindingNames[kind], sha256(frames[kind]));
  }
  const bindingBytes = Buffer.from(bindingSource);
  writeFileSync(bindingPath, bindingBytes);
  const bindingReference = fileRef(profile.components.generatedAttemptBindings.path, bindingBytes);
  profile.components.generatedAttemptBindings = bindingReference;
  profile.bindingLayers.outerComposition.generatedBindings = bindingReference;
  profile.components.attemptPlan = planReference;
  Object.assign(profile.bindingLayers.attemptPlan, planReference);
  const profileBytes = jsonBytes(profile);
  writeFileSync(profileFile, profileBytes);

  const packetPath = join(candidate, "contracts/no-run-successor.json");
  const packet = JSON.parse(readFileSync(packetPath, "utf8"));
  packet.profile = fileRef("contracts/fixed-runner-profile.json", profileBytes);
  packet.attemptPlan = planReference;
  packet.fixedPayloads = plan.payloads;
  for (const kind of kinds) packet.fixedFixtures[kind] = profile.components[componentNames[kind]];
  writeFileSync(packetPath, jsonBytes(packet));
  refreshArchiveManifest(candidate);
}

const frameCase = (name, component, offset, writer, expected) => [name, (candidate) =>
  mutateComponent(candidate, component, (bytes) => writer(bytes, offset)), expected];

const cases = [
  ["runner-root-size", (c) => mutateProfile(c, (p) => { p.runnerRoot.bytes = 134217728; }), /100663296/u],
  ["runner-root-digest", (c) => mutateProfile(c, (p) => { p.runnerRoot.sha256 = "0".repeat(64); }), /Expected values/u],
  ["stale-c5b8-profile", (c) => mutateProfile(c, (p) => { p.bindingLayers.attemptRuntimeProfile.sha256 = "06079eea39ce9a2e0547837555a6953787d8c32d614f0ec7b9b07ef408de04cd"; }), /Expected values|not equal/u],
  ["frame-profile-substitution", (c) => mutateComponent(c, "sourceFrame", (b) => b.fill(0, 80, 112)), /CPSRC001 profile/u],
  ["effect-echo-profile-removal", (c) => mutateDriverSource(c,
    "result->profile_sha256", "result->profile_sha25x"), /profile echo validation/u],
  ["ambiguous-spawn-state-bypass", (c) => mutateDriverSource(c,
    "process_state = C5B11_PROCESS_MAY_EXIST;", "process_state = C5B11_PROCESS_NONE;"),
  /process-may-exist transition/u],
  ["ambiguous-spawn-failure-bypass", (c) => mutateDriverSource(c,
    "process_state != C5B11_PROCESS_NONE", "process_state == C5B11_PROCESS_CONFIRMED"),
  /process-may-exist state enters/u],
  ["startup-recovery-cursor-removal", (c) => mutateDriverSource(c,
    "c5b11_supervisor_lookup_recovery_cursor", "c5b11_supervisor_lookup_fenced_attempt"),
  /recovery cursor/u],
  ["startup-recovery-path-confusion", (c) => mutateDriverSource(c,
    "valid_created_recovery_cursor(\n                    result.recovery_step, result.durable_resume_step)",
    "valid_completion_recovery_cursor(\n                    result.recovery_step, result.durable_resume_step)"),
  /reopened cursors are constrained/u],
  ["startup-recovery-durable-swap", (c) => mutateDriverSource(c,
    "result.recovery_step, result.durable_resume_step)",
    "result.durable_resume_step, result.recovery_step)"),
  /validates distinct cursor members|recovery\/durable cursor pairs/u],
  ["startup-recovery-durable-missing", (c) => mutateDriverSource(c,
    " ||\n            result.durable_resume_step != 0", ""),
  /fresh startup proof validates both cursor fields|startup validates both cursor fields/u],
  ["startup-recovery-invalid-pair", (c) => mutateDriverSource(c,
    "recovery_step == 16 && durable_resume_step == 17",
    "recovery_step == 16 && durable_resume_step == 16"),
  /created recovery\/durable cursor pairs/u],
  ["startup-recovery-nonmonotone-pair", (c) => mutateDriverSource(c,
    "recovery_step == 16 && durable_resume_step == 17",
    "recovery_step == 16 && durable_resume_step == 15"),
  /created recovery\/durable cursor pairs/u],
  ["startup-recovery-dispatch-field-swap", (c) => mutateDriverSource(c,
    "result.durable_resume_step);", "result.recovery_step);"),
  /reopened dispatch uses durable resume cursor/u],
  ["source-reconciliation-absence", (c) => mutateDriverSource(c,
    "c5b11_supervisor_reconcile_authoritative_absence", "c5b11_supervisor_reconcile_authoritative_absencx"),
  /created-attempt convergence/u],
  ["source-reconciliation-root-removal", (c) => mutateDriverSource(c,
    "c5b11_supervisor_reconcile_fixed_root_removal", "c5b11_supervisor_reconcile_fixed_root_removaX"),
  /created-attempt convergence/u],
  ["source-teardown-reconciliation", (c) => mutateDriverSource(c,
    "c5b11_supervisor_reconcile_teardown_outcome", "c5b11_supervisor_reconcile_teardown_outcomX"),
  /created-attempt convergence/u],
  ["source-teardown-redrive-cursor", (c) => mutateDriverSource(c,
    "request.durable_resume_step = 17;", "request.durable_resume_step = 16;"),
  /non-redrive durable resume cursor/u],
  ["source-teardown-immediate-unresolved", (c) => mutateDriverSource(c,
    "(void)c5b11_supervisor_request_teardown(&request, &ignored);",
    "if (c5b11_supervisor_request_teardown(&request, &ignored) != 0) return durable_unresolved(failed_sequence, C5B11_EFFECT_INDETERMINATE, 17);"),
  /one-shot teardown result is never final/u],
  ["source-unresolved-cleanup", (c) => mutateDriverSource(c,
    "return durable_unresolved", "return durable_unresolveX"), /durable unresolved path/u],
  ["source-stored-completion-replay", (c) => mutateDriverSource(c,
    "c5b11_supervisor_replay_stored_completion", "c5b11_supervisor_replay_stored_completioX"),
  /completion response-loss convergence/u],
  ["stored-completion-frame-binding", (c) => mutateGeneratedBindings(c),
    /generated completion\/replay binding/u],
  ["runtime-executable-substitution", (c) => mutateAttemptProfile(c, (p) => {
    p.runtimeContents.executable.sha256 = "0".repeat(64);
  }), /C5b7 runtime executable binding/u],
  ["runtime-snapshot-substitution", (c) => mutateAttemptProfile(c, (p) => {
    p.runtimeContents.snapshot.sha256 = "0".repeat(64);
  }), /C5b7 snapshot binding/u],
  ["runtime-bundle-substitution", (c) => mutateAttemptProfile(c, (p) => {
    p.runtimeContents.runtimeBundle = structuredClone(p.provenanceInputs.runtimeProvenance);
  }), /C5b7 runtime bundle binding/u],
  ["root-profile-identity-substitution", (c) => mutateAttemptProfile(c, (p) => {
    p.rootComposition.identity = "capsule.invalid";
  }), /C5b7 identity binding/u],
  ["root-profile-manifest-substitution", (c) => mutateAttemptProfile(c, (p) => {
    p.rootComposition.profile.sha256 = "0".repeat(64);
  }), /C5b7 root profile digest/u],
  ["root-archive-manifest-substitution", (c) => mutateAttemptProfile(c, (p) => {
    p.rootComposition.archiveManifest.sha256 = "0".repeat(64);
  }), /C5b7 archive manifest digest/u],
  ["runtime-provenance-substitution", (c) => mutateAttemptProfile(c, (p) => {
    p.provenanceInputs.runtimeProvenance.sha256 = "0".repeat(64);
  }), /runtime provenance digest/u],
  ["runtime-sbom-substitution", (c) => mutateAttemptProfile(c, (p) => {
    p.provenanceInputs.runtimeSbom.sha256 = "0".repeat(64);
  }), /runtime SBOM digest/u],
  ["runtime-notice-substitution", (c) => mutateAttemptProfile(c, (p) => {
    p.provenanceInputs.runtimeNoticeClosure.sha256 = "0".repeat(64);
  }), /runtime notice closure digest/u],
  ["kernel-source-obligation-substitution", (c) => mutateAttemptProfile(c, (p) => {
    p.sourceObligations.preferredFormKernelSourceComplete = true;
  }), /preferred-form kernel source/u],
  ["libkrunfw-recovery-manifest-substitution", (c) => mutateAttemptProfile(c, (p) => {
    p.sourceObligations.libkrunfwRecoveryManifest = structuredClone(p.provenanceInputs.runtimeProvenance);
  }), /C5b4 recovery manifest exact path/u],
  ["driver-source-substitution", (c) => substituteBoundComponent(c,
    "supervisorDriverSource", "driverSource"), /supervisorDriverSource digest/u],
  ["driver-object-substitution", (c) => substituteBoundComponent(c,
    "supervisorDriverObject", "driverObject"), /supervisorDriverObject digest/u],
  ["independent-oracle-substitution", (c) => mutateProfile(c, (p) => {
    p.components.independentRecoveryOracle.sha256 = "0".repeat(64);
    p.faultConvergence.independentOracle.sha256 = "0".repeat(64);
  }), /independentRecoveryOracle digest/u],
  ["effect-order", (c) => mutateProfile(c, (p) => { p.ordering.nominalEffects.reverse(); }), /Expected values/u],
  ["per-effect-abi", (c) => mutateProfile(c, (p) => { p.effectAbi.providerSymbols.pop(); }), /Expected values/u],
  ["supervisor-libkrun-import", (c) => mutateProfile(c, (p) => { p.ownership.supervisorLibkrunImports.push("_krun_create_ctx"); }), /Expected values/u],
  ["duplicate-libkrun-owner", (c) => mutateProfile(c, (p) => { p.ownership.duplicateLibkrunOwnership = true; }), /false/u],
  ["execute-request-widening", (c) => mutateProfile(c, (p) => { p.executionRequest.acceptedFields.push("sourceBytes"); }), /registrationId/u],
  ["caller-authority", (c) => mutateProfile(c, (p) => { p.executionRequest.callerHostPaths = true; }), /callerHostPaths/u],
  ["host-presence", (c) => mutateProfile(c, (p) => { p.authorization.host = "host"; }), /null/u],
  ["guest-presence", (c) => mutateProfile(c, (p) => { p.authorization.guest = "guest"; }), /null/u],
  ["execution-authorization", (c) => mutateProfile(c, (p) => { p.authorization.executionAuthorized = true; }), /false/u],
  ["performed-effect", (c) => mutateProfile(c, (p) => { p.performedEffects.runnerStarted = true; }), /performed effects/u],
  ["source-payload-rehashed-plan-stale", (c) => rebindPayloadCandidate(c, {
    payloadChanges: { source: Buffer.from("globalThis.capsuleMain = function (input) { return {doubled: input.value * 3, echo: input.message}; };\n") },
  }), /source payload plan digest/u],
  ["input-payload-rehashed-plan-stale", (c) => rebindPayloadCandidate(c, {
    payloadChanges: { input: Buffer.from('{"message":"capsule-c2a","value":22}') },
  }), /input payload plan digest/u],
  ["completion-payload-rehashed-plan-stale", (c) => rebindPayloadCandidate(c, {
    payloadChanges: { completion: Buffer.from('{"doubled":43,"echo":"capsule-c2a"}') },
  }), /completion payload plan digest/u],
  ["input-payload-invalid-json", (c) => rebindPayloadCandidate(c, {
    payloadChanges: { input: Buffer.from('{"message":"capsule-c2a","value":21') },
    bindChangedPayloads: true,
  }), /Unexpected end of JSON input|JSON/u],
  ["input-payload-noncanonical-json", (c) => rebindPayloadCandidate(c, {
    payloadChanges: { input: Buffer.from('{"value":21,"message":"capsule-c2a"}') },
    bindChangedPayloads: true,
  }), /input canonical JSON bytes/u],
  ["completion-payload-invalid-json", (c) => rebindPayloadCandidate(c, {
    payloadChanges: { completion: Buffer.from('{"doubled":42,"echo":capsule}') },
    bindChangedPayloads: true,
  }), /Unexpected token|JSON/u],
  ["completion-payload-noncanonical-json", (c) => rebindPayloadCandidate(c, {
    payloadChanges: { completion: Buffer.from('{ "doubled":42,"echo":"capsule-c2a" }') },
    bindChangedPayloads: true,
  }), /completion canonical JSON bytes/u],
  ["source-plan-payload-length-substitution", (c) => rebindPayloadCandidate(c, {
    mutatePlan: (p) => { p.payloads.source.bytes += 1; },
  }), /source payload plan length/u],
  ["input-plan-payload-digest-substitution", (c) => rebindPayloadCandidate(c, {
    mutatePlan: (p) => { p.payloads.input.sha256 = "0".repeat(64); },
  }), /input payload plan digest/u],
  ["completion-plan-payload-path-substitution", (c) => rebindPayloadCandidate(c, {
    mutatePlan: (p) => { p.payloads.completion.path = "fixtures/input.payload"; },
  }), /completion payload plan path/u],
  ["input-plan-payload-form-substitution", (c) => rebindPayloadCandidate(c, {
    mutatePlan: (p) => { p.payloadForms.input = "exact-bytes"; },
  }), /attempt plan payload canonical forms/u],
  frameCase("source-payload-length", "sourceFrame", 112,
    (b, o) => b.writeBigUInt64BE(BigInt(b.length), o), /CPSRC001 payload length/u),
  frameCase("source-payload-digest", "sourceFrame", 120,
    (b, o) => b.fill(0, o, o + 32), /CPSRC001 payload digest/u),
  frameCase("input-payload-length", "inputFrame", 112,
    (b, o) => b.writeBigUInt64BE(BigInt(b.length), o), /CPINP001 payload length/u),
  frameCase("input-payload-digest", "inputFrame", 120,
    (b, o) => b.fill(0, o, o + 32), /CPINP001 payload digest/u),
  frameCase("completion-magic", "completionFrame", 0, (b, o) => b.write("BADMAGIC", o, 8, "ascii"), /completion magic/u),
  frameCase("completion-protocol", "completionFrame", 8, (b, o) => b.writeUInt16BE(2, o), /completion protocol/u),
  frameCase("completion-method", "completionFrame", 10, (b, o) => b.writeUInt16BE(2, o), /completion method/u),
  frameCase("completion-role", "completionFrame", 12, (b, o) => b.writeUInt16BE(2, o), /completion role/u),
  frameCase("completion-header-length", "completionFrame", 14, (b, o) => b.writeUInt16BE(159, o), /completion header length/u),
  frameCase("completion-attempt", "completionFrame", 16, (b, o) => b.fill(0, o, o + 16), /completion attempt/u),
  frameCase("completion-registration", "completionFrame", 32, (b, o) => b.fill(0, o, o + 16), /completion registration/u),
  frameCase("completion-plan", "completionFrame", 48, (b, o) => b.fill(0, o, o + 32), /completion plan/u),
  frameCase("completion-profile", "completionFrame", 80, (b, o) => b.fill(0, o, o + 32), /completion profile/u),
  frameCase("completion-status", "completionFrame", 112, (b, o) => b.writeUInt16BE(2, o), /completion status/u),
  frameCase("completion-flags", "completionFrame", 114, (b, o) => b.writeUInt16BE(1, o), /completion flags/u),
  frameCase("completion-reserved", "completionFrame", 116, (b, o) => b.writeUInt32BE(1, o), /completion reserved/u),
  frameCase("completion-payload-length", "completionFrame", 120, (b, o) => b.writeBigUInt64BE(BigInt(b.length), o), /completion payload length/u),
  frameCase("completion-payload-digest", "completionFrame", 128, (b, o) => b.fill(0, o, o + 32), /completion payload digest/u),
  frameCase("completion-trailer-magic", "completionFrame", 195, (b) => b.write("BADEND00", b.length - 64, 8, "ascii"), /trailer magic/u),
  frameCase("completion-trailer-protocol", "completionFrame", 203, (b) => b.writeUInt16BE(2, b.length - 56), /trailer protocol/u),
  frameCase("completion-trailer-method", "completionFrame", 205, (b) => b.writeUInt16BE(2, b.length - 54), /trailer method/u),
  frameCase("completion-trailer-role", "completionFrame", 207, (b) => b.writeUInt16BE(2, b.length - 52), /trailer role/u),
  frameCase("completion-trailer-length", "completionFrame", 209, (b) => b.writeUInt16BE(63, b.length - 50), /trailer length/u),
  frameCase("completion-trailer-attempt", "completionFrame", 211, (b) => b.fill(0, b.length - 48, b.length - 32), /trailer attempt/u),
  frameCase("completion-trailer-digest", "completionFrame", 227, (b) => b.fill(0, b.length - 32), /trailer digest/u),
  ["ambiguous-spawn-matrix-bypass", (c) => mutateMatrix(c, (m) => { for (const x of m.ambiguousSpawnCases) { x.processMayExist = false; x.trace = ["record-unresolved-cleanup"]; } }), /reconciliation matrix/u],
  ["recovery-cross-product-missing", (c) => mutateMatrix(c, (m) => { m.recoveryStepFailureCases.pop(); }), /reconciliation matrix/u],
  ["teardown-immediate-unresolved-contradiction", (c) => mutateMatrix(c, (m) => {
    m.recoveryStepFailureCases.push({ path: "created", step: 16, effect: "request-teardown-once",
      failure: "provider-error", trace: ["request-teardown-once", "record-unresolved-cleanup"],
      durableResumeStep: 17, originalEffectRedriven: false });
  }), /reconciliation matrix/u],
  ["teardown-outcome-stops-before-reconciliation", (c) => mutateMatrix(c, (m) => {
    for (const x of m.teardownOutcomeCases) {
      x.immediateUnresolved = true;
      x.trace = ["request-teardown-once", "record-unresolved-cleanup"];
    }
  }), /reconciliation matrix/u],
  ["reopen-cursor-nonmonotone", (c) => mutateMatrix(c, (m) => {
    m.reopenRetryCases.find((x) => x.interruptedStep === 16).durableResumeStep = 15;
  }), /reconciliation matrix/u],
  ["reopen-retry-missing", (c) => mutateMatrix(c, (m) => { m.reopenRetryCases.pop(); }), /reconciliation matrix/u],
  ["reconciliation-absence", (c) => mutateMatrix(c, (m) => { for (const x of m.primaryFailureCases.filter((x) => x.processMayExist && x.sequence < 12)) x.trace = x.trace.filter((v) => v !== "reconcile-authoritative-absence"); }), /reconciliation matrix/u],
  ["reconciliation-root-removal", (c) => mutateMatrix(c, (m) => { for (const x of m.primaryFailureCases.filter((x) => x.processMayExist && x.sequence < 12)) x.trace = x.trace.filter((v) => v !== "reconcile-fixed-root-removal"); }), /reconciliation matrix/u],
  ["reconciliation-teardown", (c) => mutateMatrix(c, (m) => { for (const x of m.primaryFailureCases.filter((x) => x.processMayExist && x.sequence < 12)) x.trace = x.trace.filter((v) => v !== "reconcile-teardown-outcome"); for (const x of m.teardownOutcomeCases) x.trace = x.trace.filter((v) => v !== "reconcile-teardown-outcome"); }), /reconciliation matrix/u],
  ["unresolved-cleanup", (c) => mutateMatrix(c, (m) => { for (const x of m.recoveryStepFailureCases) x.trace.pop(); }), /reconciliation matrix/u],
  ["stored-completion-replay", (c) => mutateMatrix(c, (m) => { for (const x of m.primaryFailureCases.filter((x) => x.sequence >= 12)) x.trace.pop(); }), /reconciliation matrix/u],
  ["component-substitution", (c) => mutateProfile(c, (p) => { p.components.fixedRunnerObject.sha256 = "0".repeat(64); }), /fixedRunnerObject digest/u],
  ["closed-inventory-extra", (c) => writeFileSync(join(c, "undeclared-authority.txt"), "unexpected\n"), /closed archive inventory/u],
];

let completed = 0;
try {
  assert.equal(verifyCandidate(root, repository).status, "PASSED");
  const retainedNames = JSON.parse(readFileSync(
    join(root, "evidence/2026-08-18/mutation-dispositions.json"), "utf8")).restoredInvalidCases;
  assert.deepEqual(retainedNames, cases.map(([name]) => name),
    "retained mutation inventory matches executable suite");
  for (const [name, mutate, expected] of cases) {
    const candidate = join(mutationRoot, `case-${completed}`);
    cpSync(root, candidate, { recursive: true });
    mutate(candidate);
    assert.throws(() => verifyCandidate(candidate, repository), expected, name);
    assert.equal(verifyCandidate(root, repository).status, "PASSED", `original restored after ${name}`);
    completed += 1;
  }
} finally {
  rmSync(mutationRoot, { recursive: true, force: true });
}

console.log(`C5b11 restored-invalid mutation verification PASSED (${completed} cases)`);
console.log("No native candidate artifact was mutated, linked, loaded, or executed; mutations used disposable metadata/source/frame copies only.");
