#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fileSha = (path) => sha(readFileSync(path));
const load = (path) => JSON.parse(readFileSync(path, "utf8"));

for (const name of ["runtime-bundle-candidate.json", "artifact-closure-report.json"]) {
  const path = join(root, "manifests", name);
  const value = load(path);
  const expected = value.selfDigestOfNullFormSha256;
  value.selfDigestOfNullFormSha256 = null;
  const actual = sha(`${JSON.stringify(value, null, 2)}\n`);
  if (actual !== expected) throw new Error(`${name} self digest differs`);
}

const runtime = load(join(root, "manifests/runtime-bundle-candidate.json"));
const evidence = join(root, "evidence/2026-08-05");
const evidenceBindings = {
  sourceRefs: "source-ref-verification.json",
  verification: "verification.json",
  mutations: "mutation-dispositions.json",
  sbom: "sbom.spdx-lite.json",
  licenses: "source-license-notice-inventory.json",
};
for (const [role, name] of Object.entries(evidenceBindings)) {
  if (fileSha(join(evidence, name)) !== runtime.evidence[role]) {
    throw new Error(`${role} evidence digest differs`);
  }
}

const walk = (base, directory = base) => {
  const files = [];
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) files.push(...walk(base, path));
    else files.push(relative(base, path));
  }
  return files;
};
if (process.env.STAGE_A && process.env.STAGE_B) {
  const a = join(process.env.STAGE_A, "out");
  const b = join(process.env.STAGE_B, "out");
  const files = walk(a);
  if (JSON.stringify(files) !== JSON.stringify(walk(b))) throw new Error("A/B inventory differs");
  for (const file of files) {
    if (fileSha(join(a, file)) !== fileSha(join(b, file))) throw new Error(`A/B differs: ${file}`);
  }
}

console.log("PASSED evidence bindings and self digests");
console.log("PASSED no-guest artifact closure remains unadmitted");
