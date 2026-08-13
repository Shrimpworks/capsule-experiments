#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRoot, sha256 } from "./root-parser.mjs";

const root = resolve(process.argv[2] ?? dirname(fileURLToPath(import.meta.url)), process.argv[2] ? "." : "..");
const repository = process.env.CAPSULE_EXPERIMENTS_ROOT ? resolve(process.env.CAPSULE_EXPERIMENTS_ROOT) : resolve(root, "../..");
const check = (condition, message) => { if (!condition) throw new Error(message); };
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const parsed = await parseRoot(join(root, "dist/runtime-root.ext4"));
const expectedPaths = {
  "/": [0o40755, null],
  "/dev": [0o40755, null],
  "/opt": [0o40755, null],
  "/opt/capsule": [0o40755, null],
  "/opt/capsule/inputs": [0o40555, null],
  "/opt/capsule/inputs/input.json": [0o100444, "9de0c909cfb111bd99c3b0b5f7a10972894270c2867022a71b6b6f3c0cd1af6e"],
  "/opt/capsule/inputs/main.mjs": [0o100444, "c8e940feb89b342de2d5e6bd13c413226676de9a539fce34c4107516e635b475"],
  "/opt/capsule/inputs/source-manifest.cbor": [0o100444, "712b1bd9739e4f6b0b027600207cbb08fb21b159a57bd34a15cf0ff8f32661b0"],
  "/proc": [0o40555, null],
  "/usr": [0o40755, null],
  "/usr/local": [0o40755, null],
  "/usr/local/bin": [0o40755, null],
  "/usr/local/bin/capsule-deno-core-c5b1": [0o100755, "e781a90236cdf1272a9a16189c6be033164fa25a5aa9e52376ef998982ec0a77"],
  "/usr/local/libexec": [0o40755, null],
  "/usr/local/libexec/capsule-init.krun": [0o100755, "c6c5f15dd386082e6b108c354afdca27327d6760efdefb54fe9d02e25b80e408"],
  "/usr/local/libexec/capsule-launcher": [0o100755, "278467cd82499590154a9b1a34b0189096d3927c49fefd228dedc2f4db36ea98"],
  "/usr/local/share": [0o40755, null],
  "/usr/local/share/capsule-deno-core": [0o40555, null],
  "/usr/local/share/capsule-deno-core/capsule_core_snapshot.bin": [0o100444, "4e8965217d5a6675a880326eee6f690bbeec7e7cb243decf2f3e9f453a871a2c"],
};
check(JSON.stringify([...parsed.paths.keys()].sort()) === JSON.stringify(Object.keys(expectedPaths).sort()), "root path inventory mismatch");
for (const [path, [mode, digest]] of Object.entries(expectedPaths)) {
  const value = parsed.paths.get(path);
  check(value.mode === mode, `mode mismatch: ${path}`);
  if (digest) check(sha256(value.bytes) === digest, `content mismatch: ${path}`);
}
check(parsed.digest === "5ad18f20cbc97c7a70ead3e795fd3649672513323041e913b0eb55b7acc88775", "root digest mismatch");

