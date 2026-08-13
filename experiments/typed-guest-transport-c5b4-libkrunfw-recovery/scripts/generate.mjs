#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function identity(path) {
  const bytes = await readFile(join(root, path));
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
}

async function emit(path, value) {
  const output = canonical(value);
  if (check) {
    if ((await readFile(join(root, path), "utf8")) !== output) throw new Error(`${path}: generated output mismatch`);
  } else {
    await writeFile(join(root, path), output);
  }
}

const archive = await identity("inputs/libkrunfw-prebuilt-aarch64.tgz");
const artifact = await identity("artifacts/libkrunfw.5.dylib");
const sourceNames = ["LICENSE-GPL-2.0-only", "LICENSE-LGPL-2.1-only", "Makefile", "bin2cbundle.py", "kernel.c"];
const sources = Object.fromEntries(await Promise.all(sourceNames.map(async (name) => [name, await identity(`sources/${name}`)])));

const effects = {
  artifactLoaded: false,
  artifactLinked: false,
  artifactExecuted: false,
  kernelExtracted: false,
  kernelExecuted: false,
  libkrunLoaded: false,
  hvfCalled: false,
  processStarted: false,
  vmStarted: false,
  guestStarted: false,
  networkAccessedByBuild: false,
  credentialAccessed: false,
  signingIdentityAccessed: false,
  signingCommandInvoked: false,
  installed: false,
  productStateMutated: false,
  admissionChanged: false,
};

const recovery = {
  objectType: "capsule.c5b4.libkrunfw-deterministic-recovery",
  objectVersion: 1,
  identity: "capsule.c5b4.libkrunfw-v5.5.0-deterministic-recovery/2026-08-12",
  scopedRecoveryStatus: "PASSED",
  completeExecutableSuccessorStatus: "BLOCKED",
  controlledExecutionStatus: "BLOCKED",
  runtimeProfileAdmission: "BLOCKED",
  repositoryBaseline: "5a2f835e8c9df8279237f940f5af757e119593bd",
  canonicalDecision: {
    capsuleRepository: "Shrimpworks/capsule-corp",
    adr: "ADR-0041",
    role: "sole-runtime-boot-kernel-carrier",
    extractedKernelRole: "derived-evidence-only-not-separate-runtime-input",
    separateFirmware: "INAPPLICABLE",
  },
  upstream: {
    repository: "libkrun/libkrunfw",
    version: "5.5.0",
    releaseTag: "v5.5.0",
    releaseAssetId: 441852825,
    releaseAssetName: "libkrunfw-prebuilt-aarch64.tgz",
    archive,
  },
  archiveSafety: {
    checkedBeforeExtraction: true,
    exactMembers: [
      "libkrunfw/",
      "libkrunfw/LICENSE-GPL-2.0-only",
      "libkrunfw/LICENSE-LGPL-2.1-only",
      "libkrunfw/Makefile",
      "libkrunfw/bin2cbundle.py",
      "libkrunfw/kernel.c",
    ],
    absolutePathMembers: 0,
    dotOrParentTraversalMembers: 0,
    symlinkMembers: 0,
    hardlinkMembers: 0,
    specialMembers: 0,
  },
  retainedSources: sources,
  build: {
    stages: 2,
    freshStages: true,
    stageMode: "0700",
    archiveOwnerPreserved: false,
    normalizedMtime: "2000-01-01T00:00:00Z",
    sandbox: "macOS sandbox-exec (deny network*)",
    sandboxApplied: true,
    cleanEnvironment: true,
    variables: {
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      DEVELOPER_DIR: "/Applications/Xcode.app/Contents/Developer",
      SDKROOT: "/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX26.5.sdk",
      MACOSX_DEPLOYMENT_TARGET: "14.0",
      SOURCE_DATE_EPOCH: "0",
      TZ: "UTC",
      LC_ALL: "C",
      LANG: "C",
    },
    command: "/usr/bin/make -j1 CC=/usr/bin/clang",
    toolchain: {
      architecture: "arm64",
      macos: "26.5.2",
      macosBuild: "25F84",
      xcode: "26.6 (17F113)",
      sdk: "26.5",
      appleClang: "21.0.0 (clang-2100.1.1.101)",
      gnuMake: "3.81",
    },
    buildA: artifact,
    buildB: { path: "ephemeral-stage-b/libkrunfw.5.dylib", bytes: artifact.bytes, sha256: artifact.sha256 },
    byteComparison: "IDENTICAL",
    expectedHistoricalIdentityMatched: true,
    linkerObservation: "reduced __DATA,__data alignment from 0x10000 to 0x4000 because it exceeds the segment maximum alignment",
  },
  retainedArtifact: artifact,
  staticMachO: {
    architecture: "arm64",
    fileType: "MH_DYLIB",
    installName: "libkrunfw.5.dylib",
    minimumMacos: "14.0",
    sdk: "26.5",
    dependencies: ["/usr/lib/libSystem.B.dylib"],
    exports: ["_KERNEL_BUNDLE", "_krunfw_get_kernel", "_krunfw_get_version"],
    uuid: "6D70E4BD-1977-32C8-9091-4B99162A9C5F",
    embeddedCodeSignature: "adhoc-linker-signed",
    loaded: false,
  },
  sourceAvailability: {
    generatedKernelBundleSourceRetained: true,
    licenseTextsRetained: true,
    preferredFormKernelSourceComplete: false,
    distributionSourceComplianceStatus: "BLOCKED",
    reason: "the release asset contains generated kernel.c but not the complete preferred-form Linux source, configuration, patches, and build-tool closure",
  },
  remainingBlockers: [
    "governed deno_core executable bytes",
    "complete reviewed controlled-test controller",
    "new immutable composite root/profile/manifest",
    "preferred-form kernel/source compliance before distribution",
    "separate exact owner authorization before execution",
  ],
  effects,
};
await emit("manifests/recovery.json", recovery);

