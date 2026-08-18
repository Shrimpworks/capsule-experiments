#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const frameCase = (name, component, offset, writer, expected) => [name, (candidate) =>
  mutateComponent(candidate, component, (bytes) => writer(bytes, offset)), expected];

const cases = [
  ["runner-root-size", (c) => mutateProfile(c, (p) => { p.runnerRoot.bytes = 134217728; }), /100663296/u],
  ["runner-root-digest", (c) => mutateProfile(c, (p) => { p.runnerRoot.sha256 = "0".repeat(64); }), /Expected values/u],
  ["stale-c5b8-profile", (c) => mutateProfile(c, (p) => { p.bindingLayers.attemptRuntimeProfile.sha256 = "06079eea39ce9a2e0547837555a6953787d8c32d614f0ec7b9b07ef408de04cd"; }), /Expected values|not equal/u],
  ["frame-profile-substitution", (c) => mutateComponent(c, "sourceFrame", (b) => b.fill(0, 80, 112)), /CPSRC001 profile/u],
  ["effect-echo-profile-removal", (c) => mutateDriverSource(c,
    "result->profile_sha256", "result->profile_sha25x"), /profile echo validation/u],
  ["source-reconciliation-absence", (c) => mutateDriverSource(c,
    "c5b11_supervisor_reconcile_authoritative_absence", "c5b11_supervisor_reconcile_authoritative_absencx"),
  /created-attempt convergence/u],
  ["source-reconciliation-root-removal", (c) => mutateDriverSource(c,
    "c5b11_supervisor_reconcile_fixed_root_removal", "c5b11_supervisor_reconcile_fixed_root_removaX"),
  /created-attempt convergence/u],
  ["source-teardown-reconciliation", (c) => mutateDriverSource(c,
    "c5b11_supervisor_reconcile_teardown_outcome", "c5b11_supervisor_reconcile_teardown_outcomX"),
  /created-attempt convergence/u],
  ["source-unresolved-cleanup", (c) => mutateDriverSource(c,
    "return durable_unresolved", "return durable_unresolveX"), /durable unresolved path/u],
  ["source-stored-completion-replay", (c) => mutateDriverSource(c,
    "c5b11_supervisor_replay_stored_completion", "c5b11_supervisor_replay_stored_completioX"),
  /completion response-loss convergence/u],
  ["stored-completion-frame-binding", (c) => mutateGeneratedBindings(c),
    /generated completion\/replay binding/u],
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
  frameCase("completion-protocol", "completionFrame", 8, (b, o) => b.writeUInt16BE(2, o), /completion protocol/u),
  frameCase("completion-method", "completionFrame", 10, (b, o) => b.writeUInt16BE(2, o), /completion method/u),
  frameCase("completion-registration", "completionFrame", 32, (b, o) => b.fill(0, o, o + 16), /completion registration/u),
  frameCase("completion-status", "completionFrame", 112, (b, o) => b.writeUInt16BE(2, o), /completion status/u),
  frameCase("completion-flags", "completionFrame", 114, (b, o) => b.writeUInt16BE(1, o), /completion flags/u),
  frameCase("completion-reserved", "completionFrame", 116, (b, o) => b.writeUInt32BE(1, o), /completion reserved/u),
  frameCase("completion-trailer-protocol", "completionFrame", 203, (b) => b.writeUInt16BE(2, b.length - 56), /trailer protocol/u),
  frameCase("completion-trailer-method", "completionFrame", 205, (b) => b.writeUInt16BE(2, b.length - 54), /trailer method/u),
  frameCase("completion-trailer-role", "completionFrame", 207, (b) => b.writeUInt16BE(2, b.length - 52), /trailer role/u),
  frameCase("completion-trailer-length", "completionFrame", 209, (b) => b.writeUInt16BE(63, b.length - 50), /trailer length/u),
  ["reconciliation-absence", (c) => mutateMatrix(c, (m) => { for (const x of m.primaryFailureCases.filter((x) => x.processCreated && x.sequence < 12)) x.trace = x.trace.filter((v) => v !== "reconcile-authoritative-absence"); }), /reconciliation state matrix/u],
  ["reconciliation-root-removal", (c) => mutateMatrix(c, (m) => { for (const x of m.primaryFailureCases.filter((x) => x.processCreated && x.sequence < 12)) x.trace = x.trace.filter((v) => v !== "reconcile-fixed-root-removal"); }), /reconciliation state matrix/u],
  ["reconciliation-teardown", (c) => mutateMatrix(c, (m) => { for (const x of m.primaryFailureCases.filter((x) => x.processCreated && x.sequence < 12)) x.trace = x.trace.filter((v) => v !== "reconcile-teardown-outcome"); for (const x of m.teardownOutcomeCases) x.trace = x.trace.filter((v) => v !== "reconcile-teardown-outcome"); }), /reconciliation state matrix/u],
  ["unresolved-cleanup", (c) => mutateMatrix(c, (m) => { for (const x of [...m.createdRecoveryFailureCases, ...m.completionRecoveryFailureCases]) x.trace.pop(); }), /reconciliation state matrix/u],
  ["stored-completion-replay", (c) => mutateMatrix(c, (m) => { for (const x of m.primaryFailureCases.filter((x) => x.sequence >= 12)) x.trace.pop(); }), /reconciliation state matrix/u],
  ["component-substitution", (c) => mutateProfile(c, (p) => { p.components.fixedRunnerObject.sha256 = "0".repeat(64); }), /fixedRunnerObject digest/u],
  ["closed-inventory-extra", (c) => writeFileSync(join(c, "undeclared-authority.txt"), "unexpected\n"), /closed archive inventory/u],
];

let completed = 0;
try {
  assert.equal(verifyCandidate(root, repository).status, "PASSED");
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