const profile = await json(join(root, "manifests/runtime-root-profile.json"));
check(JSON.stringify(Object.keys(profile)) === JSON.stringify(["objectType", "objectVersion", "identity", "scopedConstructionStatus", "completeCompositeStatus", "controlledExecutionStatus", "runtimeProfileAdmission", "repositoryBaseline", "predecessors", "root", "content", "sourceInputs", "metadataOnly", "deliberatelyAbsent", "blockers", "effects"]), "profile closed-map mismatch");
check(profile.objectType === "capsule.c5b7.deterministic-runtime-root" && profile.objectVersion === 1 && profile.identity === "capsule.c5b7.typed-transport-runtime-root/2026-08-13" && profile.repositoryBaseline === "d9967e80a6155a65c6876dc686d8f8498b4a908f", "profile identity mismatch");
check(profile.scopedConstructionStatus === "PASSED" && profile.controlledExecutionStatus === "BLOCKED" && profile.completeCompositeStatus === "BLOCKED" && profile.runtimeProfileAdmission === "BLOCKED", "status boundary mismatch");
const expectedRoot = {
  path: "dist/runtime-root.ext4", bytes: 100663296, sha256: parsed.digest,
  versionedSuccessor: true, c5b1ByteEquivalent: false,
  reason: "The governed runtime and snapshot require a larger explicitly versioned root than C5b1's 8 MiB runtime-absent image.",
  format: "raw ext4 extent filesystem", blockBytes: 4096, blocks: 24576,
  usedBlocks: parsed.usedBlocks, freeBlocks: parsed.freeBlocks, inodes: 256, nodes: parsed.paths.size,
  journal: false, compatibleFeatures: [], incompatibleFeatures: ["filetype", "extents"],
  readOnlyCompatibleFeatures: [], uid: 0, gid: 0, ambientFiles: 0
};
check(JSON.stringify(profile.root) === JSON.stringify(expectedRoot), "root profile mismatch");
check(profile.metadataOnly.controller.mergeCommit === "60234e22674e46a42e8e5c382d85217a930c2c13" && profile.metadataOnly.effectAdapter.mergeCommit === "3cfe7db16c55894be444d4c783659043dbd25c95", "metadata-only pin mismatch");
const expectedPredecessors = {
  c5b0: { mergeCommit: "b357d0c0fb29100c180494e67cebd7809aabe3c5", experimentRoot: "experiments/typed-guest-transport-c5b0-v19-successor" },
  c5b1: { mergeCommit: "db08ebf277432e06d6cba3b7f7338e3bd4a61252", experimentRoot: "experiments/typed-guest-transport-c5b1-executable-successor" },
  c5b3Controller: { mergeCommit: "60234e22674e46a42e8e5c382d85217a930c2c13", experimentRoot: "experiments/typed-guest-transport-c5b3-controlled-test-controller" },
  c5b5Adapter: { mergeCommit: "3cfe7db16c55894be444d4c783659043dbd25c95", experimentRoot: "experiments/typed-guest-transport-c5b5-no-run-effect-adapter" },
  c5b6Runtime: { mergeCommit: "d9967e80a6155a65c6876dc686d8f8498b4a908f", experimentRoot: "experiments/typed-guest-transport-c5b6-deno-static-reproduction" }
};
check(JSON.stringify(profile.predecessors) === JSON.stringify(expectedPredecessors), "predecessor map mismatch");
const content = (path) => { const [mode, digest] = expectedPaths[path]; const value = parsed.paths.get(path); return { path, bytes: value.size, sha256: digest, mode: (mode & 0o777).toString(8).padStart(4, "0") }; };
const expectedContent = {
  runtime: content("/usr/local/bin/capsule-deno-core-c5b1"),
  snapshot: content("/usr/local/share/capsule-deno-core/capsule_core_snapshot.bin"),
  trustedInit: content("/usr/local/libexec/capsule-init.krun"),
  trustedLauncher: content("/usr/local/libexec/capsule-launcher"),
  source: content("/opt/capsule/inputs/main.mjs"),
  sourceManifest: content("/opt/capsule/inputs/source-manifest.cbor"),
  input: content("/opt/capsule/inputs/input.json")
};
check(JSON.stringify(profile.content) === JSON.stringify(expectedContent), "content profile mismatch");
const directRef = async (path) => { const bytes = await readFile(join(repository, path)); return { path, bytes: bytes.length, sha256: sha256(bytes) }; };
const expectedSourceInputs = {
  runtimeBundle: await directRef("experiments/typed-guest-transport-c5b6-deno-static-reproduction/artifacts/capsule-deno-core-c2b-runtime-bundle.tar.gz"),
  runtimeProvenance: await directRef("experiments/typed-guest-transport-c5b6-deno-static-reproduction/evidence/2026-08-12/provenance.intoto.json"),
  runtimeSbom: await directRef("experiments/typed-guest-transport-c5b6-deno-static-reproduction/evidence/2026-08-12/sbom.cdx.json"),
  runtimeNoticeClosure: await directRef("experiments/typed-guest-transport-c5b6-deno-static-reproduction/evidence/2026-08-12/source-notice-closure.json"),
  trustedInit: await directRef("experiments/typed-guest-transport-c5b1-executable-successor/dist/trusted-init"),
  trustedLauncher: await directRef("experiments/typed-guest-transport-c5b1-executable-successor/dist/trusted-launcher"),
  source: await directRef("experiments/typed-guest-transport-c5b0-v19-successor/fixtures/main.mjs"),
  sourceManifest: await directRef("experiments/typed-guest-transport-c5b0-v19-successor/fixtures/source-manifest.cbor"),
  input: await directRef("experiments/typed-guest-transport-c5b0-v19-successor/fixtures/input.json")
};
check(JSON.stringify(profile.sourceInputs) === JSON.stringify(expectedSourceInputs), "source input map mismatch");
const controllerProfile = await directRef("experiments/typed-guest-transport-c5b3-controlled-test-controller/manifests/controller-profile.json");
const adapterProfile = await directRef("experiments/typed-guest-transport-c5b5-no-run-effect-adapter/manifests/adapter-profile.json");
const adapterContractRef = await directRef("experiments/typed-guest-transport-c5b5-no-run-effect-adapter/contracts/effect-adapter-contract.json");
const adapterResolution = "A reviewed versioned adapter/effect implementation must bind this root's 100663296 bytes, or a separately versioned 134217728-byte root must replace this candidate before composite construction.";
const expectedMetadata = {
  controller: { mergeCommit: "60234e22674e46a42e8e5c382d85217a930c2c13", profile: controllerProfile, includedInRoot: false },
  effectAdapter: { mergeCommit: "3cfe7db16c55894be444d4c783659043dbd25c95", profile: adapterProfile, contract: adapterContractRef, frozenRootBytes: 134217728, compatibleAsIs: false, resolution: adapterResolution, includedInRoot: false }
};
check(JSON.stringify(profile.deliberatelyAbsent) === JSON.stringify(["shell", "package-manager", "network-configuration", "writable-scratch", "host-path", "controller", "effect-adapter", "libkrun", "libkrunfw"]), "deliberately-absent closure mismatch");
check(JSON.stringify(profile.blockers) === JSON.stringify(["the C5b5 adapter is provenance-only and incompatible as-is because it freezes a 134217728-byte root while this successor is 100663296 bytes", "a reviewed versioned adapter/effect implementation or separately versioned root must resolve the exact-size binding before composite construction", "no complete immutable host-plus-root composite exists", "the real effect implementation remains separately owned", "no exact owner/host/guest authorization profile exists", "nothing in this packet supplies runtime or product admission"]), "blocker closure mismatch");
check(JSON.stringify(profile.effects) === JSON.stringify({ artifactExecuted: false, runtimeExecuted: false, launcherExecuted: false, processStarted: false, artifactLoaded: false, libkrunLoaded: false, hvfCalled: false, vmStarted: false, guestStarted: false, networkAccessed: false, credentialAccessed: false, keychainAccessed: false, productStateMutated: false, admissionChanged: false }), "effect boundary mismatch");
const adapterContractPath = join(root, "inputs/c5b5/effect-adapter-contract.json");
const adapterContract = await json(adapterContractPath);
const adapterContractBytes = await readFile(adapterContractPath);
check(profile.metadataOnly.effectAdapter.contract.bytes === adapterContractBytes.length &&
  profile.metadataOnly.effectAdapter.contract.sha256 === sha256(adapterContractBytes) &&
  adapterContract.immutableProfile.rootBytes === 134217728 &&
  profile.metadataOnly.effectAdapter.frozenRootBytes === 134217728 &&
  profile.metadataOnly.effectAdapter.frozenRootBytes !== profile.root.bytes &&
  profile.metadataOnly.effectAdapter.compatibleAsIs === false &&
  profile.metadataOnly.effectAdapter.resolution.includes("versioned adapter/effect implementation"),
"adapter compatibility boundary mismatch");
check(JSON.stringify(profile.metadataOnly) === JSON.stringify(expectedMetadata), "metadata-only input mismatch");

