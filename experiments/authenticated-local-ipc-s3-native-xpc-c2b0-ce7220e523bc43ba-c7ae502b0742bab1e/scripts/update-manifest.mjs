#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, "manifest.json");
const write = process.argv.includes("--write");

const paths = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".build" || entry.name === "manifest.json") continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile()) paths.push(path);
    else throw new Error(`non-regular archive entry: ${path}`);
  }
}
await walk(root);
paths.sort((left, right) => left.localeCompare(right));

const files = [];
for (const path of paths) {
  const bytes = await readFile(path);
  const metadata = await stat(path);
  files.push({
    path: relative(root, path),
    byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    mode: (metadata.mode & 0o777).toString(8).padStart(3, "0"),
  });
}
const manifest = {
  objectType: "capsule.experiment.authenticated-local-ipc-s3-native-xpc-c2b0-manifest",
  objectVersion: 0,
  status: "construction-only-execution-blocked",
  selfExcluded: true,
  fileCount: files.length,
  files,
};
const expected = `${JSON.stringify(manifest, null, 2)}\n`;
if (write) await writeFile(manifestPath, expected);
else if ((await readFile(manifestPath, "utf8")) !== expected) {
  throw new Error("manifest.json is not closed over the current retained tree");
}
console.log(JSON.stringify({ status: "PASSED", write, files: files.length }));
