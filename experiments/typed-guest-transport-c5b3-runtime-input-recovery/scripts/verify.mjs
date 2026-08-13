#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const refuse = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sha256 = (path) => createHash("sha256").update(readFileSync(join(root, path))).digest("hex");

const walk = (directory = root) => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [relative(root, path)];
  })
  .sort();

const expectedFiles = [
  ".gitattributes",
  "HANDOFF.md",
  "README.md",
  "RESULTS.md",
  "evidence/2026-08-12/result.json",
  "evidence/2026-08-12/rusty-v8-recovery-verification.json",
  "evidence/2026-08-12/search-receipt.json",
  "inputs/rusty-v8/artifact-sha256sums.txt",
  "inputs/rusty-v8/fixed-verification.txt",
  "inputs/rusty-v8/librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz",
  "inputs/rusty-v8/provenance.intoto.json",
  "inputs/rusty-v8/release-manifest.json",
  "inputs/rusty-v8/src_binding_simdutf_release_aarch64-unknown-linux-gnu.rs",
  "manifests/archive-manifest.json",
  "manifests/recovery-plan.json",
  "scripts/generate.mjs",
  "scripts/test-mutations.mjs",
  "scripts/verify.mjs",
];
refuse(JSON.stringify(walk()) === JSON.stringify(expectedFiles), "closed inventory mismatch");

const plan = readJson("manifests/recovery-plan.json");
const archive = readJson("manifests/archive-manifest.json");
const recovered = readJson("evidence/2026-08-12/rusty-v8-recovery-verification.json");
const receipt = readJson("evidence/2026-08-12/search-receipt.json");
const result = readJson("evidence/2026-08-12/result.json");
const rustyManifest = readJson("inputs/rusty-v8/release-manifest.json");
const rustyProvenance = readJson("inputs/rusty-v8/provenance.intoto.json");

refuse(plan.objectType === "capsule.c5b3.governed-runtime-input-recovery", "object type mismatch");
refuse(plan.objectVersion === 1, "object version mismatch");
refuse(plan.repositoryBaseline === "5a2f835e8c9df8279237f940f5af757e119593bd", "baseline mismatch");
refuse(plan.capsuleSource === "22acf665797e248028c2625586322f698bc2ba74", "Capsule pin mismatch");
refuse(plan.scopedRecoveryPacketStatus === "PASSED", "scoped status mismatch");
refuse(plan.exactByteRecoveryStatus === "BLOCKED", "recovery must remain blocked");
refuse(plan.completeExecutableSuccessorStatus === "BLOCKED", "successor must remain blocked");
refuse(plan.controlledExecutionStatus === "BLOCKED", "execution must remain blocked");
refuse(plan.runtimeProfileAdmission === "BLOCKED", "admission must remain blocked");
refuse(archive.objectType === "capsule.experiment.archive-manifest", "archive type mismatch");
refuse(archive.entryCount === expectedFiles.length - 1, "archive entry count mismatch");
refuse(archive.excludes.length === 1 && archive.excludes[0] === "manifests/archive-manifest.json", "archive exclusion mismatch");
for (const entry of archive.entries) {
  const path = join(root, entry.path);
  refuse(statSync(path).isFile(), `archive entry is not regular: ${entry.path}`);
  refuse(statSync(path).size === entry.bytes, `archive size mismatch: ${entry.path}`);
  refuse(sha256(entry.path) === entry.sha256, `archive digest mismatch: ${entry.path}`);
}

const runtime = plan.artifacts.denoCoreExecutable;
const firmware = plan.artifacts.libkrunfw;
const kernel = plan.artifacts.kernel;
refuse(runtime.requiredBytes === 68496520, "runtime size mismatch");
refuse(runtime.requiredSha256 === "e781a90236cdf1272a9a16189c6be033164fa25a5aa9e52376ef998982ec0a77", "runtime digest mismatch");
refuse(runtime.retainedBytesAvailable === false && runtime.disposition === "BLOCKED", "runtime availability mismatch");
refuse(firmware.requiredBytes === 24339104, "libkrunfw size mismatch");
refuse(firmware.requiredSha256 === "0b14f4b8005dafd33c38df5935b9efdb6381c724224b3967ba1cecbecf10b6e9", "libkrunfw digest mismatch");
refuse(firmware.retainedBytesAvailable === false && firmware.disposition === "BLOCKED", "libkrunfw availability mismatch");
refuse(kernel.requiredBytes === 24117248, "kernel size mismatch");
refuse(kernel.requiredSha256 === "b50a4165215d5d897ab3614606a2105756cf8f2b2510cbceda9dc06057a5622d", "kernel digest mismatch");
refuse(kernel.disposition === "EVIDENCE_ONLY", "kernel authority mismatch");
refuse(plan.artifacts.separateFirmware.disposition === "INAPPLICABLE", "separate firmware must be inapplicable");

