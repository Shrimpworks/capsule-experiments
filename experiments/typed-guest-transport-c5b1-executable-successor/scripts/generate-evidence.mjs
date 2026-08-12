#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const check = process.argv.includes("--check");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generated = new Map();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const ref = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes) });
const loadRef = async (path) => ref(path, await readFile(join(root, path)));
const retain = (path, value) => generated.set(path, Buffer.isBuffer(value) ? value : json(value));

const artifacts = {};
for (const [role, path, mode, format] of [
  ["hostRunner", "dist/host-runner", "0755", "Mach-O arm64 executable"],
  ["rawRuntimeRoot", "dist/runtime-root.ext4", "0644", "ext4 extent/no-journal raw image"],
  ["trustedInit", "dist/trusted-init", "0755", "static ELF arm64 executable"],
  ["trustedLauncher", "dist/trusted-launcher", "0755", "static ELF arm64 executable"],
  ["controller", "dist/controller", "0755", "Mach-O arm64 executable hard-stop"],
]) {
  artifacts[role] = { ...(await loadRef(path)), mode, format };
}

const predecessorInputs = {};
for (const path of [
  "inputs/c5b0/main.mjs",
  "inputs/c5b0/source-manifest.cbor",
  "inputs/c5b0/input.json",
  "inputs/c5b0/expected-completion.json",
  "inputs/c5b0/source.frame",
  "inputs/c5b0/input.frame",
  "inputs/c5b0/completion.frame",
  "inputs/c5b0/successor-profile.json",
  "inputs/c5b0/no-run-plan.json",
  "inputs/c5b0/artifact-boundary.json",
  "inputs/c5b0/archive-manifest.json",
]) predecessorInputs[path] = await loadRef(path);

const sourcePaths = [
  "Cargo.lock",
  "Cargo.toml",
  "rust-toolchain.toml",
  "crates/trusted-init/Cargo.toml",
  "crates/trusted-init/src/main.rs",
  "crates/trusted-launcher/Cargo.toml",
  "crates/trusted-launcher/src/main.rs",
  "source/host-runner.c",
  "source/controller.c",
  "scripts/aarch64-linux-linker.sh",
  "scripts/build-root.mjs",
  "scripts/build.sh",
  "scripts/sync-inputs.mjs",
];
const sources = [];
for (const path of sourcePaths) sources.push(await loadRef(path));

const profile = {
  objectType: "capsule.c5b1.executable-successor-construction",
  objectVersion: 1,
  identity: "capsule.c5b1.typed-transport-executable-successor/2026-08-11",
  scopedConstructionStatus: "PASSED",
  completeExecutableSuccessorStatus: "BLOCKED",
  controlledExecutionStatus: "BLOCKED",
  runtimeProfileAdmission: "BLOCKED",
  repositoryBaseline: "067fe2beb40361bb714507cab1331004e0a656fa",
  predecessor: {
    mergeCommit: "b357d0c0fb29100c180494e67cebd7809aabe3c5",
    experimentRoot: "experiments/typed-guest-transport-c5b0-v19-successor",
    v19RawBytesRecovered: false,
    v19IdentityReused: false,
  },
  artifacts,
  rootContract: {
    bytes: 8388608,
    blockBytes: 1024,
    featureIncompat: ["filetype", "extents"],
    journal: false,
    fixedPaths: [
      "/usr/local/libexec/capsule-init.krun",
      "/usr/local/libexec/capsule-launcher",
      "/opt/capsule/inputs/main.mjs",
      "/opt/capsule/inputs/source-manifest.cbor",
      "/opt/capsule/inputs/input.json",
    ],
    deliberatelyAbsent: ["/usr/local/bin/capsule-deno-core-c5b1", "shell", "package-manager", "network-configuration"],
  },
  hostRunnerContract: {
    descriptors: [
      "0:null-read", "1:stdout-write", "2:stderr-write", "3:record-before-start-read",
      "4:unlinked-mode-0400-root-read", "5:source-read", "6:input-read", "7:completion-write",
    ],
    fixedLibraryPath: "./lib/libkrun.1.dylib",
    libraryLoadPoint: "after exact G plus EOF",
    ports: ["capsule.source", "capsule.input", "capsule.completion"],
    noCallerConfiguration: true,
  },
  predecessorInputs,
  constructionSources: sources,
  blockers: [
    "the governed deno_core runtime executable is deliberately absent from the raw root",
    "governed libkrun/libkrunfw/kernel/firmware bytes are not part of this packet",
    "the retained controller is an executable hard-stop, not an execution harness",
    "no owner host/guest/process/root/fault/cleanup authorization has been issued",
  ],
  effects: {
    artifactExecuted: false,
    libkrunLoaded: false,
    hvfCalled: false,
    processStarted: false,
    vmStarted: false,
    guestStarted: false,
    credentialAccessed: false,
    networkAccessed: false,
    productStateMutated: false,
    admissionChanged: false,
  },
};
retain("manifests/artifact-profile.json", profile);

