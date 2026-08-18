import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { libkrunSymbols, nominalEffects, providerSymbols, validateProfile } from "./verify-profile.mjs";

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
  const local = ["source/", "dist/", "fixtures/"].some((prefix) => reference.path.startsWith(prefix));
  const absolute = join(local ? candidateRoot : repositoryRoot, reference.path);
  const bytes = readFileSync(absolute);
  assert.equal(bytes.length, reference.bytes, `${name} bytes`);
  assert.equal(sha256(bytes), reference.sha256, `${name} digest`);
  return bytes;
}

function verifySourceOrInputFrame(frame, magic, role, expected) {
  assert.equal(frame.subarray(0, 8).toString("ascii"), magic, `${magic} magic`);
  assert.equal(frame.readUInt16BE(8), 1, `${magic} contract version`);
  assert.equal(frame.readUInt16BE(10), 1, `${magic} frame version`);
  assert.equal(frame.readUInt16BE(12), role, `${magic} role`);
  assert.equal(frame.readUInt16BE(14), 152, `${magic} header bytes`);
  assert.equal(frame.subarray(16, 32).toString("hex"), expected.attemptId, `${magic} attempt`);
  assert.equal(frame.subarray(32, 48).toString("hex"), expected.registrationId, `${magic} registration`);
  assert.equal(frame.subarray(48, 80).toString("hex"), expected.planSha256, `${magic} plan`);
  assert.equal(frame.subarray(80, 112).toString("hex"), expected.profileSha256, `${magic} profile`);
  const payload = frame.subarray(152);
  assert.equal(frame.readBigUInt64BE(112), BigInt(payload.length), `${magic} payload bytes`);
  assert.equal(frame.subarray(120, 152).toString("hex"), sha256(payload), `${magic} payload digest`);
}

function verifyCompletionFrame(frame, expected) {
  assert.equal(frame.subarray(0, 8).toString("ascii"), "CPCMP001", "completion magic");
  assert.equal(frame.readUInt16BE(12), 3, "completion role");
  assert.equal(frame.readUInt16BE(14), 160, "completion header bytes");
  assert.equal(frame.subarray(16, 32).toString("hex"), expected.attemptId, "completion attempt");
  assert.equal(frame.subarray(48, 80).toString("hex"), expected.planSha256, "completion plan");
  assert.equal(frame.subarray(80, 112).toString("hex"), expected.profileSha256, "completion profile");
  const payloadBytes = Number(frame.readBigUInt64BE(120));
  const payload = frame.subarray(160, 160 + payloadBytes);
  assert.equal(payload.length, payloadBytes, "completion payload bytes");
  assert.equal(frame.subarray(128, 160).toString("hex"), sha256(payload), "completion payload digest");
  const trailer = frame.subarray(160 + payloadBytes);
  assert.equal(trailer.length, 64, "completion trailer must be last");
  assert.equal(trailer.subarray(0, 8).toString("ascii"), "CPEND001", "completion trailer magic");
  assert.equal(trailer.subarray(16, 32).toString("hex"), expected.attemptId, "completion trailer attempt");
  assert.equal(trailer.subarray(32).toString("hex"),
    sha256(Buffer.concat([frame.subarray(0, 160), payload])), "completion trailer digest");
}

