import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { libkrunSymbols, nominalEffects, providerSymbols, validateProfile } from "./verify-profile.mjs";
import { validateReconciliationFixture } from "./verify-reconciliation.mjs";

const staleC5b8Profile = "06079eea39ce9a2e0547837555a6953787d8c32d614f0ec7b9b07ef408de04cd";
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

function verifyRef(candidateRoot, repositoryRoot, name, reference) {
  const local = ["source/", "dist/", "fixtures/", "contracts/"].some((prefix) =>
    reference.path.startsWith(prefix));
  const absolute = join(local ? candidateRoot : repositoryRoot, reference.path);
  const bytes = readFileSync(absolute);
  assert.equal(bytes.length, reference.bytes, `${name} bytes`);
  assert.equal(sha256(bytes), reference.sha256, `${name} digest`);
  return bytes;
}

function verifySourceOrInputFrame(frame, magic, role, expected) {
  assert.equal(frame.subarray(0, 8).toString("ascii"), magic, `${magic} magic`);
  assert.equal(frame.readUInt16BE(8), 1, `${magic} protocol`);
  assert.equal(frame.readUInt16BE(10), 1, `${magic} method`);
  assert.equal(frame.readUInt16BE(12), role, `${magic} role`);
  assert.equal(frame.readUInt16BE(14), 152, `${magic} header length`);
  assert.equal(frame.subarray(16, 32).toString("hex"), expected.attemptId, `${magic} attempt`);
  assert.equal(frame.subarray(32, 48).toString("hex"), expected.registrationId, `${magic} registration`);
  assert.equal(frame.subarray(48, 80).toString("hex"), expected.planSha256, `${magic} plan`);
  assert.equal(frame.subarray(80, 112).toString("hex"), expected.profileSha256, `${magic} profile`);
  const payload = frame.subarray(152);
  assert.equal(frame.readBigUInt64BE(112), BigInt(payload.length), `${magic} payload length`);
  assert.equal(frame.subarray(120, 152).toString("hex"), sha256(payload), `${magic} payload digest`);
}

function verifyCompletionFrame(frame, expected) {
  assert.equal(frame.subarray(0, 8).toString("ascii"), "CPCMP001", "completion magic");
  assert.equal(frame.readUInt16BE(8), 1, "completion protocol");
  assert.equal(frame.readUInt16BE(10), 1, "completion method");
  assert.equal(frame.readUInt16BE(12), 3, "completion role");
  assert.equal(frame.readUInt16BE(14), 160, "completion header length");
  assert.equal(frame.subarray(16, 32).toString("hex"), expected.attemptId, "completion attempt");
  assert.equal(frame.subarray(32, 48).toString("hex"), expected.registrationId, "completion registration");
  assert.equal(frame.subarray(48, 80).toString("hex"), expected.planSha256, "completion plan");
  assert.equal(frame.subarray(80, 112).toString("hex"), expected.profileSha256, "completion profile");
  assert.equal(frame.readUInt16BE(112), 1, "completion status");
  assert.equal(frame.readUInt16BE(114), 0, "completion flags");
  assert.equal(frame.readUInt32BE(116), 0, "completion reserved");
  const payloadBytes = Number(frame.readBigUInt64BE(120));
  const payload = frame.subarray(160, 160 + payloadBytes);
  assert.equal(payload.length, payloadBytes, "completion payload length");
  assert.equal(frame.subarray(128, 160).toString("hex"), sha256(payload), "completion payload digest");
  const trailer = frame.subarray(160 + payloadBytes);
  assert.equal(trailer.length, 64, "completion trailer last");
  assert.equal(trailer.subarray(0, 8).toString("ascii"), "CPEND001", "trailer magic");
  assert.equal(trailer.readUInt16BE(8), 1, "trailer protocol");
  assert.equal(trailer.readUInt16BE(10), 1, "trailer method");
  assert.equal(trailer.readUInt16BE(12), 3, "trailer role");
  assert.equal(trailer.readUInt16BE(14), 64, "trailer length");
  assert.equal(trailer.subarray(16, 32).toString("hex"), expected.attemptId, "trailer attempt");
  assert.equal(trailer.subarray(32).toString("hex"),
    sha256(Buffer.concat([frame.subarray(0, 160), payload])), "trailer digest");
}

