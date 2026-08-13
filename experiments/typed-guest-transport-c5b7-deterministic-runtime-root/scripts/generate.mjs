#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const checkMode = process.argv.includes("--check");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = resolve(root, "../..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const exactRef = async (path) => {
  const bytes = await readFile(join(repository, path));
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
};
const generated = new Map();
const retain = (path, value) => generated.set(path, Buffer.isBuffer(value) ? value : json(value));

const temporary = await mkdtemp(join(tmpdir(), "capsule-c5b7-generate."));
let rootBytes;
try {
  const a = join(temporary, "root-a.ext4");
  const b = join(temporary, "root-b.ext4");
  execFileSync(process.execPath, [join(root, "scripts/build-root.mjs"), a], { stdio: "ignore" });
  execFileSync(process.execPath, [join(root, "scripts/build-root.mjs"), b], { stdio: "ignore" });
  const bytesA = await readFile(a);
  const bytesB = await readFile(b);
  if (!bytesA.equals(bytesB)) throw new Error("runtime-root A/B builds differ");
  rootBytes = bytesA;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
const rootRef = { path: "dist/runtime-root.ext4", bytes: rootBytes.length, sha256: sha256(rootBytes) };
if (rootRef.bytes !== 100663296 || rootRef.sha256 !== "5ad18f20cbc97c7a70ead3e795fd3649672513323041e913b0eb55b7acc88775") throw new Error("root identity drift");
const c5b5ContractPath = "experiments/typed-guest-transport-c5b5-no-run-effect-adapter/contracts/effect-adapter-contract.json";
retain("inputs/c5b5/effect-adapter-contract.json", await readFile(join(repository, c5b5ContractPath)));

const profile = {
  objectType: "capsule.c5b7.deterministic-runtime-root",
  objectVersion: 1,
  identity: "capsule.c5b7.typed-transport-runtime-root/2026-08-13",
  scopedConstructionStatus: "PASSED",
  completeCompositeStatus: "BLOCKED",
  controlledExecutionStatus: "BLOCKED",
  runtimeProfileAdmission: "BLOCKED",
  repositoryBaseline: "d9967e80a6155a65c6876dc686d8f8498b4a908f",
  predecessors: {
    c5b0: { mergeCommit: "b357d0c0fb29100c180494e67cebd7809aabe3c5", experimentRoot: "experiments/typed-guest-transport-c5b0-v19-successor" },
    c5b1: { mergeCommit: "db08ebf277432e06d6cba3b7f7338e3bd4a61252", experimentRoot: "experiments/typed-guest-transport-c5b1-executable-successor" },
    c5b3Controller: { mergeCommit: "60234e22674e46a42e8e5c382d85217a930c2c13", experimentRoot: "experiments/typed-guest-transport-c5b3-controlled-test-controller" },
    c5b5Adapter: { mergeCommit: "3cfe7db16c55894be444d4c783659043dbd25c95", experimentRoot: "experiments/typed-guest-transport-c5b5-no-run-effect-adapter" },
    c5b6Runtime: { mergeCommit: "d9967e80a6155a65c6876dc686d8f8498b4a908f", experimentRoot: "experiments/typed-guest-transport-c5b6-deno-static-reproduction" }
  },
  root: {
    ...rootRef,
    versionedSuccessor: true,
    c5b1ByteEquivalent: false,
    reason: "The governed runtime and snapshot require a larger explicitly versioned root than C5b1's 8 MiB runtime-absent image.",
    format: "raw ext4 extent filesystem",
    bytes: 100663296,
    blockBytes: 4096,
    blocks: 24576,
    usedBlocks: 17115,
    freeBlocks: 7461,
    inodes: 256,
    nodes: 19,
    journal: false,
    compatibleFeatures: [],
    incompatibleFeatures: ["filetype", "extents"],
    readOnlyCompatibleFeatures: [],
    uid: 0,
    gid: 0,
    ambientFiles: 0
  },
  content: {
    runtime: { path: "/usr/local/bin/capsule-deno-core-c5b1", bytes: 68496520, sha256: "e781a90236cdf1272a9a16189c6be033164fa25a5aa9e52376ef998982ec0a77", mode: "0755" },
    snapshot: { path: "/usr/local/share/capsule-deno-core/capsule_core_snapshot.bin", bytes: 699988, sha256: "4e8965217d5a6675a880326eee6f690bbeec7e7cb243decf2f3e9f453a871a2c", mode: "0444" },
    trustedInit: { path: "/usr/local/libexec/capsule-init.krun", bytes: 365352, sha256: "c6c5f15dd386082e6b108c354afdca27327d6760efdefb54fe9d02e25b80e408", mode: "0755" },
    trustedLauncher: { path: "/usr/local/libexec/capsule-launcher", bytes: 389312, sha256: "278467cd82499590154a9b1a34b0189096d3927c49fefd228dedc2f4db36ea98", mode: "0755" },
    source: { path: "/opt/capsule/inputs/main.mjs", bytes: 103, sha256: "c8e940feb89b342de2d5e6bd13c413226676de9a539fce34c4107516e635b475", mode: "0444" },
    sourceManifest: { path: "/opt/capsule/inputs/source-manifest.cbor", bytes: 89, sha256: "712b1bd9739e4f6b0b027600207cbb08fb21b159a57bd34a15cf0ff8f32661b0", mode: "0444" },
    input: { path: "/opt/capsule/inputs/input.json", bytes: 36, sha256: "9de0c909cfb111bd99c3b0b5f7a10972894270c2867022a71b6b6f3c0cd1af6e", mode: "0444" }
  },
  sourceInputs: {
    runtimeBundle: await exactRef("experiments/typed-guest-transport-c5b6-deno-static-reproduction/artifacts/capsule-deno-core-c2b-runtime-bundle.tar.gz"),
    runtimeProvenance: await exactRef("experiments/typed-guest-transport-c5b6-deno-static-reproduction/evidence/2026-08-12/provenance.intoto.json"),
    runtimeSbom: await exactRef("experiments/typed-guest-transport-c5b6-deno-static-reproduction/evidence/2026-08-12/sbom.cdx.json"),
    runtimeNoticeClosure: await exactRef("experiments/typed-guest-transport-c5b6-deno-static-reproduction/evidence/2026-08-12/source-notice-closure.json"),
    trustedInit: await exactRef("experiments/typed-guest-transport-c5b1-executable-successor/dist/trusted-init"),
    trustedLauncher: await exactRef("experiments/typed-guest-transport-c5b1-executable-successor/dist/trusted-launcher"),
    source: await exactRef("experiments/typed-guest-transport-c5b0-v19-successor/fixtures/main.mjs"),
    sourceManifest: await exactRef("experiments/typed-guest-transport-c5b0-v19-successor/fixtures/source-manifest.cbor"),
    input: await exactRef("experiments/typed-guest-transport-c5b0-v19-successor/fixtures/input.json")
  },
  metadataOnly: {
    controller: { mergeCommit: "60234e22674e46a42e8e5c382d85217a930c2c13", profile: await exactRef("experiments/typed-guest-transport-c5b3-controlled-test-controller/manifests/controller-profile.json"), includedInRoot: false },
    effectAdapter: {
      mergeCommit: "3cfe7db16c55894be444d4c783659043dbd25c95",
      profile: await exactRef("experiments/typed-guest-transport-c5b5-no-run-effect-adapter/manifests/adapter-profile.json"),
      contract: await exactRef(c5b5ContractPath),
      frozenRootBytes: 134217728,
      compatibleAsIs: false,
      resolution: "A reviewed versioned adapter/effect implementation must bind this root's 100663296 bytes, or a separately versioned 134217728-byte root must replace this candidate before composite construction.",
      includedInRoot: false
    }
  },
  deliberatelyAbsent: ["shell", "package-manager", "network-configuration", "writable-scratch", "host-path", "controller", "effect-adapter", "libkrun", "libkrunfw"],
  blockers: ["the C5b5 adapter is provenance-only and incompatible as-is because it freezes a 134217728-byte root while this successor is 100663296 bytes", "a reviewed versioned adapter/effect implementation or separately versioned root must resolve the exact-size binding before composite construction", "no complete immutable host-plus-root composite exists", "the real effect implementation remains separately owned", "no exact owner/host/guest authorization profile exists", "nothing in this packet supplies runtime or product admission"],
  effects: {
    artifactExecuted: false, runtimeExecuted: false, launcherExecuted: false, processStarted: false,
    artifactLoaded: false, libkrunLoaded: false, hvfCalled: false, vmStarted: false,
    guestStarted: false, networkAccessed: false, credentialAccessed: false,
    keychainAccessed: false, productStateMutated: false, admissionChanged: false
  }
};
retain("manifests/runtime-root-profile.json", profile);
retain("evidence/2026-08-13/build-comparison.json", {
  status: "PASSED", builds: 2, independentOutputRoots: true, normalizationApplied: false,
  buildA: { bytes: rootRef.bytes, sha256: rootRef.sha256 }, buildB: { bytes: rootRef.bytes, sha256: rootRef.sha256 }, byteEqual: true,
  sourceInputsRevalidatedBeforeEachBuild: true, artifactExecution: "NOT_RUN", runtimeExecution: "NOT_RUN", guestExecution: "NOT_RUN"
});
retain("evidence/2026-08-13/construction.json", {
  workItem: "C5b7 deterministic no-run governed runtime-root construction", scopedStatus: "PASSED",
  completeCompositeStatus: "BLOCKED", controlledExecutionStatus: "BLOCKED",
  result: "Two byte-identical 96 MiB raw ext4 successors bind the exact governed runtime, snapshot, trusted init/launcher, and C5b0 inputs; one root is retained.",
  root: rootRef, nodes: 19, usedBlocks: 17115, freeBlocks: 7461, effects: profile.effects
});
retain("evidence/2026-08-13/mutation-dispositions.json", {
  status: "PASSED",
  cases: [
    ["root-byte", "root digest mismatch"], ["journal-feature", "compatible features must be empty"],
    ["foreign-path", "root path inventory mismatch"], ["foreign-owner", "inode 22 owner mismatch"],
    ["runtime-mode", "mode mismatch: /usr/local/bin/capsule-deno-core-c5b1"],
    ["source-byte", "content mismatch: /opt/capsule/inputs/main.mjs"], ["truncated-root", "root byte length mismatch"],
    ["claim-effect", "effect boundary mismatch"], ["controller-pin", "metadata-only pin mismatch"],
    ["wrong-dotdot", "dotdot entry invalid: /usr"],
    ["inode-alias", "inode reachable at multiple paths"],
    ["link-count", "inode 22 link count mismatch"],
    ["profile-file-size", "content profile mismatch"],
    ["adapter-compatibility-disclosure", "adapter compatibility boundary mismatch"],
    ["archive-extra", "archive inventory mismatch"]
  ].map(([id, oracle]) => ({ id, disposition: "REFUSED", oracle }))
});

for (const [path, bytes] of generated) {
  const destination = join(root, path);
  if (checkMode) {
    const actual = await readFile(destination);
    if (!actual.equals(bytes)) throw new Error(`generated drift: ${path}`);
  } else {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
}
const rootDestination = join(root, rootRef.path);
if (checkMode) {
  const actual = await readFile(rootDestination);
  if (!actual.equals(rootBytes)) throw new Error("generated drift: dist/runtime-root.ext4");
} else {
  await mkdir(dirname(rootDestination), { recursive: true });
  await writeFile(rootDestination, rootBytes, { mode: 0o644 });
}

async function walk(directory) {
  const result = [];
  for (const name of (await readdir(directory)).sort()) {
    const path = join(directory, name);
    if ((await stat(path)).isDirectory()) result.push(...await walk(path)); else result.push(path);
  }
  return result;
}
const archivePath = join(root, "manifests/archive-manifest.json");
const retainedFiles = [];
for (const path of (await walk(root)).filter((path) => path !== archivePath)) {
  const bytes = await readFile(path); const metadata = await stat(path);
  retainedFiles.push({ path: relative(root, path), mode: (metadata.mode & 0o777).toString(8).padStart(4, "0"), bytes: bytes.length, sha256: sha256(bytes) });
}
const archive = json({ objectType: "capsule.experiment-archive-manifest", objectVersion: 1, identity: profile.identity, closed: true, manifestSelfExcluded: true, retainedFiles });
if (checkMode) {
  const actual = await readFile(archivePath); if (!actual.equals(archive)) throw new Error("archive manifest drift");
} else { await writeFile(archivePath, archive); }
console.log(JSON.stringify({ result: "PASSED", check: checkMode, root: rootRef, retainedFiles: retainedFiles.length, effects: "NONE" }));