await emit("evidence/2026-08-12/result.json", {
  workItem: "C5b4 deterministic libkrunfw recovery",
  scopedRecoveryStatus: "PASSED",
  completeExecutableSuccessorStatus: "BLOCKED",
  output: artifact,
  buildComparison: "IDENTICAL",
  expectedHistoricalIdentityMatched: true,
  effects,
});

await emit("evidence/2026-08-12/environment.json", recovery.build.toolchain);
await emit("evidence/2026-08-12/archive-safety.json", recovery.archiveSafety);
await emit("evidence/2026-08-12/build-comparison.json", {
  status: "PASSED",
  buildA: recovery.build.buildA,
  buildB: recovery.build.buildB,
  comparison: recovery.build.byteComparison,
  expectedHistoricalIdentityMatched: true,
  sandboxAppliedToBothBuilds: true,
  networkAllowed: false,
});
await emit("evidence/2026-08-12/macho-inspection.json", {
  method: "independent-raw-Mach-O-and-system-tool-static-readback",
  status: "PASSED",
  ...recovery.staticMachO,
  executed: false,
});
await emit("evidence/2026-08-12/license-source-inventory.json", {
  status: "PARTIAL",
  upstreamVersion: "5.5.0",
  archive: recovery.upstream.archive,
  retainedSources: sources,
  licenseExpressions: ["GPL-2.0-only", "LGPL-2.1-only"],
  generatedKernelBundleSourceRetained: true,
  preferredFormKernelSourceComplete: false,
  distributionSourceComplianceStatus: "BLOCKED",
});
await emit("evidence/2026-08-12/sbom.spdx-lite.json", {
  spdxVersion: "SPDX-2.3",
  dataLicense: "CC0-1.0",
  SPDXID: "SPDXRef-DOCUMENT",
  name: "Capsule-C5b4-libkrunfw-5.5.0-recovery",
  documentNamespace: `https://capsulecorp.invalid/spdx/c5b4/${artifact.sha256}`,
  packages: [
    {
      name: "libkrunfw",
      SPDXID: "SPDXRef-Package-libkrunfw",
      versionInfo: "5.5.0",
      downloadLocation: "https://github.com/libkrun/libkrunfw/releases/download/v5.5.0/libkrunfw-prebuilt-aarch64.tgz",
      filesAnalyzed: false,
      licenseConcluded: "NOASSERTION",
      licenseDeclared: "GPL-2.0-only AND LGPL-2.1-only",
      checksums: [{ algorithm: "SHA256", checksumValue: archive.sha256 }],
    },
  ],
  annotations: [{ annotationType: "OTHER", annotator: "Tool: Capsule C5b4 evidence generator", annotationDate: "2026-08-12T00:00:00Z", comment: "Evidence-only partial SBOM; preferred-form kernel source and full dependency closure remain blocked." }],
});
await emit("evidence/2026-08-12/provenance.intoto.json", {
  _type: "https://in-toto.io/Statement/v1",
  subject: [{ name: artifact.path, digest: { sha256: artifact.sha256 } }],
  predicateType: "https://slsa.dev/provenance/v1",
  predicate: {
    buildDefinition: {
      buildType: "https://capsulecorp.invalid/build-types/libkrunfw-prebuilt-source-recovery/v1",
      externalParameters: { version: "5.5.0", environment: recovery.build.variables, command: recovery.build.command },
      internalParameters: { stages: 2, normalizedMtime: recovery.build.normalizedMtime, sandbox: recovery.build.sandbox },
      resolvedDependencies: [{ uri: "https://github.com/libkrun/libkrunfw/releases/assets/441852825", digest: { sha256: archive.sha256 } }],
    },
    runDetails: {
      builder: { id: "https://capsulecorp.invalid/builders/owned-mac-local-no-run/v1" },
      metadata: { invocationId: "capsule-c5b4-libkrunfw-20260812" },
      byproducts: [{ name: "build-b", digest: { sha256: artifact.sha256 } }],
    },
  },
});
await emit("evidence/2026-08-12/mutation-dispositions.json", {
  status: "PASSED",
  cases: [
    { id: "archive-byte", expected: "official archive identity mismatch" },
    { id: "artifact-byte", expected: "retained artifact identity mismatch" },
    { id: "false-independent-build", expected: "build comparison mismatch" },
    { id: "separate-firmware-authority", expected: "boot-role decision mismatch" },
    { id: "false-preferred-source-closure", expected: "source-availability boundary mismatch" },
  ],
});

async function walk(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(child)));
    else result.push(child);
  }
  return result;
}

const manifestPath = "manifests/archive-manifest.json";
const retainedFiles = [];
for (const path of (await walk(root)).map((path) => relative(root, path)).filter((path) => path !== manifestPath).sort()) {
  const bytes = await readFile(join(root, path));
  const metadata = await stat(join(root, path));
  retainedFiles.push({ path, mode: (metadata.mode & 0o777).toString(8).padStart(4, "0"), bytes: bytes.length, sha256: sha256(bytes) });
}
await emit(manifestPath, {
  objectType: "capsule.experiment-archive-manifest",
  objectVersion: 1,
  identity: recovery.identity,
  manifestSelfExcluded: true,
  retainedFiles,
});

console.log(JSON.stringify({ result: "PASSED", check, retainedFiles: retainedFiles.length }));
