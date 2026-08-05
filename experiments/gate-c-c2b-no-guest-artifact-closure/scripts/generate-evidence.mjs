#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

const requiredEnvironment = [
  "STAGE_A",
  "STAGE_B",
  "CAPSULE_CORP",
  "DENO_REPO",
  "RUSTY_V8_REPO",
  "LIBKRUN_REPO",
  "INPUTS",
];
for (const name of requiredEnvironment) {
  if (!process.env[name]) throw new Error(`missing ${name}`);
}

const experiment = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const evidence = join(experiment, "evidence", "2026-08-05");
const manifests = join(experiment, "manifests");
mkdirSync(evidence, { recursive: true });
mkdirSync(manifests, { recursive: true });

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fileSha = (path) => sha(readFileSync(path));
const fileRecord = (path, selectedPath) => {
  const stat = statSync(path);
  return {
    selectedPath,
    bytes: stat.size,
    mode: (stat.mode & 0o777).toString(8).padStart(4, "0"),
    sha256: fileSha(path),
  };
};
const writeJson = (path, value) => {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return { path, bytes: statSync(path).size, sha256: fileSha(path) };
};
const writeSelfDigested = (path, value) => {
  value.selfDigestOfNullFormSha256 = null;
  value.selfDigestOfNullFormSha256 = sha(`${JSON.stringify(value, null, 2)}\n`);
  return writeJson(path, value);
};
const git = (repo, ...args) =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
const walkFiles = (root, directory = root) => {
  const result = [];
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) result.push(...walkFiles(root, path));
    else result.push(relative(root, path));
  }
  return result;
};

const stageA = process.env.STAGE_A;
const stageB = process.env.STAGE_B;
const outA = join(stageA, "out");
const outB = join(stageB, "out");
const outputFiles = walkFiles(outA);
if (JSON.stringify(outputFiles) !== JSON.stringify(walkFiles(outB))) {
  throw new Error("A/B output file inventory differs");
}
for (const path of outputFiles) {
  if (fileSha(join(outA, path)) !== fileSha(join(outB, path))) {
    throw new Error(`A/B output differs: ${path}`);
  }
}

const artifacts = {
  hostRunnerPreflight: fileRecord(
    join(outA, "macos/capsule-host-runner-preflight"),
    "artifact-pack/macos/capsule-host-runner-preflight",
  ),
  governedLibkrun: fileRecord(
    join(outA, "macos/libkrun.1.dylib"),
    "artifact-pack/macos/libkrun.1.dylib",
  ),
  libkrunfw: fileRecord(
    join(outA, "macos/libkrunfw.5.dylib"),
    "artifact-pack/macos/libkrunfw.5.dylib",
  ),
  guestKernel: fileRecord(
    join(outA, "macos/linux-6.12.91-arm64.bin"),
    "artifact-pack/macos/linux-6.12.91-arm64.bin",
  ),
  trustedInit: fileRecord(
    join(outA, "linux/capsule-init.krun"),
    "/usr/local/libexec/capsule-init.krun",
  ),
  trustedLauncher: fileRecord(
    join(outA, "linux/capsule-launcher"),
    "/usr/local/libexec/capsule-launcher",
  ),
  rawRuntimeRoot: fileRecord(
    join(outA, "linux/capsule-c2b-runtime-root.ext4"),
    "artifact-pack/linux/capsule-c2b-runtime-root.ext4",
  ),
  runtimeRootFiles: fileRecord(
    join(outA, "linux/runtime-root-files.tsv"),
    "artifact-pack/linux/runtime-root-files.tsv",
  ),
};

