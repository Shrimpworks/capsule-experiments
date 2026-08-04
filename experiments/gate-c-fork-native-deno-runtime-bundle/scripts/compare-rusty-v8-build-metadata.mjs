#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

if (process.argv.length !== 5) {
  throw new Error("usage: compare-rusty-v8-build-metadata.mjs LOCAL_DIR ORACLE_DIR OUTPUT_JSON");
}

const localRoot = resolve(process.argv[2]);
const oracleRoot = resolve(process.argv[3]);
const output = resolve(process.argv[4]);
const sha256 = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const files = (root) => {
  const output = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) output.push(relative(root, path));
      else throw new Error(`unsupported metadata member: ${path}`);
    }
  };
  visit(root);
  return output.sort();
};

const localNames = files(localRoot);
const oracleNames = files(oracleRoot);
if (JSON.stringify(localNames) !== JSON.stringify(oracleNames)) {
  throw new Error("build-metadata member inventory differs");
}
const members = Object.fromEntries(localNames.map((name) => {
  const localPath = join(localRoot, name);
  const oraclePath = join(oracleRoot, name);
  const local = { size: statSync(localPath).size, sha256: sha256(localPath) };
  const oracle = { size: statSync(oraclePath).size, sha256: sha256(oraclePath) };
  return [name, {
    local,
    oracle,
    result:
      local.size === oracle.size && local.sha256 === oracle.sha256
        ? "byte-equal"
        : "different-retained",
  }];
}));
const expectedDifferent = new Set([
  ".ninja_deps",
  ".ninja_log",
  "build.ninja",
  "governed-build.log",
  "host-environment.json",
  "ninja-graph.dot",
  "tool-versions.json",
]);
const different = Object.entries(members)
  .filter(([, value]) => value.result !== "byte-equal")
  .map(([name]) => name);
const unexplained = different.filter((name) => !expectedDifferent.has(name));
const missingExpectedDifference = [...expectedDifferent].filter(
  (name) => !different.includes(name),
);
const normalizeGraphPointers = (text) => {
  const identities = new Map();
  return text.replace(/0x[0-9a-f]+/g, (identity) => {
    if (!identities.has(identity)) identities.set(identity, `node-${identities.size}`);
    return identities.get(identity);
  });
};
const localBuildNinja = readFileSync(join(localRoot, "build.ninja"), "utf8");
const oracleBuildNinja = readFileSync(join(oracleRoot, "build.ninja"), "utf8");
const actionDepth = (text) =>
  Number(text.match(/pool build_toolchain_action_pool\n  depth = (\d+)/)?.[1]);
const normalizeActionDepth = (text) =>
  text.replace(
    /pool build_toolchain_action_pool\n  depth = \d+/,
    "pool build_toolchain_action_pool\n  depth = <available-cpus>",
  );
const localTools = JSON.parse(readFileSync(join(localRoot, "tool-versions.json"), "utf8"));
const oracleTools = JSON.parse(readFileSync(join(oracleRoot, "tool-versions.json"), "utf8"));
const cargoWithoutObservedOs = (text) => text.replace(/^os: .*$/m, "os: <builder-observation>");
const semanticProofs = {
  buildNinjaDiffLimitedToAvailableCpuActionPoolDepth:
    normalizeActionDepth(localBuildNinja) === normalizeActionDepth(oracleBuildNinja),
  buildNinjaActionPoolDepth: {
    local: actionDepth(localBuildNinja),
    oracle: actionDepth(oracleBuildNinja),
  },
  ninjaGraphEqualAfterDeterministicPointerRenaming:
    normalizeGraphPointers(readFileSync(join(localRoot, "ninja-graph.dot"), "utf8")) ===
    normalizeGraphPointers(readFileSync(join(oracleRoot, "ninja-graph.dot"), "utf8")),
  toolVersionsEqualAfterCargoOsObservation:
    JSON.stringify({ ...localTools, cargo: cargoWithoutObservedOs(localTools.cargo) }) ===
    JSON.stringify({ ...oracleTools, cargo: cargoWithoutObservedOs(oracleTools.cargo) }),
  cargoOsObservation: {
    local: localTools.cargo.match(/^os: (.*)$/m)?.[1] ?? null,
    oracle: oracleTools.cargo.match(/^os: (.*)$/m)?.[1] ?? null,
  },
};
const semanticProofFailures = Object.entries(semanticProofs)
  .filter(([, value]) => value === false)
  .map(([name]) => name);
const result = {
  schema: "capsule.rusty-v8-build-metadata-comparison.v1",
  memberCount: localNames.length,
  equalCount: localNames.length - different.length,
  differentCount: different.length,
  members,
  different,
  attribution: {
    ".ninja_deps": "Ninja dependency database retains filesystem observations from the individual build",
    ".ninja_log": "Ninja log retains per-command monotonic timings and output mtimes from the individual build",
    "build.ninja": "the governed action-pool depth records 10 locally available CPUs versus 4 on the GitHub runner; all other bytes are equal",
    "governed-build.log": "Cargo/Ninja log retains individual build progress and elapsed timing",
    "host-environment.json": "physical host and Docker daemon identities differ between local Apple Silicon Docker Desktop and GitHub Actions",
    "ninja-graph.dot": "Ninja emits ephemeral in-process pointer identifiers; the full graph is equal after deterministic first-occurrence pointer renaming",
    "tool-versions.json": "all exact tool versions are equal; Cargo reports the emulated local builder OS as Linux versus Debian 12.0.0 in GitHub Actions",
  },
  semanticProofs,
  semanticProofFailures,
  unexplained,
  missingExpectedDifference,
  normalizationApplied: false,
  decision:
    unexplained.length === 0 && semanticProofFailures.length === 0
      ? "comparison-closed"
      : "BLOCKED-unexplained-byte-identity",
};
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(`rustyV8BuildMetadataEqual=${result.equalCount}/${result.memberCount}`);
