import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const experiment = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = resolve(experiment, "..", "..");
const files = [
  resolve(experiment, "README.md"),
  resolve(experiment, "RESULTS.md"),
  resolve(experiment, "HANDOFF.md"),
  resolve(experiment, "PROVENANCE.md"),
  resolve(repository, "docs", "MJS_SOURCE_VALIDATOR_IMPLEMENTATION_PLAN.md"),
  resolve(repository, "docs", "adr", "0035-select-disposable-mjs-source-validator.md"),
];

const missing = [];
for (const file of files) {
  const markdown = await readFile(file, "utf8");
  for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split("#", 1)[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    const path = resolve(dirname(file), decodeURIComponent(target));
    try {
      await access(path);
    } catch {
      missing.push({ file, target });
    }
  }
}

if (missing.length > 0) {
  console.error(JSON.stringify(missing, null, 2));
  process.exitCode = 1;
} else {
  console.log(`relative Markdown links verified: ${files.length} files`);
}