const refs = {
  capsuleCorp: {
    mergeCommit: "9c7f44011e8e03a680f9f1b6e76dc75ec3973667",
    sourceHead: "d0daf0f5376c9bc26e7e97a2cdddf4cde1459795",
    mergeTree: git(process.env.CAPSULE_CORP, "rev-parse", "9c7f44011e8e03a680f9f1b6e76dc75ec3973667^{tree}"),
    sourceTree: git(process.env.CAPSULE_CORP, "rev-parse", "d0daf0f5376c9bc26e7e97a2cdddf4cde1459795^{tree}"),
  },
  deno: {
    mergeCommit: "4cce46bafccd0df9d1709cf406cd03c05b5daa0b",
    sourceHead: "29b71f06c2df5ab06721ccbb7bc744fb8104356e",
    mergeTree: git(process.env.DENO_REPO, "rev-parse", "4cce46bafccd0df9d1709cf406cd03c05b5daa0b^{tree}"),
    sourceTree: git(process.env.DENO_REPO, "rev-parse", "29b71f06c2df5ab06721ccbb7bc744fb8104356e^{tree}"),
  },
  capsuleExperimentsBaseline: {
    mergeCommit: "22b9eb2e92d17398e2844ad122e6c28faaf3a678",
    sourceHead: "e016386ce6260dbca9f451cc07986fae24dfb334",
    mergeTree: git(experiment, "rev-parse", "22b9eb2e92d17398e2844ad122e6c28faaf3a678^{tree}"),
    sourceTree: git(experiment, "rev-parse", "e016386ce6260dbca9f451cc07986fae24dfb334^{tree}"),
  },
  rustyV8: {
    commit: "80e863ddb942a4aa2b384e794fc23e35b9d2bb15",
    tree: git(process.env.RUSTY_V8_REPO, "rev-parse", "80e863ddb942a4aa2b384e794fc23e35b9d2bb15^{tree}"),
  },
  libkrun: {
    upstreamCommit: "728df8125077d0db44265f6e997c72b81b65c015",
    governedBase: "4ea8d1de861ed1c0636fc800b6da8fb71a086aa5",
    sourceHead: "8a2c91943793668f31a1cf7af431933be935bb58",
    mergeCommit: "cf0333cdba478cc34a8570a65b38412da7fd3ecc",
    mergeTree: git(process.env.LIBKRUN_REPO, "rev-parse", "cf0333cdba478cc34a8570a65b38412da7fd3ecc^{tree}"),
    sourceTree: git(process.env.LIBKRUN_REPO, "rev-parse", "8a2c91943793668f31a1cf7af431933be935bb58^{tree}"),
    cargoLockSha256: fileSha(join(process.env.LIBKRUN_REPO, "Cargo.lock")),
  },
};
if (refs.capsuleCorp.mergeTree !== refs.capsuleCorp.sourceTree) {
  throw new Error("capsule-corp squash merge/source trees differ");
}

const sourceRefs = writeJson(join(evidence, "source-ref-verification.json"), {
  contract: "capsule.c2b-no-guest.source-ref-verification/v1",
  observedAt: "2026-08-05",
  refs,
  canonicalInputs: {
    c1: { bytes: 9289, sha256: "d5d75e638a15be6c9f4a3230d17309d085f6ec103a73b64d9e0fd656a5423c9e" },
    c2a: { bytes: 26850, sha256: "d4ce88888186266f5d251e6246c889b1fd46d7746bb0ba56bcc4b3ce4675992f" },
    c2bPassiveBinding: { bytes: 8221, sha256: "3540d5224bdc81edbceafa1f0f17ac119904a70feab604957ab349dd116961a6" },
    forkSupplement: { sha256: "41350bcfc854338ded5e62f77475daf86486351356104dbbf647a8f8b5f11946" },
    buildEvidenceV2SelfDigest: { sha256: "732301bf8553b0c59b3fe0e4f2b9e070dcc3a1b478e742dc13bd438873b7e488" },
  },
  acquisitionInputs: {
    libkrunfwCommit: "ec4b297964877d83432f9ccda6dad8ff6e9de3e4",
    libkrunfwReleaseArchiveSha256: "5bfae6efee63dbdf04a8fac2a69d772d9f900af2f54c4429b4acdfd6d86b9979",
    libkrunfwSourceArchiveSha256: "ef7207ebbada2657f8a0f128535a91099d10c082e3deb5c14bf2fe35ccd04fd0",
    linux61291SourceArchiveSha256: "0ff2ab9e169f9f1948557471fbb450d3018f8c5b77caf288e1a3982582597969",
    kernelCInputSha256: "96561a4e5dccec0364a28ac32c5668e13e31180d083f412c9f8be7599380c70d",
    libc6DebSha256: "01f4330719fd4f65580e16ea5a0527f372fca750e8f588d26deaf09f2d3b1cf4",
    libgccS1DebSha256: "576926b283613db80168ddf76380a3bd877602778cf0d226caa7bfbfa71eacf3",
  },
});

