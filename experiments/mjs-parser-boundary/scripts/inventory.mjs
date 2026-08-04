import { spawnSync } from "node:child_process";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cargo = spawnSync(
  "cargo",
  [
    "+1.95.0",
    "metadata",
    "--offline",
    "--format-version",
    "1",
    "--manifest-path",
    resolve(root, "Cargo.toml"),
  ],
  {
    encoding: "utf8",
    env: { ...process.env, CARGO_NET_OFFLINE: "true" },
    maxBuffer: 64 * 1024 * 1024,
  },
);
if (cargo.status !== 0) throw new Error(cargo.stderr);
const metadata = JSON.parse(cargo.stdout);
const packageById = new Map(metadata.packages.map((item) => [item.id, item]));
const nodeById = new Map(metadata.resolve.nodes.map((item) => [item.id, item]));
const lockText = await readFile(resolve(root, "Cargo.lock"), "utf8");
const checksums = new Map();
for (const block of lockText.split("[[package]]").slice(1)) {
  const name = block.match(/^\s*name = "([^"]+)"/m)?.[1];
  const version = block.match(/^\s*version = "([^"]+)"/m)?.[1];
  const checksum = block.match(/^\s*checksum = "([^"]+)"/m)?.[1] ?? null;
  if (name && version) checksums.set(`${name}@${version}`, checksum);
}

async function size(path) {
  let total = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const item = resolve(path, entry.name);
    if (entry.isDirectory()) total += await size(item);
    else if (entry.isFile()) total += (await stat(item)).size;
  }
  return total;
}

const roots = {
  oxc: "capsule-mjs-oxc-probe",
  denoAst: "capsule-mjs-deno-ast-probe",
  treeSitter: "capsule-mjs-tree-sitter-control",
  v8: "capsule-mjs-v8-compile-control",
};
const result = {};
for (const [candidate, packageName] of Object.entries(roots)) {
  const rootPackage = metadata.packages.find((item) => item.name === packageName);
  const seen = new Set();
  const visit = (id) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const dep of nodeById.get(id)?.deps ?? []) visit(dep.pkg);
  };
  visit(rootPackage.id);
  seen.delete(rootPackage.id);
  const packages = [];
  for (const id of [...seen].sort()) {
    const item = packageById.get(id);
    const path = dirname(item.manifest_path);
    packages.push({
      name: item.name,
      version: item.version,
      checksum: checksums.get(`${item.name}@${item.version}`) ?? null,
      license: item.license,
      source: item.source,
      sourceBytes: await size(path),
    });
  }
  const binary = resolve(root, "target", "release", packageName);
  result[candidate] = {
    directDependencies: rootPackage.dependencies.map((item) => `${item.name}@${item.req}`),
    transitivePackageCount: packages.length,
    sourceBytes: packages.reduce((sum, item) => sum + item.sourceBytes, 0),
    binaryBytes: (await stat(binary)).size,
    licenses: [...new Set(packages.map((item) => item.license ?? "UNKNOWN"))].sort(),
    packages,
  };
}
await writeFile(
  resolve(root, "evidence", "supply-chain.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(result).map(([name, item]) => [
        name,
        {
          transitivePackageCount: item.transitivePackageCount,
          sourceBytes: item.sourceBytes,
          binaryBytes: item.binaryBytes,
          licenses: item.licenses,
        },
      ]),
    ),
    null,
    2,
  ),
);
