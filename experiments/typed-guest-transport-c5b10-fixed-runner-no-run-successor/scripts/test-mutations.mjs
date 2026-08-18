#!/usr/bin/env node

import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyCandidate } from "./verify-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = resolve(root, "..", "..");
const mutationRoot = mkdtempSync(join(tmpdir(), "capsule-c5b10-mutations."));
const profilePath = (candidate) => join(candidate, "contracts/fixed-runner-profile.json");

function mutateProfile(candidate, mutate) {
  const path = profilePath(candidate);
  const value = JSON.parse(readFileSync(path, "utf8"));
  mutate(value);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

const cases = [
  ["runner-root-size", (candidate) => mutateProfile(candidate, (p) => { p.runnerRoot.bytes = 134217728; }), /runner\/root identity/u],
  ["runner-root-digest", (candidate) => mutateProfile(candidate, (p) => { p.runnerRoot.sha256 = "0".repeat(64); }), /runner\/root identity/u],
  ["effect-order", (candidate) => mutateProfile(candidate, (p) => { [p.ordering.nominalEffects[3], p.ordering.nominalEffects[6]] = [p.ordering.nominalEffects[6], p.ordering.nominalEffects[3]]; }), /deep-equal|Expected values|nominalEffects/u],
  ["per-effect-abi", (candidate) => mutateProfile(candidate, (p) => { p.effectAbi.providerSymbols.pop(); }), /deep-equal|Expected values|providerSymbols/u],
  ["supervisor-libkrun-import", (candidate) => mutateProfile(candidate, (p) => { p.ownership.supervisorLibkrunImports.push("_krun_create_ctx"); }), /deep-equal|Expected values|supervisorLibkrunImports/u],
  ["duplicate-libkrun-owner", (candidate) => mutateProfile(candidate, (p) => { p.ownership.duplicateLibkrunOwnership = true; }), /false/u],
  ["execute-request-widening", (candidate) => mutateProfile(candidate, (p) => { p.executionRequest.acceptedFields.push("sourceBytes"); }), /execute-by-registration/u],
  ["caller-authority", (candidate) => mutateProfile(candidate, (p) => { p.executionRequest.callerHostPaths = true; }), /execute-by-registration/u],
  ["host-presence", (candidate) => mutateProfile(candidate, (p) => { p.authorization.host = "host"; }), /authorization/u],
  ["guest-presence", (candidate) => mutateProfile(candidate, (p) => { p.authorization.guest = "guest"; }), /authorization/u],
  ["execution-authorization", (candidate) => mutateProfile(candidate, (p) => { p.authorization.executionAuthorized = true; }), /authorization/u],
  ["performed-effect", (candidate) => mutateProfile(candidate, (p) => { p.performedEffects.runnerStarted = true; }), /performed effects/u],
  ["completion-last", (candidate) => mutateProfile(candidate, (p) => { p.ordering.completionLast = false; }), /true/u],
  ["teardown-order", (candidate) => mutateProfile(candidate, (p) => { p.ordering.absenceBeforeRootRemoval = false; }), /true/u],
  ["contradiction-reopened", (candidate) => mutateProfile(candidate, (p) => { p.contradictionResolutions.singleLibkrunOwner.resolved = false; }), /resolved/u],
  ["component-substitution", (candidate) => mutateProfile(candidate, (p) => { p.components.fixedRunnerObject.sha256 = "0".repeat(64); }), /fixedRunnerObject digest/u],
  ["closed-inventory-extra", (candidate) => writeFileSync(join(candidate, "undeclared-authority.txt"), "unexpected\n"), /closed archive inventory/u],
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

console.log(`C5b10 restored-invalid mutation verification PASSED (${completed} cases)`);
console.log("No native candidate artifact was mutated, loaded, or executed; mutations used disposable copies of metadata/source inventory only.");
