import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, lstat } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedFiles = [
  "HANDOFF.md",
  "README.md",
  "RESULTS.md",
  "evidence/preflight.json",
  "manifest.json",
  "scripts/verify.mjs",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = resolve(path, entry.name);
    const stat = await lstat(entryPath);
    assert.equal(stat.isSymbolicLink(), false, `symbolic link refused: ${entryPath}`);
    if (entry.isDirectory()) files.push(...await walk(entryPath));
    else files.push(relative(root, entryPath));
  }
  return files.sort();
}

const observedFiles = await walk(root);
assert.deepEqual(observedFiles, expectedFiles, "closed retained file set changed");

const receipt = JSON.parse(await readFile(resolve(root, "evidence/preflight.json"), "utf8"));
assert.deepEqual(Object.keys(receipt), [
  "schema", "date", "status", "reason", "inputs", "host", "preflight",
  "mutationBoundary", "result",
]);
assert.equal(receipt.schema, "capsule.experiment.supervisor-authority-epoch-e1-preflight/v0");
assert.equal(receipt.status, "BLOCKED");
assert.equal(receipt.reason, "exact-legacy-negative-profile-unavailable");
assert.equal(receipt.inputs.capsuleExperimentsBaseCommit, "3d7bd46352506bf6018286749c2c85a3e2f683df");
assert.equal(receipt.inputs.e0ArchiveMergeCommit, "dee784d40684100f8315720fab9a5cd3399f492b");
assert.equal(receipt.inputs.e0ManifestSha256, "b5d21ed3c2b14053325d5f1af66ceb59389e5fd31d8d2dd33274e8ca37525936");
assert.equal(receipt.inputs.capsuleGoverningCommit, "16fb810b97e7ff2a157a251ae4dc8023dcfc01b4");
assert.equal(receipt.inputs.teamIdentifier, "3DDR84M4JS");
assert.deepEqual(receipt.inputs.legacyProfile, {
  name: "Capsule I2B3 Supervisor Bootstrap Development 3DDR",
  uuid: "c45a058b-ffdd-4a6b-bd8c-d746772a2702",
  cmsSha256: "964f79980edf22a7280fe19e52893a1e40b0a8639d5bbe3d5dc8fdfada9c6c76",
  rawBytesRetained: false,
  available: false,
});
assert.deepEqual(receipt.host, {
  ownerLabel: "dsteele-shrimp-mbp18-4-01",
  model: "MacBookPro18,4",
  architecture: "arm64",
  macOSVersion: "26.5.2",
  macOSBuild: "25F84",
  xcodeVersion: "26.6",
  xcodeBuild: "17F113",
  sdkVersion: "26.5",
  clangVersion: "Apple clang version 21.0.0 (clang-2100.1.1.101)",
  euid: 501,
  sessionDomain: "gui/501",
  sessionType: "Aqua",
});
assert.deepEqual(receipt.preflight, {
  immutableInputsMatched: true,
  hostFactsMatched: true,
  evidenceRootAbsent: true,
  evidenceLeafAbsent: true,
  githubKeychainAuthenticationAvailable: true,
  legacyProfileAvailable: false,
  finalSharedEvidenceRootPresentFromParallelTask: true,
  finalEvidenceLeafAbsent: true,
});
assert.ok(Object.values(receipt.mutationBoundary).every((value) => value === false));
assert.deepEqual(receipt.result, {
  preflight: "BLOCKED",
  e1IdentitySeparation: "BLOCKED",
  installedOwnerLock: "BLOCKED",
  adr0045: "Proposed",
  productAdmission: "BLOCKED",
});

const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
assert.equal(manifest.schema, "capsule.experiment.supervisor-authority-epoch-e1-manifest/v0");
assert.equal(manifest.selfExcluded, true);
assert.equal(manifest.fileCount, expectedFiles.length - 1);
assert.deepEqual(manifest.files.map((entry) => entry.path), expectedFiles.filter((path) => path !== "manifest.json"));
for (const entry of manifest.files) {
  assert.deepEqual(Object.keys(entry), ["path", "bytes", "mode", "sha256"]);
  const bytes = await readFile(resolve(root, entry.path));
  const stat = await lstat(resolve(root, entry.path));
  assert.equal(entry.bytes, bytes.length, `${entry.path} size changed`);
  assert.equal(entry.mode, (stat.mode & 0o777).toString(8).padStart(4, "0"), `${entry.path} mode changed`);
  assert.equal(entry.sha256, sha256(bytes), `${entry.path} digest changed`);
}

for (const path of ["README.md", "RESULTS.md", "HANDOFF.md"]) {
  const text = await readFile(resolve(root, path), "utf8");
  assert.match(text, /`BLOCKED`/);
  assert.doesNotMatch(text, /product admission.*`PASSED`/i);
}

console.log(JSON.stringify({
  status: "PASSED",
  retainedResult: "BLOCKED",
  fileCount: manifest.fileCount,
  manifestSha256: sha256(await readFile(resolve(root, "manifest.json"))),
  mutationCount: Object.keys(receipt.mutationBoundary).length,
  allMutationsFalse: true,
}, null, 2));
