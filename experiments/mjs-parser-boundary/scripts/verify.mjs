import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidence = resolve(root, "evidence");
const manifestPath = resolve(root, "fixtures", "manifest.tsv");
const manifestText = await readFile(manifestPath, "utf8");
const cases = manifestText
  .split("\n")
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => {
    const [id, parse, policy, staticImport, exportFrom, importExpression, importMeta, provenance] =
      line.split("\t");
    return {
      id,
      path: resolve(root, "fixtures", "cases", `${id}.mjs`),
      expected: [parse, policy, staticImport, exportFrom, importExpression, importMeta],
      provenance,
    };
  });

const bins = {
  oxc: resolve(root, "target", "release", "capsule-mjs-oxc-probe"),
  denoAst: resolve(root, "target", "release", "capsule-mjs-deno-ast-probe"),
  treeSitter: resolve(root, "target", "release", "capsule-mjs-tree-sitter-control"),
  v8: resolve(root, "target", "release", "capsule-mjs-v8-compile-control"),
};

function run(binary, paths) {
  const result = spawnSync(binary, paths, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`${binary} exited ${result.status}: ${result.stderr}`);
  }
  return result.stdout.trimEnd();
}

function parseFull(output) {
  const rows = new Map();
  for (const line of output.split("\n")) {
    const fields = line.split("\t");
    const id = fields[0]
      .split("/")
      .at(-1)
      .replace(/\.mjs$/, "");
    rows.set(id, fields.slice(1));
  }
  return rows;
}

await mkdir(evidence, { recursive: true });
const summary = {
  manifestSha256: createHash("sha256").update(manifestText).digest("hex"),
  cases: cases.length,
  candidates: {},
};
for (const name of ["oxc", "denoAst", "treeSitter"]) {
  const output = run(
    bins[name],
    cases.map((item) => item.path),
  );
  const rows = parseFull(output);
  const mismatches = [];
  for (const item of cases) {
    const actual = rows.get(item.id);
    if (JSON.stringify(actual) !== JSON.stringify(item.expected)) {
      mismatches.push({ id: item.id, expected: item.expected, actual });
    }
  }
  const repetitions = [];
  for (let index = 0; index < 20; index += 1) {
    repetitions.push(
      createHash("sha256")
        .update(
          run(
            bins[name],
            cases.map((item) => item.path),
          ),
        )
        .digest("hex"),
    );
  }
  summary.candidates[name] = {
    outputSha256: createHash("sha256").update(output).digest("hex"),
    deterministic: new Set(repetitions).size === 1,
    mismatches,
  };
  await writeFile(resolve(evidence, `${name}-classification.tsv`), `${output}\n`);
}

const v8Output = run(
  bins.v8,
  cases.map((item) => item.path),
);
summary.candidates.v8 = {
  outputSha256: createHash("sha256").update(v8Output).digest("hex"),
  note: "compile-module/GetModuleRequests control; dynamic import and import.meta are unsupported observations",
};
await writeFile(resolve(evidence, "v8-classification.tsv"), `${v8Output}\n`);
await writeFile(resolve(evidence, "verification.json"), `${JSON.stringify(summary, null, 2)}\n`);

if (!summary.candidates.oxc.deterministic || summary.candidates.oxc.mismatches.length > 0) {
  process.exitCode = 1;
}
console.log(JSON.stringify(summary, null, 2));