const deno = plan.runtimeReconstruction.deno;
refuse(deno.commit === "29b71f06c2df5ab06721ccbb7bc744fb8104356e", "Deno commit mismatch");
refuse(deno.tree === "172e57551fe5a6683f11c886a81f9634023a5514", "Deno tree mismatch");
refuse(deno.sourceArchive.available === false, "Deno source archive must remain absent");
refuse(deno.cargoSourceBundle.packages === 189 && deno.cargoSourceBundle.available === false, "Cargo closure mismatch");
refuse(deno.cargoLock.available === true, "retained Cargo lock mismatch");

const rusty = plan.runtimeReconstruction.rustyV8;
refuse(rusty.commit === "80e863ddb942a4aa2b384e794fc23e35b9d2bb15", "rusty_v8 commit mismatch");
refuse(rusty.archive.bytes === 37674703 && rusty.archive.available === true, "rusty_v8 archive mismatch");
refuse(rusty.archive.sha256 === "1ae209c9e4ba5803d010d2c79ee4cc0af0126c5a7ebcca211c7e41deaede4cd2", "rusty_v8 digest mismatch");
refuse(rusty.binding.available === true && rusty.binding.sha256 === "8603f09ab95e79620ea29f73933c09ae3618c6f924472c0ce36d5c614d1ceba4", "rusty_v8 binding mismatch");
refuse(rusty.historicalOracle.usedAsInput === true && rusty.historicalOracle.currentRetention === "RECOVERED_AND_VERIFIED", "oracle authority mismatch");
refuse(rusty.historicalOracle.expiresAt === "2026-09-03", "oracle expiry mismatch");

refuse(recovered.actions.run === 30925045754 && recovered.actions.artifactId === 8902402057, "recovery source mismatch");
refuse(recovered.downloadedInventory.fileCount === 11, "downloaded inventory mismatch");
refuse(recovered.downloadedInventory.allReleaseManifestEntriesMatchActualBytes === true, "downloaded manifest mismatch");
refuse(recovered.readOnlyArchiveInspection.correspondingSource.closesDenoFixedFixtureInputs === false, "Deno closure must remain open");
refuse(recovered.readOnlyArchiveInspection.correspondingSource.denoOrProbeEntries === 0, "unexpected Deno source claim");
refuse(recovered.retainedRequiredInputs.archive.readOnlyInspection.absoluteOrParentTraversalMembers === 0, "unsafe ar member claim");

const retainedRustyFiles = [
  "artifact-sha256sums.txt",
  "fixed-verification.txt",
  "librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz",
  "provenance.intoto.json",
  "src_binding_simdutf_release_aarch64-unknown-linux-gnu.rs",
];
for (const name of retainedRustyFiles) {
  const entry = rustyManifest.files[name];
  refuse(entry !== undefined, `missing rusty_v8 manifest entry: ${name}`);
  refuse(statSync(join(root, "inputs/rusty-v8", name)).size === entry.size, `rusty_v8 size mismatch: ${name}`);
  refuse(sha256(`inputs/rusty-v8/${name}`) === entry.sha256, `rusty_v8 digest mismatch: ${name}`);
}
refuse(sha256("inputs/rusty-v8/release-manifest.json") === recovered.downloadedInventory.releaseManifestSha256, "release manifest identity mismatch");
const checksumLines = readFileSync(join(root, "inputs/rusty-v8/artifact-sha256sums.txt"), "utf8").trim().split("\n");
const checksumMap = Object.fromEntries(checksumLines.map((line) => [line.slice(66), line.slice(0, 64)]));
for (const name of ["fixed-verification.txt", "librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz", "src_binding_simdutf_release_aarch64-unknown-linux-gnu.rs"]) {
  refuse(checksumMap[name] === sha256(`inputs/rusty-v8/${name}`), `checksum manifest mismatch: ${name}`);
}
const subjects = Object.fromEntries(rustyProvenance.subject.map((subject) => [subject.name, subject.digest.sha256]));
for (const name of ["fixed-verification.txt", "librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz", "src_binding_simdutf_release_aarch64-unknown-linux-gnu.rs"]) {
  refuse(subjects[name] === sha256(`inputs/rusty-v8/${name}`), `provenance subject mismatch: ${name}`);
}

