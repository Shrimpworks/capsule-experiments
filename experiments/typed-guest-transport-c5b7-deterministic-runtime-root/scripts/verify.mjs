#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRoot, sha256 } from "./root-parser.mjs";

const root = resolve(process.argv[2] ?? dirname(fileURLToPath(import.meta.url)), process.argv[2] ? "." : "..");
const check = (condition, message) => { if (!condition) throw new Error(message); };
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const parsed = await parseRoot(join(root, "dist/runtime-root.ext4"));
const expectedPaths = {
  "/": [0o40755, null],
  "/dev": [0o40755, null],
  "/opt": [0o40755, null],
  "/opt/capsule": [0o40755, null],
  "/opt/capsule/inputs": [0o40555, null],
  "/opt/capsule/inputs/input.json": [0o100444, "9de0c909cfb111bd99c3b0b5f7a10972894270c2867022a71b6b6f3c0cd1af6e"],
  "/opt/capsule/inputs/main.mjs": [0o100444, "c8e940feb89b342de2d5e6bd13c413226676de9a539fce34c4107516e635b475"],
  "/opt/capsule/inputs/source-manifest.cbor": [0o100444, "712b1bd9739e4f6b0b027600207cbb08fb21b159a57bd34a15cf0ff8f32661b0"],
  "/proc": [0o40555, null],
  "/usr": [0o40755, null],
  "/usr/local": [0o40755, null],
  "/usr/local/bin": [0o40755, null],
  "/usr/local/bin/capsule-deno-core-c5b1": [0o100755, "e781a90236cdf1272a9a16189c6be033164fa25a5aa9e52376ef998982ec0a77"],
  "/usr/local/libexec": [0o40755, null],
  "/usr/local/libexec/capsule-init.krun": [0o100755, "c6c5f15dd386082e6b108c354afdca27327d6760efdefb54fe9d02e25b80e408"],
  "/usr/local/libexec/capsule-launcher": [0o100755, "278467cd82499590154a9b1a34b0189096d3927c49fefd228dedc2f4db36ea98"],
  "/usr/local/share": [0o40755, null],
  "/usr/local/share/capsule-deno-core": [0o40555, null],
  "/usr/local/share/capsule-deno-core/capsule_core_snapshot.bin": [0o100444, "4e8965217d5a6675a880326eee6f690bbeec7e7cb243decf2f3e9f453a871a2c"],
};
check(JSON.stringify([...parsed.paths.keys()].sort()) === JSON.stringify(Object.keys(expectedPaths).sort()), "root path inventory mismatch");
for (const [path, [mode, digest]] of Object.entries(expectedPaths)) {
  const value = parsed.paths.get(path);
  check(value.mode === mode, `mode mismatch: ${path}`);
  if (digest) check(sha256(value.bytes) === digest, `content mismatch: ${path}`);
}
check(parsed.digest === "5ad18f20cbc97c7a70ead3e795fd3649672513323041e913b0eb55b7acc88775", "root digest mismatch");

const profile = await json(join(root, "manifests/runtime-root-profile.json"));
check(profile.scopedConstructionStatus === "PASSED" && profile.controlledExecutionStatus === "BLOCKED" && profile.completeCompositeStatus === "BLOCKED", "status boundary mismatch");
check(profile.root.bytes === parsed.image.length && profile.root.sha256 === parsed.digest && profile.root.nodes === parsed.paths.size && profile.root.usedBlocks === parsed.usedBlocks, "root profile mismatch");
check(profile.root.versionedSuccessor === true && profile.root.c5b1ByteEquivalent === false, "successor identity boundary mismatch");
check(profile.effects && Object.values(profile.effects).every((value) => value === false), "effect boundary mismatch");
check(profile.metadataOnly.controller.mergeCommit === "60234e22674e46a42e8e5c382d85217a930c2c13" && profile.metadataOnly.effectAdapter.mergeCommit === "3cfe7db16c55894be444d4c783659043dbd25c95", "metadata-only pin mismatch");

const comparison = await json(join(root, "evidence/2026-08-13/build-comparison.json"));
check(comparison.builds === 2 && comparison.byteEqual === true && comparison.buildA.sha256 === parsed.digest && comparison.buildB.sha256 === parsed.digest && comparison.normalizationApplied === false, "A/B comparison mismatch");
const mutations = await json(join(root, "evidence/2026-08-13/mutation-dispositions.json"));
check(mutations.status === "PASSED" && mutations.cases.length === 10 && mutations.cases.every((entry) => entry.disposition === "REFUSED"), "mutation evidence mismatch");

const manifestPath = join(root, "manifests/archive-manifest.json");
const manifest = await json(manifestPath);
const actual = [];
async function walk(directory) {
  for (const name of (await readdir(directory)).sort()) {
    const path = join(directory, name);
    const metadata = await stat(path);
    if (metadata.isDirectory()) await walk(path);
    else if (path !== manifestPath) {
      const bytes = await readFile(path);
      actual.push({ path: relative(root, path), mode: (metadata.mode & 0o777).toString(8).padStart(4, "0"), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
  }
}
await walk(root);
check(manifest.closed === true && manifest.manifestSelfExcluded === true && JSON.stringify(manifest.retainedFiles) === JSON.stringify(actual), "archive inventory mismatch");
console.log(JSON.stringify({ result: "PASSED", rootSha256: parsed.digest, nodes: parsed.paths.size, usedBlocks: parsed.usedBlocks, retainedFiles: actual.length, effects: "NONE" }));
