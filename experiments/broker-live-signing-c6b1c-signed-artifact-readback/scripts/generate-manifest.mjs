import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "manifest.json");
const files = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`symlink refused: ${relative}`);
    if (entry.isDirectory()) walk(absolute);
    else if (relative !== "manifest.json") {
      const bytes = fs.readFileSync(absolute);
      files.push({
        path: relative,
        bytes: bytes.length,
        mode: (stat.mode & 0o777).toString(8).padStart(4, "0"),
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
};
walk(root);
const manifest = {
  schema: "capsule.experiment.closed-file-manifest/v0",
  selfExcluded: true,
  retainedFileCount: files.length,
  files,
};
const encoded = `${JSON.stringify(manifest, null, 2)}\n`;
if (process.argv.includes("--write")) fs.writeFileSync(manifestPath, encoded);
else {
  if (fs.readFileSync(manifestPath, "utf8") !== encoded) throw new Error("manifest mismatch");
  console.log(JSON.stringify({ status: "PASSED", retainedFileCount: files.length }));
}
