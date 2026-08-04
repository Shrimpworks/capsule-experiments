#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const experimentDir = dirname(fileURLToPath(import.meta.url));
const sourceRoot = process.env.CAPSULE_LIBKRUN_SOURCE ?? "/private/tmp/capsule-libkrun-v1.19.4";
const output = resolve(experimentDir, "evidence/sbom-input.cdx.json");
const commit = "728df8125077d0db44265f6e997c72b81b65c015";

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const metadata = JSON.parse(
  execFileSync(
    "cargo",
    [
      "metadata",
      "--format-version",
      "1",
      "--locked",
      "--offline",
      "--filter-platform",
      "aarch64-apple-darwin",
      "--features",
      "libkrun/blk",
      "--manifest-path",
      join(sourceRoot, "Cargo.toml"),
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  ),
);

const packageById = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
const nodeById = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
const libkrun = metadata.packages.find((pkg) => pkg.name === "libkrun" && pkg.version === "1.19.4");
if (!libkrun) {
  throw new Error("libkrun 1.19.4 was not present in Cargo metadata");
}

function dependencyClosure(roots) {
  const closure = new Set();
  const queue = [...roots];
  while (queue.length > 0) {
    const id = queue.pop();
    if (closure.has(id)) continue;
    closure.add(id);
    const node = nodeById.get(id);
    if (!node) continue;
    for (const dependency of node.deps) {
      const isRuntimeOrBuild = dependency.dep_kinds.some(
        (kind) => kind.kind === null || kind.kind === "build",
      );
      if (isRuntimeOrBuild) queue.push(dependency.pkg);
    }
  }
  return closure;
}

const runtimeSelected = dependencyClosure([libkrun.id]);
// The retained Makefile runs Cargo at the virtual-workspace root, so all
// workspace default members and their build dependencies are builder inputs.
const selected = dependencyClosure(metadata.workspace_default_members);

function purlFor(pkg) {
  const external = pkg.source?.startsWith("registry+") ?? false;
  return external
    ? `pkg:cargo/${encodeURIComponent(pkg.name)}@${encodeURIComponent(pkg.version)}`
    : `pkg:generic/libkrun/${encodeURIComponent(pkg.name)}@${encodeURIComponent(pkg.version)}?commit=${commit}`;
}

function componentFor(pkg) {
  const external = pkg.source?.startsWith("registry+") ?? false;
  const purl = purlFor(pkg);
  const component = {
    type: "library",
    "bom-ref": purl,
    name: pkg.name,
    version: pkg.version,
    scope: runtimeSelected.has(pkg.id) ? "required" : "excluded",
    purl,
    properties: [
      {
        name: "capsule:dependency-scope",
        value: external ? "cargo-registry" : "libkrun-workspace",
      },
      {
        name: "capsule:source",
        value: pkg.source ?? `git+https://github.com/libkrun/libkrun@${commit}`,
      },
      {
        name: "capsule:dependency-role",
        value: runtimeSelected.has(pkg.id) ? "final-runtime-closure" : "build-only-workspace-input",
      },
    ],
  };
  if (pkg.license) component.licenses = [{ expression: pkg.license }];
  if (!pkg.license && pkg.license_file) {
    const licenseFilePath = resolve(dirname(pkg.manifest_path), pkg.license_file);
    component.licenses = [{ license: { name: `LicenseRef-${pkg.name}` } }];
    component.properties.push(
      { name: "capsule:license-file", value: pkg.license_file },
      { name: "capsule:license-file-sha256", value: sha256(licenseFilePath) },
    );
  }
  const checksumPath = join(dirname(pkg.manifest_path), ".cargo-checksum.json");
  try {
    const checksum = JSON.parse(readFileSync(checksumPath, "utf8")).package;
    if (checksum) component.hashes = [{ alg: "SHA-256", content: checksum }];
  } catch {
    // Workspace components are bound by the source commit and material digests.
  }
  return component;
}

const components = [...selected]
  .map((id) => componentFor(packageById.get(id)))
  .sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));

components.push(
  {
    type: "firmware",
    "bom-ref": "pkg:generic/libkrunfw@5.5.0",
    name: "libkrunfw",
    version: "5.5.0",
    purl: "pkg:generic/libkrunfw@5.5.0",
    licenses: [{ expression: "LGPL-2.1-only" }],
    hashes: [
      {
        alg: "SHA-256",
        content: "96561a4e5dccec0364a28ac32c5668e13e31180d083f412c9f8be7599380c70d",
      },
    ],
    properties: [
      { name: "capsule:hash-subject", value: "upstream-prebuilt-kernel.c" },
      { name: "capsule:source-tag", value: "v5.5.0" },
    ],
  },
  {
    type: "operating-system",
    "bom-ref": "pkg:generic/linux-kernel@6.12.91",
    name: "Linux kernel",
    version: "6.12.91",
    purl: "pkg:generic/linux-kernel@6.12.91",
    licenses: [{ expression: "GPL-2.0-only" }],
    properties: [
      { name: "capsule:embedded-by", value: "libkrunfw 5.5.0" },
      { name: "capsule:source-publication-required", value: "true" },
    ],
  },
);

const dependencies = [...selected].sort().map((id) => {
  const node = nodeById.get(id);
  const dependsOn = node
    ? node.deps
        .filter(
          (dependency) =>
            selected.has(dependency.pkg) &&
            dependency.dep_kinds.some((kind) => kind.kind === null || kind.kind === "build"),
        )
        .map((dependency) => purlFor(packageById.get(dependency.pkg)))
        .sort()
    : [];
  return { ref: purlFor(packageById.get(id)), dependsOn };
});
dependencies.unshift({
  ref: "capsule-libkrun-hvf-development-profile",
  dependsOn: [purlFor(libkrun), "pkg:generic/libkrunfw@5.5.0"],
});
dependencies.push(
  {
    ref: "pkg:generic/libkrunfw@5.5.0",
    dependsOn: ["pkg:generic/linux-kernel@6.12.91"],
  },
  { ref: "pkg:generic/linux-kernel@6.12.91", dependsOn: [] },
);

const bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  version: 1,
  metadata: {
    component: {
      type: "application",
      "bom-ref": "capsule-libkrun-hvf-development-profile",
      name: "Capsule libkrun/HVF development profile",
      version: "spike-2026-07-31",
    },
    properties: [
      { name: "capsule:artifact-kind", value: "SBOM input; not a release SBOM" },
      { name: "capsule:target", value: "aarch64-apple-darwin" },
      { name: "capsule:features", value: "libkrun/blk; no net/gpu/snd/input" },
      { name: "capsule:libkrun-commit", value: commit },
      { name: "capsule:cargo-lock-sha256", value: sha256(join(sourceRoot, "Cargo.lock")) },
      { name: "capsule:runtime-cargo-component-count", value: String(runtimeSelected.size) },
      { name: "capsule:builder-cargo-component-count", value: String(selected.size) },
    ],
  },
  components,
  dependencies,
};

writeFileSync(output, `${JSON.stringify(bom, null, 2)}\n`);
execFileSync("pnpm", ["exec", "biome", "format", "--write", output], {
  cwd: resolve(experimentDir, "../.."),
  stdio: "inherit",
});
console.log(`wrote ${output}`);
console.log(`components=${components.length}`);
