#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

if (process.argv.length !== 5) {
  throw new Error("usage: compare-rusty-v8-oracle.mjs LOCAL_BUNDLE ORACLE_BUNDLE OUTPUT_JSON");
}

const localRoot = resolve(process.argv[2]);
const oracleRoot = resolve(process.argv[3]);
const output = resolve(process.argv[4]);
const sha256 = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const describe = (root, name) => ({
  size: statSync(`${root}/${name}`).size,
  sha256: sha256(`${root}/${name}`),
});

const expectedNames = [
  "artifact-sha256sums.txt",
  "build-metadata.tar.gz",
  "corresponding-source.tar.gz",
  "fixed-verification.txt",
  "librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz",
  "licenses-notices.tar.gz",
  "provenance.intoto.json",
  "release-manifest.json",
  "sbom.cdx.json",
  "sbom.spdx.json",
  "src_binding_simdutf_release_aarch64-unknown-linux-gnu.rs",
];
for (const [label, root] of [["local", localRoot], ["oracle", oracleRoot]]) {
  const observed = readdirSync(root).sort();
  if (JSON.stringify(observed) !== JSON.stringify(expectedNames)) {
    throw new Error(`${label} bundle is not the expected closed 11-file set`);
  }
}

const oracleRelease = JSON.parse(
  readFileSync(`${oracleRoot}/release-manifest.json`, "utf8"),
);
const localRelease = JSON.parse(
  readFileSync(`${localRoot}/release-manifest.json`, "utf8"),
);
for (const [label, release] of [["local", localRelease], ["oracle", oracleRelease]]) {
  if (release.sourceCommit !== "80e863ddb942a4aa2b384e794fc23e35b9d2bb15") {
    throw new Error(`${label} source commit mismatch`);
  }
  if (release.profile !== "linux-arm64-release-simdutf-v1") {
    throw new Error(`${label} profile mismatch`);
  }
  if (release.unsigned !== true || release.published !== false || release.admitted !== false) {
    throw new Error(`${label} publication boundary mismatch`);
  }
}

const files = Object.fromEntries(expectedNames.map((name) => {
  const local = describe(localRoot, name);
  const oracle = describe(oracleRoot, name);
  return [name, {
    local,
    oracle,
    result:
      local.size === oracle.size && local.sha256 === oracle.sha256
        ? "byte-equal"
        : "different-retained",
  }];
}));
const equalCount = Object.values(files).filter((item) => item.result === "byte-equal").length;
const attributedDifferenceFiles = new Set([
  "artifact-sha256sums.txt",
  "build-metadata.tar.gz",
  "fixed-verification.txt",
  "provenance.intoto.json",
  "release-manifest.json",
]);
const differentFiles = Object.entries(files)
  .filter(([, item]) => item.result !== "byte-equal")
  .map(([name]) => name);
const unexplainedFiles = differentFiles.filter(
  (name) => !attributedDifferenceFiles.has(name),
);

const result = {
  schema: "capsule.rusty-v8-local-oracle-comparison.v1",
  local: {
    role: "clean-reconstruction-consumed-by-deno-build",
    sourceCommit: localRelease.sourceCommit,
  },
  oracle: {
    role: "comparison-only-never-a-construction-input",
    githubRun: 30925045754,
    artifactId: 8902402057,
    artifactName: "rusty-v8-v150.2.0-linux-arm64-unsigned",
    zipSize: 239176470,
    zipSha256: "fa3840a7803554f34f20e6c400dba8db425f38d8f815ab3f6d12ac9aa2089d9c",
    sourceCommit: oracleRelease.sourceCommit,
  },
  expectedFileCount: expectedNames.length,
  equalCount,
  differentCount: expectedNames.length - equalCount,
  files,
  attribution: {
    "build-metadata.tar.gz":
      "retained physical-host identity plus governed build/Ninja timing metadata; exact member comparison retained separately",
    "fixed-verification.txt":
      "the fixed get_version result is identical, while the retained test-harness elapsed time is 0.09s locally versus 0.02s in GitHub Actions",
    "provenance.intoto.json":
      "local-unassigned invocation plus the local fixed-verification and build-metadata subjects supersede GitHub run 30925045754 metadata",
    "release-manifest.json":
      "closed manifest transitively records the local fixed-verification, provenance, and build-metadata digests",
    "artifact-sha256sums.txt":
      "checksum closure transitively records the local fixed-verification and build-metadata digests",
  },
  unexplainedFiles,
  decision:
    unexplainedFiles.length === 0 &&
    files["librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz"].result === "byte-equal"
      ? "comparison-closed"
      : "BLOCKED-unexplained-byte-identity",
  normalizationApplied: false,
};
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(`rustyV8OracleEqual=${equalCount}/${expectedNames.length}`);
