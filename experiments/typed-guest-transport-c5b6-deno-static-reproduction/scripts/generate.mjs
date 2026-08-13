import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "manifests", "archive-manifest.json");
const entries = [];
const walk = (directory) => {
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else if (path !== output) {
      const bytes = readFileSync(path);
      entries.push({
        path: relative(root, path),
        bytes: stat.size,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
};
walk(root);
const manifest = {
  identity: "capsule.typed-guest-transport.c5b6-deno-static-reproduction.archive/v1",
  closed: true,
  entries,
};
const rendered = `${JSON.stringify(manifest, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (readFileSync(output, "utf8") !== rendered) throw new Error("archive manifest is stale");
} else writeFileSync(output, rendered);
console.log(`archive.entries=${entries.length}`);
