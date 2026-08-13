#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = "manifests/archive-manifest.json";
const check = process.argv.includes("--check");
if (process.argv.length > (check ? 3 : 2)) throw new Error("usage: generate.mjs [--check]");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const walk = (directory = root) => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [relative(root, path)];
  })
  .filter((path) => path !== manifestPath)
  .sort();

for (const path of walk().filter((path) => path.endsWith(".json"))) {
  const text = readFileSync(join(root, path), "utf8");
  const normalized = `${JSON.stringify(JSON.parse(text), null, 2)}\n`;
  if (text !== normalized) throw new Error(`JSON is not canonical pretty form: ${path}`);
}

const entries = walk().map((path) => {
  const bytes = readFileSync(join(root, path));
  return { path, mode: statSync(join(root, path)).mode & 0o111 ? "0755" : "0644", bytes: bytes.length, sha256: digest(bytes) };
});
const manifest = {
  objectType: "capsule.experiment.archive-manifest",
  objectVersion: 1,
  experiment: "typed-guest-transport-c5b3-runtime-input-recovery",
  excludes: [manifestPath],
  entryCount: entries.length,
  entries,
};
const encoded = `${JSON.stringify(manifest, null, 2)}\n`;
if (check) {
  if (readFileSync(join(root, manifestPath), "utf8") !== encoded) throw new Error("archive manifest is stale");
  console.log(`archiveManifest=PASS entries=${entries.length}`);
} else {
  writeFileSync(join(root, manifestPath), encoded);
  console.log(`archiveManifest=WROTE entries=${entries.length}`);
}