function assertOrdered(source, names, label) {
  let position = -1;
  for (const name of names) {
    const next = source.indexOf(name, position + 1);
    assert.equal(next > position, true, `${label}: ${name}`);
    position = next;
  }
}

function embeddedDigest(source, name) {
  const body = source.match(new RegExp(`${name}\\[32\\] = \\{([^}]+)\\}`, "su"))?.[1] ?? "";
  return [...body.matchAll(/0x([0-9a-f]{2})/gu)].map((match) => match[1]).join("");
}

export function verifyCandidate(candidateRoot, repositoryRoot = resolve(candidateRoot, "..", "..")) {
  const profilePath = join(candidateRoot, "contracts/fixed-runner-profile.json");
  const profileBytes = readFileSync(profilePath);
  const profile = JSON.parse(profileBytes);
  const packet = readJson(join(candidateRoot, "contracts/no-run-successor.json"));
  validateProfile(profile);

  const loaded = {};
  for (const [name, reference] of Object.entries(profile.components)) {
    loaded[name] = verifyRef(candidateRoot, repositoryRoot, name, reference);
  }
  const attemptProfile = JSON.parse(loaded.attemptRuntimeProfile);
  const attemptPlan = JSON.parse(loaded.attemptPlan);
  assert.equal(sha256(loaded.attemptRuntimeProfile), profile.bindingLayers.attemptRuntimeProfile.sha256);
  assert.equal(sha256(loaded.attemptPlan), profile.bindingLayers.attemptPlan.sha256);
  assert.notEqual(sha256(loaded.attemptRuntimeProfile), staleC5b8Profile, "stale C5b8 profile rejected");
  assert.deepEqual(attemptProfile.selectedBytes.fixedRunnerObject, profile.components.fixedRunnerObject);
  assert.deepEqual(attemptProfile.selectedBytes.runtimeRoot, profile.components.runtimeRoot);
  assert.equal(attemptProfile.authority.supervisorDriverIncluded, false, "non-cyclic attempt layer");
  assert.equal(profile.bindingLayers.outerComposition.driverObject.sha256,
    profile.components.supervisorDriverObject.sha256, "outer driver binding");
  assert.deepEqual(profile.bindingLayers.outerComposition.driverSource,
    profile.components.supervisorDriverSource, "outer driver-source binding");
  assert.deepEqual(profile.bindingLayers.outerComposition.abiHeader,
    profile.components.supervisorEffectHeader, "outer ABI binding");
  assert.deepEqual(profile.bindingLayers.outerComposition.generatedBindings,
    profile.components.generatedAttemptBindings, "outer generated-binding identity");

  const expectedBindings = {
    registrationId: attemptPlan.registrationId,
    attemptId: attemptPlan.attemptId,
    planSha256: sha256(loaded.attemptPlan),
    profileSha256: sha256(loaded.attemptRuntimeProfile),
  };
  verifySourceOrInputFrame(loaded.sourceFrame, "CPSRC001", 1, expectedBindings);
  verifySourceOrInputFrame(loaded.inputFrame, "CPINP001", 2, expectedBindings);
  verifyCompletionFrame(loaded.completionFrame, expectedBindings);

  const runnerSource = loaded.fixedRunnerSource.toString("utf8");
  const driverSource = loaded.supervisorDriverSource.toString("utf8");
  const effectHeader = loaded.supervisorEffectHeader.toString("utf8");
  const bindingHeader = loaded.generatedAttemptBindings.toString("utf8");
  assert.match(runnerSource, /C5B11_ROOT_BYTES UINT64_C\(100663296\)/u, "fixed runner root size");
  const rootBody = runnerSource.match(/c5b11_root_sha256\[[^\]]+\] = \{([^}]+)\}/su)?.[1] ?? "";
  const embeddedRoot = [...rootBody.matchAll(/0x([0-9a-f]{2})/gu)].map((match) => match[1]).join("");
  assert.equal(embeddedRoot, profile.runnerRoot.sha256, "fixed runner root digest");
  assert.doesNotMatch(runnerSource, /134217728|390a4786a20d45f1c691ec8c203f84f5e9d372a30e98f867cc8309a144ca6798/u);
  assert.equal(embeddedDigest(bindingHeader, "c5b11_plan_sha256"), expectedBindings.planSha256,
    "generated plan binding");
  assert.equal(embeddedDigest(bindingHeader, "c5b11_profile_sha256"), expectedBindings.profileSha256,
    "generated profile binding");
  assert.equal(embeddedDigest(bindingHeader, "c5b11_source_frame_sha256"), sha256(loaded.sourceFrame),
    "generated source-frame binding");
  assert.equal(embeddedDigest(bindingHeader, "c5b11_input_frame_sha256"), sha256(loaded.inputFrame),
    "generated input-frame binding");
  assert.equal(embeddedDigest(bindingHeader, "c5b11_completion_frame_sha256"), sha256(loaded.completionFrame),
    "generated completion/replay binding");
  assert.doesNotMatch(`${driverSource}\n${bindingHeader}`, new RegExp(staleC5b8Profile, "u"));
  assert.match(driverSource, /result->profile_sha256, request->profile_sha256/u, "profile echo validation");
  assert.match(driverSource, /result->frame_sha256, request->frame_sha256/u, "frame echo validation");

  const runnerMain = runnerSource.slice(runnerSource.indexOf("int main("));
  assertOrdered(runnerMain, ["write_ready();", "require_start_authorization();", "krun_start_enter(context)"],
    "runner ready/start order");

  const runnerSymbols = symbols(join(candidateRoot, profile.components.fixedRunnerObject.path));
  const driverSymbols = symbols(join(candidateRoot, profile.components.supervisorDriverObject.path));
  const libkrunObjectSymbols = symbols(join(repositoryRoot, profile.components.libkrun.path));
  const runnerImports = runnerSymbols.undefinedSymbols.filter((name) => name.startsWith("_krun_"));
  const driverKrunImports = driverSymbols.undefinedSymbols.filter((name) => name.startsWith("_krun_"));
  const driverProviderImports = driverSymbols.undefinedSymbols.filter((name) =>
    name.startsWith("_c5b11_supervisor_"));
  assert.deepEqual(runnerImports, libkrunSymbols, "runner libkrun import closure");
  assert.deepEqual(driverKrunImports, [], "Supervisor owns no libkrun imports");
  assert.deepEqual(driverProviderImports, [...providerSymbols].sort(), "closed provider import ABI");
  assert.deepEqual(runnerSymbols.undefinedSymbols.filter((name) => name.startsWith("_c5b11_supervisor_")), []);
  assert.deepEqual(driverSymbols.defined.filter((name) => name.startsWith("_c5b11_")),
    ["_c5b11_drive_registered_attempt"], "registration-only driver export");
  assert.equal(libkrunSymbols.every((name) => new Set(libkrunObjectSymbols.defined).has(name)), true);

  const headerProviders = [...effectHeader.matchAll(/C5B11_PROVIDER\((c5b11_supervisor_[a-z_]+)\)/gu)]
    .map((match) => `_${match[1]}`);
  assert.deepEqual(headerProviders, providerSymbols, "per-effect header ABI");
  assert.match(effectHeader, /c5b11_drive_registered_attempt\(const uint8_t registration_id\[16\]\)/u);
  assert.doesNotMatch(effectHeader, /\b(?:path|flags|image|mount|backend|environment|argv|envp)\b/iu,
    "no caller authority in ABI");

  const driveBody = driverSource.slice(driverSource.indexOf("int32_t c5b11_drive_registered_attempt"));
  const nominalProviders = [...driveBody.matchAll(/C5B11_NOMINAL\(c5b11_supervisor_([a-z_]+)/gu)]
    .map((match) => match[1].replaceAll("_", "-").replace("drain-validate-completion", "drain-and-validate-completion"));
  assert.deepEqual(nominalProviders, nominalEffects, "nominal source order");
  const createdRecoveryBody = driverSource.slice(driverSource.indexOf("static int reconcile_created_attempt"),
    driverSource.indexOf("static int reconcile_completion_response_loss"));
  assertOrdered(createdRecoveryBody, [
    "c5b11_supervisor_fence_attempt", "c5b11_supervisor_lookup_fenced_attempt",
    "c5b11_supervisor_request_teardown", "c5b11_supervisor_reconcile_teardown_outcome",
    "c5b11_supervisor_reconcile_terminal_state", "c5b11_supervisor_reconcile_authoritative_absence",
    "c5b11_supervisor_reconcile_fixed_root_removal",
  ], "created-attempt convergence");
  assert.equal((createdRecoveryBody.match(/c5b11_supervisor_request_teardown/gu) ?? []).length, 1,
    "teardown request exactly once");
  assert.equal((driverSource.match(/return durable_unresolved/gu) ?? []).length, 2,
    "durable unresolved path");
  const completionRecoveryBody = driverSource.slice(driverSource.indexOf("static int reconcile_completion_response_loss"),
    driverSource.indexOf("#define C5B11_NOMINAL"));
  assertOrdered(completionRecoveryBody, [
    "c5b11_supervisor_fence_attempt", "c5b11_supervisor_lookup_fenced_attempt",
    "c5b11_supervisor_reopen_stored_completion", "c5b11_supervisor_replay_stored_completion",
  ], "completion response-loss convergence");
  assert.doesNotMatch(driverSource, /fail_closed/u);

  validateReconciliationFixture(JSON.parse(loaded.reconciliationMatrix));
  assert.equal(packet.profile.sha256, sha256(profileBytes));
  assert.equal(packet.attemptRuntimeProfile.sha256, expectedBindings.profileSha256);
  assert.equal(packet.attemptPlan.sha256, expectedBindings.planSha256);
  assert.deepEqual(packet.authorization, profile.authorization);
  assert.deepEqual(packet.performedEffects, profile.performedEffects);

  const sequence = readJson(join(candidateRoot, "fixtures/effect-sequence.json"));
  assert.deepEqual(sequence.nominalEffects,
    nominalEffects.map((effect, index) => ({ sequence: index + 1, effect })));
  assert.equal(sequence.performed, false);

  const manifestPath = join(candidateRoot, "manifests/archive-manifest.json");
  assert.equal(existsSync(manifestPath), true);
  const manifest = readJson(manifestPath);
  const actual = filesBelow(candidateRoot).map((absolute) => {
    const bytes = readFileSync(absolute);
    return { path: relative(candidateRoot, absolute), bytes: bytes.length, sha256: sha256(bytes) };
  });
  assert.deepEqual(manifest.files, actual, "closed archive inventory");
  assert.equal(manifest.files.some(({ path }) => /\.(dylib|ext4)$/u.test(path)), false,
    "predecessor binaries remain references");

  return {
    status: "PASSED", parentC5b: "BLOCKED", retainedFiles: actual.length,
    attemptRuntimeProfileSha256: expectedBindings.profileSha256,
    attemptPlanSha256: expectedBindings.planSha256,
    runnerObjectSha256: profile.components.fixedRunnerObject.sha256,
    supervisorDriverObjectSha256: profile.components.supervisorDriverObject.sha256,
    runnerLibkrunImports: runnerImports.length,
    supervisorEffectImports: driverProviderImports.length,
    reconciliationCases: JSON.parse(loaded.reconciliationMatrix).primaryFailureCases.length,
    performedEffects: "NONE",
  };
}