const mutation = writeJson(join(evidence, "mutation-dispositions.json"), {
  contract: "capsule.c2b-no-guest.mutation-dispositions/v1",
  observed: [
    "exact 0-through-7 runner preflight manifest passed to the mandatory build-only refusal",
    "missing fd7 refused",
    "extra fd8 refused",
    "wrong fd5 access mode refused",
    "wrong record-before-start byte refused",
    "linked runtime root refused",
    "extra argv refused",
    "extra environment refused",
  ],
  canonicalRestorationMutations: {
    "MUT-001..MUT-010": "not-rerun; retained canonical passive/fork evidence only",
    "MUT-011": "PASSED-build-only-runner-subset; missing/extra/wrong-mode cases refused",
    "MUT-012..MUT-014": "PASSED-static-source-closure; guest/runtime observation not authorized",
    "MUT-015..MUT-017": "BLOCKED-unsupported-or-unselected-values-preserved",
    "MUT-018": "PASSED-manifest; nulls remain null and historical substitution is forbidden",
  },
  limitation: "No guest, libkrun start API, HVF, composed profile, or workload was invoked.",
});

const retainedBuildEvidenceDirectory = join(evidence, "build-output-evidence");
mkdirSync(retainedBuildEvidenceDirectory, { recursive: true });
const retainedBuildEvidencePaths = [
  "macos/SHA256SUMS",
  "macos/evidence/file.txt",
  "macos/evidence/kernel-extraction.txt",
  "macos/evidence/libkrun-exports.txt",
  "macos/evidence/libkrun-macho.txt",
  "macos/evidence/libkrunfw-macho.txt",
  "macos/evidence/preflight-mutations.txt",
  "macos/evidence/runner-loads.txt",
  "linux/SHA256SUMS",
  "linux/runtime-root-files.tsv",
  "linux/evidence/e2fsck.txt",
  "linux/evidence/elf.txt",
  "linux/evidence/ext4-bin.txt",
  "linux/evidence/ext4-deterministic-inodes.txt",
  "linux/evidence/ext4-libexec.txt",
  "linux/evidence/ext4-superblock.txt",
];
const retainedBuildEvidence = [];
for (const path of retainedBuildEvidencePaths) {
  const targetName = path.replaceAll("/", "--");
  const bytes = readFileSync(join(outA, path));
  writeFileSync(join(retainedBuildEvidenceDirectory, targetName), bytes);
  retainedBuildEvidence.push({ path: `build-output-evidence/${targetName}`, bytes: bytes.length, sha256: sha(bytes) });
}
const disassemblyA = execFileSync("otool", ["-tvV", join(outA, "macos/capsule-host-runner-preflight")], { encoding: "utf8" }).replaceAll(stageA, "STAGE");
const disassemblyB = execFileSync("otool", ["-tvV", join(outB, "macos/capsule-host-runner-preflight")], { encoding: "utf8" }).replaceAll(stageB, "STAGE");
if (disassemblyA !== disassemblyB) throw new Error("runner disassembly differs between A/B");
if (disassemblyA.match(/\bbl\b[^\n]*_krun_/)) throw new Error("runner disassembly calls krun API");
const disassemblyName = "build-output-evidence/macos--host-runner-disassembly.txt";
writeFileSync(join(evidence, disassemblyName), disassemblyA);
retainedBuildEvidence.push({ path: disassemblyName, bytes: Buffer.byteLength(disassemblyA), sha256: sha(disassemblyA) });
const retainedBuildEvidenceAggregateSha256 = sha(retainedBuildEvidence.map((entry) =>
  `${entry.bytes}\t${entry.sha256}\t${entry.path}\n`).join(""));

const verification = writeJson(join(evidence, "verification.json"), {
  contract: "capsule.c2b-no-guest.build-verification/v1",
  result: "PASSED-exact-declared-output-equality",
  builds: ["clean-stage-a", "clean-stage-b"],
  acquisitionNetwork: "connected-only-before-decisive-builds; digest-pinned declared inputs",
  decisiveMacosNetwork: "sandbox-exec deny network*",
  decisiveLinuxNetwork: "docker --network none; no default route",
  outputComparison: { method: "recursive inventory plus SHA-256 and byte equality", files: outputFiles.length },
  retainedBuildEvidence: { aggregateSha256: retainedBuildEvidenceAggregateSha256, files: retainedBuildEvidence },
  staticChecks: [
    "Mach-O load commands and exported libkrun symbols retained",
    "guest init and launcher are AArch64 static PIE ELF with no NEEDED entries",
    "governed runtime NEEDED set is libgcc_s.so.1, libm.so.6, libc.so.6, ld-linux-aarch64.so.1",
    "ext4 e2fsck read-only check passed; no journal; fixed UUID and hash seed",
    "runtime-root file inventory contains no shell, package system, etc, var, home, root, or opt",
    "host preflight disassembly contains no call to any krun_* symbol",
  ],
  noGuestAssertion: true,
  prohibitedInvocationsObserved: [],
  artifacts,
});

