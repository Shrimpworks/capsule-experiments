import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const canonical = resolve(root, "..", "..", "schemas", "conformance", "v0", "mjs-source");
const binary = resolve(root, "target", "release", "capsule-mjs-oxc-probe");
const accepted = new Set([
  "property-import-meta",
  "method-import",
  "eval-string-data",
  "local-export",
  "noncode-spellings",
]);
const commonjs = new Set([
  "commonjs-require",
  "commonjs-require-resolve",
  "commonjs-module-exports",
  "commonjs-exports",
  "commonjs-dirname",
  "commonjs-filename",
]);

const names = [
  "property-import-meta",
  "method-import",
  "template-interpolation-import",
  "eval-string-data",
  "division-regexp-counterexample",
  "static-import",
  "side-effect-import",
  "export-from",
  "export-star",
  "import-meta",
  "specifier-absolute",
  "specifier-bare",
  "specifier-node",
  "specifier-npm",
  "specifier-http",
  "specifier-https",
  "specifier-data",
  "specifier-blob",
  "specifier-file",
  "specifier-capsule",
  ...commonjs,
  "local-export",
  "noncode-spellings",
];
const paths = names.map((name) => resolve(canonical, `language-hold-${name}.mjs`));
const probe = spawnSync(binary, ["--m1-hold", ...paths], {
  encoding: "utf8",
  maxBuffer: 4 * 1024 * 1024,
});
if (probe.status !== 0) throw new Error(`Oxc M1 mapping failed: ${probe.stderr}`);

const rows = probe.stdout.trimEnd().split("\n");
const output = [
  "id\tm1_expected\towned_layer\tparse\tcombined_policy\tstatic_import\texport_from\timport_expression\timport_meta\tfree_commonjs_references\tagrees\tfixture_sha256",
];
const mismatches = [];
for (let index = 0; index < names.length; index += 1) {
  const [
    path,
    parse,
    policy,
    staticImport,
    exportFrom,
    importExpression,
    importMeta,
    commonjsCount,
  ] = rows[index].split("\t");
  if (path !== paths[index]) throw new Error(`M1 output ordering mismatch for ${names[index]}`);
  const expected = accepted.has(names[index]) ? "allow" : "deny";
  const layer = commonjs.has(names[index]) ? "semantic-free-commonjs-reference" : "module-grammar";
  const agrees = parse === "valid" && policy === expected;
  const fixture = await readFile(paths[index]);
  output.push(
    [
      names[index],
      expected,
      layer,
      parse,
      policy,
      staticImport,
      exportFrom,
      importExpression,
      importMeta,
      commonjsCount,
      String(agrees),
      createHash("sha256").update(fixture).digest("hex"),
    ].join("\t"),
  );
  if (!agrees) mismatches.push({ id: names[index], expected, parse, policy });
}

await writeFile(resolve(root, "evidence", "m1-hold-mapping.tsv"), `${output.join("\n")}\n`);
const summary = {
  canonicalBase: "schemas/conformance/v0/mjs-source/language-hold-*.mjs",
  cases: names.length,
  moduleGrammarCases: names.length - commonjs.size,
  freeCommonjsReferenceCases: commonjs.size,
  mismatches,
};
await writeFile(
  resolve(root, "evidence", "m1-hold-verification.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);
console.log(JSON.stringify(summary, null, 2));
if (mismatches.length > 0) process.exitCode = 1;
