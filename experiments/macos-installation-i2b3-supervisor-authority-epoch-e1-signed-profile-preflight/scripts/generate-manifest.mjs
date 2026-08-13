#!/usr/bin/env node
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "manifest.json");
const check = process.argv.includes("--check");

async function filesBelow(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await filesBelow(absolute)));
    else if (entry.isFile()) output.push(absolute);
    else throw new Error(`unsupported archive entry: ${absolute}`);
  }
  return output;
}

const files = (await filesBelow(root))
  .filter((file) => file !== manifestPath)
  .map((file) => path.relative(root, file))
  .sort();
const retained = [];
for (const relative of files) {
  const bytes = await fs.readFile(path.join(root, relative));
  retained.push({
    path: relative,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
const manifest = {
  schema: "capsule.experiment.closed-archive-manifest/v0",
  root: "experiments/macos-installation-i2b3-supervisor-authority-epoch-e1-signed-profile-preflight",
  selfExcluded: "manifest.json",
  retained,
};
const encoded = `${JSON.stringify(manifest, null, 2)}\n`;
if (check) {
  const existing = await fs.readFile(manifestPath, "utf8");
  if (existing !== encoded) throw new Error("manifest is stale");
} else {
  await fs.writeFile(manifestPath, encoded);
}
console.log(`verified ${retained.length} retained files`);