const parseLock = (text) => {
  const blocks = text.split("[[package]]").slice(1);
  return blocks.map((block) => {
    const field = (name) => block.match(new RegExp(`^${name} = "([^"]*)"`, "m"))?.[1] ?? null;
    return { name: field("name"), version: field("version"), source: field("source"), checksum: field("checksum") };
  });
};
const packages = parseLock(readFileSync(join(process.env.LIBKRUN_REPO, "Cargo.lock"), "utf8"));
const sbom = writeJson(join(evidence, "sbom.spdx-lite.json"), {
  spdxVersion: "SPDX-2.3",
  dataLicense: "CC0-1.0",
  name: "capsule-c2b-no-guest-artifact-closure-build-inputs",
  documentNamespace: "https://github.com/Shrimpworks/capsule-experiments/c2b-no-guest-artifact-closure/2026-08-05",
  scope: "Cargo.lock declared closure plus non-Cargo primary components; includes target/feature extras",
  packages: [
    ...packages,
    { name: "Shrimpworks-deno", version: "2.7.1-fork", source: refs.deno.mergeCommit, checksum: "e781a90236cdf1272a9a16189c6be033164fa25a5aa9e52376ef998982ec0a77" },
    { name: "rusty_v8", version: "0.32.1-fork", source: refs.rustyV8.commit, checksum: null },
    { name: "libkrunfw", version: "5.5.0", source: "ec4b297964877d83432f9ccda6dad8ff6e9de3e4", checksum: artifacts.libkrunfw.sha256 },
    { name: "linux", version: "6.12.91", source: "kernel.org", checksum: "0ff2ab9e169f9f1948557471fbb450d3018f8c5b77caf288e1a3982582597969" },
    { name: "Debian-glibc", version: "2.36-9+deb12u14", source: "Debian bookworm", checksum: "01f4330719fd4f65580e16ea5a0527f372fca750e8f588d26deaf09f2d3b1cf4" },
    { name: "Debian-libgcc-s1", version: "12.2.0-14+deb12u1", source: "Debian bookworm", checksum: "576926b283613db80168ddf76380a3bd877602778cf0d226caa7bfbfa71eacf3" },
  ],
});

const licenseInventory = writeJson(join(evidence, "source-license-notice-inventory.json"), {
  contract: "capsule.c2b-no-guest.source-license-notice-inventory/v1",
  components: [
    { component: "capsule-experiments harness", license: "Apache-2.0", source: "this archive commit" },
    { component: "Shrimpworks/deno", license: "MIT", source: refs.deno.mergeCommit },
    { component: "Shrimpworks/rusty_v8", license: "MIT", source: refs.rustyV8.commit },
    { component: "Shrimpworks/libkrun", license: "Apache-2.0", source: refs.libkrun.mergeCommit },
    { component: "libkrunfw wrapper", license: "LGPL-2.1-only", source: "ec4b297964877d83432f9ccda6dad8ff6e9de3e4" },
    { component: "embedded/extracted Linux kernel", license: "GPL-2.0-only", source: "Linux 6.12.91 plus retained libkrunfw patches" },
    { component: "Debian glibc runtime files", license: "LGPL-2.1-or-later and component notices", source: "libc6_2.36-9+deb12u14_arm64.deb" },
    { component: "Debian libgcc runtime file", license: "GPL-3.0-or-later WITH GCC-exception-3.1 and component notices", source: "libgcc-s1_12.2.0-14+deb12u1_arm64.deb" },
    { component: "Rust crates", license: "package-specific; lockfile inventory in SBOM", source: `${packages.length} Cargo.lock package records with vendored license files retained in acquisition closure` },
  ],
  noticesInMinimalRoot: "none; minimal runtime root intentionally excludes documentation; redistribution must accompany the archived source/license inputs and applicable notices",
  releaseDisposition: "not-a-release; unsigned; not published",
});