const builder = plan.runtimeReconstruction.builder;
refuse(builder.image === "rust:1.95.0-bookworm@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1", "runtime builder mismatch");
refuse(builder.decisiveBuildNetwork === "none" && builder.emptyTargetAndOutput === true, "build boundary mismatch");
refuse(builder.imageAvailable === false && builder.dockerDaemonRunning === false, "builder availability mismatch");

const fwBuild = plan.libkrunfwReconstruction;
refuse(fwBuild.commit === "ec4b297964877d83432f9ccda6dad8ff6e9de3e4", "libkrunfw commit mismatch");
refuse(fwBuild.releaseArchiveSha256 === "5bfae6efee63dbdf04a8fac2a69d772d9f900af2f54c4429b4acdfd6d86b9979", "release archive mismatch");
refuse(fwBuild.sourceArchiveSha256 === "ef7207ebbada2657f8a0f128535a91099d10c082e3deb5c14bf2fe35ccd04fd0", "source archive mismatch");
refuse(fwBuild.linux61291SourceArchiveSha256 === "0ff2ab9e169f9f1948557471fbb450d3018f8c5b77caf288e1a3982582597969", "Linux archive mismatch");
refuse(fwBuild.kernelCInputSha256 === "96561a4e5dccec0364a28ac32c5668e13e31180d083f412c9f8be7599380c70d", "kernel.c mismatch");
refuse(fwBuild.allAcquisitionInputsAvailable === false, "acquisition closure must remain absent");
refuse(fwBuild.builder.currentExactEnvironmentQualified === false, "current environment must remain unqualified");

refuse(receipt.repositoryPins.capsuleExperiments === plan.repositoryBaseline, "receipt experiments pin mismatch");
refuse(receipt.repositoryPins.capsuleCorp === plan.capsuleSource, "receipt Capsule pin mismatch");
refuse(receipt.authorizedLocations.length === 5, "bounded location count mismatch");
refuse(receipt.authorizedLocations.every((item) => item.result === "NO_EXACT_BYTES"), "search result mismatch");
refuse(receipt.expected.length === 3 && receipt.expected.every((item) => item.found === false), "artifact search mismatch");
refuse(receipt.githubAuth.status === "INVALID" && receipt.githubAuth.credentialBytesRead === false, "GitHub auth safety mismatch");
refuse(receipt.laterAuthorizedRecovery.requiredArchiveRecovered === true && receipt.laterAuthorizedRecovery.requiredBindingRecovered === true, "later recovery mismatch");
refuse(receipt.docker.daemonStarted === false && receipt.docker.imagePulled === false, "Docker effects mismatch");

refuse(JSON.stringify(result.effects) === JSON.stringify(plan.effects), "effect readback mismatch");
refuse(plan.effects.authorizedGithubArtifactRecoveredByOrchestrator === true, "authorized recovery effect mismatch");
refuse(Object.entries(plan.effects).filter(([key]) => key !== "authorizedGithubArtifactRecoveredByOrchestrator").every(([, value]) => value === false), "unexpected effects must all be false");
for (const path of expectedFiles) refuse(statSync(join(root, path)).isFile(), `not a regular file: ${path}`);

console.log(`recoveryPlanSha256=${sha256("manifests/recovery-plan.json")}`);
console.log(`searchReceiptSha256=${sha256("evidence/2026-08-12/search-receipt.json")}`);
console.log("scopedRecoveryPacketStatus=PASSED");
console.log("exactByteRecoveryStatus=BLOCKED");