const comparison = await json(join(root, "evidence/2026-08-13/build-comparison.json"));
check(comparison.builds === 2 && comparison.byteEqual === true && comparison.buildA.sha256 === parsed.digest && comparison.buildB.sha256 === parsed.digest && comparison.normalizationApplied === false, "A/B comparison mismatch");
const mutations = await json(join(root, "evidence/2026-08-13/mutation-dispositions.json"));
check(mutations.status === "PASSED" && mutations.cases.length === 15 && mutations.cases.every((entry) => entry.disposition === "REFUSED"), "mutation evidence mismatch");

const manifestPath = join(root, "manifests/archive-manifest.json");
const manifest = await json(manifestPath);
const actual = [];
async function walk(directory) {
  for (const name of (await readdir(directory)).sort()) {
    const path = join(directory, name);
    const metadata = await stat(path);
    if (metadata.isDirectory()) await walk(path);
    else if (path !== manifestPath) {
      const bytes = await readFile(path);
      actual.push({ path: relative(root, path), mode: (metadata.mode & 0o777).toString(8).padStart(4, "0"), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
  }
}
await walk(root);
check(manifest.closed === true && manifest.manifestSelfExcluded === true && JSON.stringify(manifest.retainedFiles) === JSON.stringify(actual), "archive inventory mismatch");
console.log(JSON.stringify({ result: "PASSED", rootSha256: parsed.digest, nodes: parsed.paths.size, usedBlocks: parsed.usedBlocks, retainedFiles: actual.length, effects: "NONE" }));