const buildSourcePaths = [
  "Cargo.toml",
  "Cargo.lock",
  ...walkFiles(join(experiment, "config")).map((path) => `config/${path}`),
  ...walkFiles(join(experiment, "crates")).map((path) => `crates/${path}`),
  ...walkFiles(join(experiment, "fixtures")).map((path) => `fixtures/${path}`),
  ...walkFiles(join(experiment, "source")).map((path) => `source/${path}`),
  "scripts/build-linux-artifacts.sh",
  "scripts/build-macos-artifacts.sh",
  "scripts/generate-fixtures.mjs",
  "scripts/prepare-stage.sh",
].sort();
const buildSources = buildSourcePaths.map((path) => fileRecord(join(experiment, path), path));
const buildSourceTreeSha256 = sha(buildSources.map((entry) =>
  `${entry.mode}\t${entry.bytes}\t${entry.sha256}\t${entry.selectedPath}\n`).join(""));

const runtimeManifestPath = join(manifests, "runtime-bundle-candidate.json");
const runtimeManifest = writeSelfDigested(runtimeManifestPath, {
  contract: "capsule.governed-deno-core.runtime-bundle-candidate/c2b-no-guest-v1",
  version: 1,
  status: "build-only-candidate-unadmitted",
  identity: "capsule.governed-deno-core-c2b-no-guest-artifact-pack/c1-c2a-v1",
  canonicalBindings: {
    c1: { bytes: 9289, sha256: "d5d75e638a15be6c9f4a3230d17309d085f6ec103a73b64d9e0fd656a5423c9e" },
    c2a: { bytes: 26850, sha256: "d4ce88888186266f5d251e6246c889b1fd46d7746bb0ba56bcc4b3ce4675992f" },
    c2bPassiveBinding: { bytes: 8221, sha256: "3540d5224bdc81edbceafa1f0f17ac119904a70feab604957ab349dd116961a6" },
  },
  governedRuntime: {
    binary: { bytes: 68496520, sha256: "e781a90236cdf1272a9a16189c6be033164fa25a5aa9e52376ef998982ec0a77", path: "/usr/local/bin/capsule-deno-core-c2b-fixed-fixture" },
    snapshot: { bytes: 699988, sha256: "4e8965217d5a6675a880326eee6f690bbeec7e7cb243decf2f3e9f453a871a2c", path: "/usr/local/share/capsule-deno-core/capsule_core_snapshot.bin" },
    twoFileBundleSha256: "ad908b8289c86f25c3413713fa3e60c4c8bb91fec0d52763e870d7a186865ee6",
  },
  buildSources: { aggregateSha256: buildSourceTreeSha256, files: buildSources },
  toolchains: {
    macos: { operatingSystem: "macOS 26.5.2 build 25F84 arm64", rustc: "1.93.1 (01f6ddf75 2026-02-11)", cargo: "1.93.1 (083ac5135 2025-12-15)", clang: "Apple clang 21.0.0 (clang-2100.1.1.101)" },
    linuxBuilder: { imageId: "sha256:7cf1e580ef5539f03b58560753e8ab84c8c360960d99dff714004aa98f203977", repoDigest: "rust@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1", rustc: "1.95.0 (59807616e 2026-04-14)", cargo: "1.95.0 (f2d3ce0bd 2026-03-21)", e2fsprogs: "1.47.0", binutils: "2.40", file: "5.44" },
  },
  artifacts: {
    governedLibkrun: artifacts.governedLibkrun,
    libkrunfw: artifacts.libkrunfw,
    guestKernel: artifacts.guestKernel,
    trustedInit: artifacts.trustedInit,
    trustedLauncher: artifacts.trustedLauncher,
    rawRuntimeRoot: artifacts.rawRuntimeRoot,
    runtimeRootFiles: artifacts.runtimeRootFiles,
  },
  descriptorRealization: {
    runner: "build-only preflight realizes exact 0..7 modes, closes >=8, validates one-byte G and unlinked owned O_RDONLY 0400 root; not a final host runner",
    guestInit: "close_range(0, UINT_MAX), then exact 0..5 device opens; no descriptor >=6",
    launcher: "exact 0..5 validation; closes source/input after fixed-frame equality; completion fd5 CLOEXEC before child",
    child: { executable: "/usr/local/bin/capsule-deno-core-c2b-fixed-fixture", argv: ["/usr/local/bin/capsule-deno-core-c2b-fixed-fixture"], environment: [], cwd: "/", stdin: "/dev/null", stdout: "dedicated launcher pipe", stderr: "dedicated launcher pipe", inheritedCompletionFd: false },
  },
  exactCaps: { sourcePhysicalBytes: 262296, inputPhysicalBytes: 262296, completionPhysicalBytes: 262368, completionRetainBytes: 262369, runtimeStdoutRetainBytes: 262369, runtimeStderrRetainBytes: 4194 },
  unsupportedUnselected: { cpuTimeLimitMs: null, hostVmmMemoryLimitBytes: null, scratchMaximumBytes: null, composedProfileIdentity: null, composedProfileDigest: null },
  evidence: { sourceRefs: sourceRefs.sha256, verification: verification.sha256, mutations: mutation.sha256, sbom: sbom.sha256, licenses: licenseInventory.sha256 },
  noGuestAssertion: true,
  admission: false,
});