export function verifyCandidate(candidateRoot, repositoryRoot = resolve(candidateRoot, "..", "..")) {
  const profilePath = join(candidateRoot, "contracts/fixed-runner-profile.json");
  const packetPath = join(candidateRoot, "contracts/no-run-successor.json");
  const profileBytes = readFileSync(profilePath);
  const profile = JSON.parse(profileBytes);
  const packet = readJson(packetPath);
  validateProfile(profile);

  const loaded = {};
  for (const [name, reference] of Object.entries(profile.components)) {
    loaded[name] = verifyRef(candidateRoot, repositoryRoot, name, reference);
  }
  assert.equal(profile.components.runtimeRoot.bytes, profile.runnerRoot.bytes, "root byte identity");
  assert.equal(profile.components.runtimeRoot.sha256, profile.runnerRoot.sha256, "root digest identity");

  const runnerSource = loaded.fixedRunnerSource.toString("utf8");
  const driverSource = loaded.supervisorDriverSource.toString("utf8");
  const effectHeader = loaded.supervisorEffectHeader.toString("utf8");
  assert.match(runnerSource, /C5B10_ROOT_BYTES UINT64_C\(100663296\)/u, "fixed runner root size");
  const digestBody = runnerSource.match(/c5b10_root_sha256\[[^\]]+\] = \{([^}]+)\}/su)?.[1] ?? "";
  const embeddedRootDigest = [...digestBody.matchAll(/0x([0-9a-f]{2})/gu)].map((match) => match[1]).join("");
  assert.equal(embeddedRootDigest, profile.runnerRoot.sha256, "fixed runner root digest");
  assert.doesNotMatch(runnerSource, /134217728|390a4786a20d45f1c691ec8c203f84f5e9d372a30e98f867cc8309a144ca6798/u,
    "historical runner/root identity must be absent");

  const runnerMain = runnerSource.slice(runnerSource.indexOf("int main("));
  const ready = runnerMain.indexOf("write_ready();");
  const authorization = runnerMain.indexOf("require_start_authorization();");
  const start = runnerMain.indexOf("krun_start_enter(context)");
  assert.equal(ready >= 0 && ready < authorization && authorization < start, true,
    "runner ready/start order");

  const runnerObjectSymbols = symbols(join(candidateRoot, profile.components.fixedRunnerObject.path));
  const supervisorObjectSymbols = symbols(join(candidateRoot, profile.components.supervisorDriverObject.path));
  const libkrunObjectSymbols = symbols(join(repositoryRoot, profile.components.libkrun.path));
  const runnerImports = runnerObjectSymbols.undefinedSymbols.filter((name) => name.startsWith("_krun_"));
  const supervisorKrunImports = supervisorObjectSymbols.undefinedSymbols.filter((name) => name.startsWith("_krun_"));
  const supervisorProviderImports = supervisorObjectSymbols.undefinedSymbols.filter((name) =>
    name.startsWith("_c5b10_supervisor_"));
  assert.deepEqual(runnerImports, libkrunSymbols, "runner libkrun import closure");
  assert.deepEqual(supervisorKrunImports, [], "Supervisor libkrun import boundary");
  assert.deepEqual(supervisorProviderImports, [...providerSymbols].sort(), "Supervisor per-effect ABI imports");
  assert.deepEqual(runnerObjectSymbols.undefinedSymbols.filter((name) => name.startsWith("_c5b10_supervisor_")), [],
    "runner must not implement/import Supervisor effects");
  assert.deepEqual(supervisorObjectSymbols.defined.filter((name) => name.startsWith("_c5b10_")),
    ["_c5b10_drive_registered_attempt"], "closed driver export surface");
  const exports = new Set(libkrunObjectSymbols.defined);
  assert.equal(libkrunSymbols.every((name) => exports.has(name)), true, "libkrun exports cover runner imports");

  const sourceProviders = [...driverSource.matchAll(/C5B10_CALL\((c5b10_supervisor_[a-z_]+)/gu)]
    .map((match) => `_${match[1]}`);
  assert.deepEqual(sourceProviders, providerSymbols.slice(0, 13), "nominal per-effect source order");
  const sourceEffects = sourceProviders.map((symbol) => symbol
    .replace(/^_c5b10_supervisor_/u, "")
    .replaceAll("_", "-")
    .replace("drain-validate-completion", "drain-and-validate-completion")
    .replace("prove-authoritative-absence", "prove-authoritative-absence")
    .replace("commit-durable-completion", "commit-durable-completion")
    .replace("deliver-stored-completion", "deliver-stored-completion"));
  assert.deepEqual(sourceEffects, nominalEffects, "nominal effect order");
  assert.match(driverSource, /fail_closed:[\s\S]*c5b10_supervisor_request_teardown/u,
    "fault-only teardown path");

  const headerProviders = [...effectHeader.matchAll(/int32_t (c5b10_supervisor_[a-z_]+)\(/gu)]
    .map((match) => `_${match[1]}`);
  assert.deepEqual(headerProviders, providerSymbols, "per-effect header ABI");
  assert.doesNotMatch(effectHeader, /\(\s*\*|\b(?:path|flags|image|mount|backend|environment|argv|envp)\b/iu,
    "effect ABI must not expose callbacks or caller-selected authority");
  assert.match(effectHeader, /c5b10_drive_registered_attempt\(const uint8_t registration_id\[16\]\)/u,
    "execute-by-registration-only entry");

  const expectedBindings = {
    registrationId: profile.executionRequest.registrationId,
    attemptId: profile.executionRequest.attemptId,
    planSha256: "a40c0d0ea77e600b338a50bd71994547b83c4c8aa4a0d8ffedd47ae0864ed35e",
    profileSha256: "06079eea39ce9a2e0547837555a6953787d8c32d614f0ec7b9b07ef408de04cd",
  };
  verifySourceOrInputFrame(loaded.sourceFrame, "CPSRC001", 1, expectedBindings);
  verifySourceOrInputFrame(loaded.inputFrame, "CPINP001", 2, expectedBindings);
  verifyCompletionFrame(loaded.completionFrame, expectedBindings);
  assert.equal(loaded.sourceFrame.length <= profile.transport.sourcePhysicalMaximum, true, "source cap");
  assert.equal(loaded.inputFrame.length <= profile.transport.inputPhysicalMaximum, true, "input cap");
  assert.equal(loaded.completionFrame.length <= profile.transport.completionPhysicalMaximum, true, "completion cap");
  assert.equal(loaded.completionFrame.length < profile.transport.completionRetentionBytes, true, "completion retention cap");

  assert.equal(packet.objectType, "capsule.c5b10.fixed-runner-no-run-packet");
  assert.equal(packet.status, "construction-only-not-authorized");
  assert.equal(packet.scopedStatus, "PASSED");
  assert.equal(packet.parentStatus, "BLOCKED");
  assert.equal(packet.profile.bytes, profileBytes.length, "packet profile bytes");
  assert.equal(packet.profile.sha256, sha256(profileBytes), "packet profile digest");
  assert.deepEqual(packet.executionRequest, profile.executionRequest, "packet execution request");
  assert.deepEqual(packet.authorization, profile.authorization, "packet authorization");
  assert.deepEqual(packet.performedEffects, profile.performedEffects, "packet performed effects");

  const sequence = readJson(join(candidateRoot, "fixtures/effect-sequence.json"));
  assert.deepEqual(sequence.nominalEffects, nominalEffects.map((effect, index) => ({ sequence: index + 1, effect })),
    "effect sequence fixture");
  assert.deepEqual(sequence.faultOnlyEffects, [{ sequence: 14, effect: "request-teardown" }]);
  assert.equal(sequence.performed, false);

  const manifestPath = join(candidateRoot, "manifests/archive-manifest.json");
  assert.equal(existsSync(manifestPath), true, "archive manifest missing");
  const manifest = readJson(manifestPath);
  const actual = filesBelow(candidateRoot).map((absolute) => {
    const bytes = readFileSync(absolute);
    return { path: relative(candidateRoot, absolute), bytes: bytes.length, sha256: sha256(bytes) };
  });
  assert.deepEqual(manifest.files, actual, "closed archive inventory");
  assert.equal(manifest.manifestSelfExcluded, true, "manifest self exclusion");
  assert.equal(manifest.files.some(({ path }) => /\.(dylib|ext4)$/u.test(path)), false,
    "large predecessor artifacts must remain references");

  return {
    status: "PASSED",
    parentC5b: "BLOCKED",
    retainedFiles: actual.length,
    runnerObjectSha256: profile.components.fixedRunnerObject.sha256,
    supervisorDriverObjectSha256: profile.components.supervisorDriverObject.sha256,
    runnerLibkrunImports: runnerImports.length,
    supervisorEffectImports: supervisorProviderImports.length,
    performedEffects: "NONE",
  };
}
