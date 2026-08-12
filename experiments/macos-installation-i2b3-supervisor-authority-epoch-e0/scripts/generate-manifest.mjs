import { createHash } from "node:crypto";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, "manifest.json");
const maximumFiles = 64;

async function inventory(directory) {
  const entries = [];
  for (const name of (await readdir(directory)).sort()) {
    const path = resolve(directory, name);
    const rel = relative(root, path);
    if (rel === "manifest.json") continue;
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error(`symbolic link refused: ${rel}`);
    if (stat.isDirectory()) {
      entries.push(...(await inventory(path)));
      continue;
    }
    if (!stat.isFile()) throw new Error(`non-regular entry refused: ${rel}`);
    const bytes = await readFile(path);
    entries.push({
      path: rel,
      bytes: bytes.length,
      mode: (stat.mode & 0o777).toString(8).padStart(4, "0"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  return entries;
}

const files = await inventory(root);
if (files.length > maximumFiles) {
  throw new Error(`closed file cap exceeded: ${files.length} > ${maximumFiles}`);
}
const manifest = {
  schema: "capsule.experiment.supervisor-authority-epoch-e0-manifest/v0",
  capsuleInputCommit: "88f3a2c1f968b1aa604ce14a2db4389822e5b193",
  archiveBaseCommit: "8ae2cd1cbebdff403fe354da15eac4e27b461765",
  scope: "deterministic-unsigned-no-launch-e0-construction",
  excludedFromFileInventory: ["manifest.json"],
  maximumFiles,
  fileCount: files.length,
  files,
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