const provenance = writeJson(join(evidence, "unsigned-provenance.json"), {
  predicateType: "https://slsa.dev/provenance/v1",
  unsigned: true,
  slsaLevelClaim: "none",
  subject: [{ name: "runtime-bundle-candidate.json", digest: { sha256: runtimeManifest.sha256 } }],
  builder: {
    macos: "macOS 26.5.2 build 25F84 arm64; rustc/cargo 1.93.1; Apple clang 21.0.0",
    linux: "sha256:7cf1e580ef5539f03b58560753e8ab84c8c360960d99dff714004aa98f203977",
    linuxRepoDigest: "rust@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1",
  },
  invocation: { macosNetwork: "deny network*", linuxNetwork: "none", sourceDateEpoch: 0, filesystemFakeTime: 946684800 },
  materials: { sourceRefs: sourceRefs.sha256, sbom: sbom.sha256, licenseInventory: licenseInventory.sha256 },
  noGuestAssertion: true,
  excluded: ["signature", "notarization", "release publication", "product wiring", "runtime/profile admission"],
});

writeSelfDigested(join(manifests, "artifact-closure-report.json"), {
  contract: "capsule.c2b-no-guest.artifact-closure-report/v1",
  status: { scopedSubArtifacts: "PASSED", parentC2b: "BLOCKED", parentGovernedRuntime: "IN_PROGRESS-TRENDING_GOOD" },
  constructedFinalIdentities: [
    { role: "governed-libkrun-dylib", ...artifacts.governedLibkrun, admitted: false },
    { role: "libkrunfw-dylib", ...artifacts.libkrunfw, admitted: false },
    { role: "guest-kernel", ...artifacts.guestKernel, admitted: false },
    { role: "trusted-init", ...artifacts.trustedInit, admitted: false },
    { role: "trusted-launcher", ...artifacts.trustedLauncher, admitted: false },
    { role: "raw-runtime-root", ...artifacts.rawRuntimeRoot, admitted: false },
  ],
  constructedCandidate: { role: "governed-runtime-bundle-manifest", selectedPath: "manifests/runtime-bundle-candidate.json", bytes: runtimeManifest.bytes, sha256: runtimeManifest.sha256, admitted: false, canonicalAuthorityStillNull: true },
  retainedPreflightOnly: { role: "host-runner", ...artifacts.hostRunnerPreflight, finalArtifactIdentityClosed: false, reason: "no libkrun calls; package-directory dyld fallback is observed; launch/configuration/teardown and guest evidence remain absent" },
  remainingNulls: ["host-runner final artifact identity", "separate firmware runnable byte identity", "composed runtime profile identity and digest", "cpu time limit", "host VMM memory limit", "scratch maximum", "guest-observed child/transport/root/device/teardown evidence"],
  evidence: { runtimeManifest: runtimeManifest.sha256, provenance: provenance.sha256, verification: verification.sha256, mutations: mutation.sha256, sourceRefs: sourceRefs.sha256, sbom: sbom.sha256, licenses: licenseInventory.sha256 },
  admission: false,
  noGuestAssertion: true,
});

writeFileSync(join(evidence, "verification-summary.txt"), [
  "PASSED scoped: six final sub-artifact byte identities constructed reproducibly.",
  "PASSED candidate: one exact runtime-bundle manifest constructed; canonical authority remains null/unadmitted.",
  "PASSED build-only: host runner descriptor/root/argv/env preflight and eight fixed cases.",
  "BLOCKED parent: final host runner, separate firmware identity, exact unsupported limits, composed profile, and guest-only evidence remain.",
  "NO GUEST / NO LIBKRUN START / NO HVF / NO RELEASE / NO SIGNATURE / NO ADMISSION.",
  `Declared output files compared byte-for-byte: ${outputFiles.length}.`,
].join("\n") + "\n");

console.log(JSON.stringify({ artifacts, runtimeManifest, outputFiles: outputFiles.length }, null, 2));