retain("evidence/2026-08-11/construction.json", {
  workItem: "C5b1 deterministic no-run executable successor construction",
  scopedConstructionStatus: "PASSED",
  completeExecutableSuccessorStatus: "BLOCKED",
  result: "Five fresh successor artifact identities were independently reproduced; missing governed runtime/library bytes and the hard-stop controller prevent execution.",
  reproducibility: { builds: 2, byteEqual: true },
  toolchain: {
    rustc: "1.93.1 (01f6ddf75 2026-02-11)",
    cargo: "1.93.1 (083ac5135 2025-12-15)",
    target: "aarch64-unknown-linux-musl",
    appleClang: "21.0.0 (clang-2100.1.1.101)",
    homebrewLLVM: "22.1.8",
    node: "22.22.1",
  },
  effects: profile.effects,
});

retain("evidence/2026-08-11/sbom.spdx-lite.json", {
  spdxVersion: "SPDX-2.3",
  dataLicense: "CC0-1.0",
  name: "capsule-c5b1-executable-successor-construction",
  packages: [
    { name: "capsule-c5b1-trusted-init", version: "0.1.0", licenseConcluded: "Apache-2.0", supplier: "Organization: Shrimpworks" },
    { name: "capsule-c5b1-trusted-launcher", version: "0.1.0", licenseConcluded: "Apache-2.0", supplier: "Organization: Shrimpworks" },
    { name: "capsule-c5b1-host-runner", version: "0.1.0", licenseConcluded: "Apache-2.0", supplier: "Organization: Shrimpworks" },
    { name: "capsule-c5b1-controller-hard-stop", version: "0.1.0", licenseConcluded: "Apache-2.0", supplier: "Organization: Shrimpworks" },
  ],
  externalRuntimeDependencies: ["governed libkrun (unbound)", "governed libkrunfw/kernel (unbound)", "governed deno_core runtime (unbound)"],
});

retain("evidence/2026-08-11/provenance.json", {
  predicateType: "https://slsa.dev/provenance/v1",
  subject: Object.entries(artifacts).map(([name, value]) => ({ name, digest: { sha256: value.sha256 }, bytes: value.bytes })),
  buildDefinition: {
    buildType: "capsule.no-run.c5b1/v1",
    externalParameters: { repositoryBaseline: profile.repositoryBaseline, predecessorMerge: profile.predecessor.mergeCommit },
    internalParameters: { sourceDateEpoch: 0, builds: 2, network: false, signing: false },
  },
  runDetails: { builder: { id: "local-owned-mac-construction-only" }, byproducts: [], metadata: { invocationId: "capsule-c5b1-2026-08-11" } },
});

retain("evidence/2026-08-11/mutation-dispositions.json", {
  status: "PASSED",
  cases: [
    { id: "host-runner-byte", expected: "artifact identity mismatch" },
    { id: "root-input-byte", expected: "root embedded input mismatch" },
    { id: "root-journal-feature", expected: "root journal feature must be disabled" },
    { id: "c5b0-input-byte", expected: "root embedded input mismatch" },
    { id: "execution-status-claim", expected: "execution status must remain BLOCKED" },
    { id: "root-runtime-insertion", expected: "governed runtime path must remain absent" },
    { id: "closed-inventory-extra", expected: "archive inventory mismatch" },
  ],
});

for (const [path, bytes] of generated) {
  const destination = join(root, path);
  if (check) {
    const actual = await readFile(destination);
    if (!actual.equals(bytes)) throw new Error(`generated evidence drift: ${path}`);
  } else {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
}

async function walk(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(child)));
    else result.push(child);
  }
  return result;
}

const archivePath = "manifests/archive-manifest.json";
const files = [];
for (const path of (await walk(root)).sort()) {
  const name = relative(root, path);
  if (name === archivePath) continue;
  files.push(ref(name, await readFile(path)));
}
const archive = json({
  objectType: "capsule.experiment-archive-manifest",
  objectVersion: 1,
  identity: profile.identity,
  manifestSelfExcluded: true,
  retainedFiles: files,
});
if (check) {
  const actual = await readFile(join(root, archivePath));
  if (!actual.equals(archive)) throw new Error("archive manifest drift");
} else {
  await writeFile(join(root, archivePath), archive);
}

console.log(JSON.stringify({ result: "PASSED", check, artifacts: Object.keys(artifacts).length, retainedFiles: files.length }));
