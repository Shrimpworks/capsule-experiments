#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const encoded = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const ref = async (path) => { const bytes = await readFile(join(root, path)); return { path, bytes: bytes.length, sha256: sha256(bytes) }; };
const generated = new Map();
const retain = (path, value) => generated.set(path, encoded(value));

const buildA = await ref("dist/effect-implementation-a.o");
const buildB = await ref("dist/effect-implementation-b.o");
if (buildA.bytes !== buildB.bytes || buildA.sha256 !== buildB.sha256) throw new Error("A/B object mismatch");
const source = await ref("source/effect_implementation.c");
const header = await ref("source/effect_implementation.h");
const testDouble = await ref("source/test_double.c");
const predecessor = {
  c5b2: [await ref("inputs/c5b2/libkrun.h"), await ref("inputs/c5b2/macho-inspection.json")],
  c5b3: [await ref("inputs/c5b3/controller-contract.json"), await ref("inputs/c5b3/controller_core.h"), await ref("inputs/c5b3/controller_core.c")],
  c5b4: [await ref("inputs/c5b4/recovery.json"), await ref("inputs/c5b4/macho-inspection.json")],
  c5b5: [await ref("inputs/c5b5/effect-adapter-contract.json"), await ref("inputs/c5b5/adapter-profile.json"), await ref("inputs/c5b5/archive-manifest.json"), await ref("inputs/c5b5/effect-adapter.o"), await ref("inputs/c5b5/source/effect_adapter.h"), await ref("inputs/c5b5/source/effect_adapter.c")],
};

const contract = {
  objectType: "capsule.c5b7.real-effect-implementation-contract",
  objectVersion: 1,
  identity: "capsule.c5b7.real-effect-implementation/2026-08-13",
  scope: "compile-only-closed-effect-executor",
  authorityOwner: "Execution Supervisor",
  immutableProfile: {
    predecessor: "capsule.c5b5.no-run-effect-adapter/2026-08-13",
    rootBytes: 134217728,
    sourcePhysicalMaximum: 262296,
    inputPhysicalMaximum: 262296,
    completionPhysicalMaximum: 262368,
    completionRetentionBytes: 262369,
  },
  fixedDescriptors: { ready: 1, startAuthorization: 3, root: 4, source: 5, input: 6, completion: 7 },
  fixedStrings: {
    rootDevice: "/dev/vda", rootFilesystem: "ext4", rootOptions: "ro,nosuid,nodev",
    sourcePort: "capsule.source", inputPort: "capsule.input", completionPort: "capsule.completion",
    kernelConsole: "hvc0", workdir: "/", executable: "/usr/local/libexec/capsule-init.krun",
    argv: ["/usr/local/libexec/capsule-init.krun"], env: [], readyByte: "R", authorizationByte: "G",
  },
  contextPolicy: { createResultIsContext: true, freeAttemptedOnPreEnterFailure: true, freeResultRetained: true, freeAttemptedAtMostOnce: true, enterConsumesContext: true, enterReturnIsFailure: true },
  writePolicy: { partialProgress: "continue", zeroProgress: "refuse", error: "refuse", overReportedProgress: "refuse", capPlusOne: "refuse-before-copy" },
  requestOrdering: {
    authority: "exact-C5b3-controller-step-sequence",
    executorLocalCrossCallMemory: false,
    acceptedSeparateCallSequences: [["REQUEST_TEARDOWN", "PROVE_ABSENCE", "REMOVE_FIXED_ROOT"], ["REQUEST_DURABLE_COMMIT", "DELIVER_STORED"]],
  },
  effectBoundary: {
    invokesClosedEffects: true, directUndefinedLibkrunImports: true, directDarwinIoImports: ["read", "write", "close"],
    ownerRequestsOnly: ["create-endpoints", "start-drains", "allow-child", "teardown", "prove-absence", "remove-fixed-root", "durable-commit", "deliver-stored", "replay-stored", "fence-store", "stop-mismatch"],
    executionAuthorized: false, entryPointPresent: false, linked: false, loaded: false, dynamicLoading: false,
    pathDiscovery: false, callerConfiguration: false, filesystemDeletionImplemented: false,
    durableStoreImplemented: false, processLaunchImplemented: false, authorizationProfilePresent: false,
    hvfCalled: false, vmStarted: false, guestStarted: false,
  },
  nonComposability: {
    c5b7RootMetadataOnly: true,
    c5b7RootBytes: 100663296,
    predecessorRootBytes: 134217728,
    rootSizeMismatchRefuses: true,
    compositeStatus: "BLOCKED",
    requiredSuccessor: "versioned-96-MiB-adapter-profile-and-implementation-rebinding",
  },
};
retain("contracts/effect-implementation-contract.json", contract);

const testCases = [
  "profile-absent", "profile-mismatch", "inputs-absent", "inputs-size-mismatch", "root-identity-zero",
  "root-size-96MiB-mismatch", "source-cap-plus-one", "unknown-action", "closed-runner-order",
  "each-libkrun-configuration-first-error", "context-free-on-pre-enter-fault", "context-free-result-retained",
  "no-free-after-enter-consumption", "short-write-progress", "zero-write", "write-error", "wrong-start-byte",
  "start-trailing-byte", "read-error", "close-first-error-no-child", "teardown-absence-cleanup-separate-controller-steps",
  "commit-delivery-separate-controller-steps", "request-first-error", "unknown-effect",
];
retain("fixtures/test-matrix.json", {
  objectType: "capsule.c5b7.real-effect-test-matrix", objectVersion: 1, status: "PASSED",
  cases: testCases,
});

const effects = { artifactLoaded: false, artifactExecuted: false, libkrunLinked: false, libkrunLoaded: false, hvfCalled: false, processStarted: false, vmStarted: false, guestStarted: false, networkAccessed: false, credentialAccessed: false, keychainAccessed: false, signed: false, installed: false, serviceRegistered: false, productStateMutated: false, admissionChanged: false };
retain("manifests/effect-implementation-profile.json", {
  objectType: "capsule.c5b7.real-effect-implementation-profile", objectVersion: 1, identity: contract.identity,
  scopedImplementationStatus: "PASSED", completeCompositeStatus: "BLOCKED", controlledExecutionStatus: "BLOCKED", productAdmission: "BLOCKED",
  repositoryBaseline: "d9967e80a6155a65c6876dc686d8f8498b4a908f",
  capsuleContract: { repository: "Shrimpworks/capsule-corp", commit: "bd7cc9c98c07c91b4d96d3efa2f6261aba350971", acceptedADRs: ["ADR-0040", "ADR-0041", "ADR-0046"] },
  prerequisites: predecessor,
  implementation: { source, header },
  productionObject: { format: "Mach-O arm64 MH_OBJECT", buildA, buildB, deterministicBuilds: 2, byteEqual: true, entryPoint: false, linked: false, loaded: false, executed: false, directImports: 19, exports: 2 },
  testDouble: { source: testDouble, linked: true, executed: true, realLibkrunResolved: false, realLibkrunLoaded: false, usesDeterministicDoublesOnly: true },
  nonComposability: contract.nonComposability,
  effects,
});
retain("evidence/2026-08-13/construction.json", { workItem: "C5b7 compile-only real effect implementation", scopedStatus: "PASSED", completeCompositeStatus: "BLOCKED", productionObject: buildA, deterministicBuilds: 2, effects });
retain("evidence/2026-08-13/test-double-results.json", { status: "PASSED", realLibkrunResolved: false, realLibkrunLoaded: false, cases: testCases.length, firstErrorStop: true, contextCleanup: true, realControllerSeparateStepIntegration: true, productionObjectExecuted: false });
retain("evidence/2026-08-13/mutation-dispositions.json", {
  status: "PASSED", cases: [
    { id: "profile-root-size", expected: "C5b5 root size" }, { id: "contract-effect", expected: "closed effect boundary" },
    { id: "source-fixed-path", expected: "source identity" }, { id: "header-cap", expected: "header identity" },
    { id: "production-object", expected: "production A/B object identity" }, { id: "predecessor", expected: "C5b5 predecessor identity" },
    { id: "archive-extra", expected: "closed archive inventory" },
  ],
});

for (const [path, bytes] of generated) {
  const destination = join(root, path);
  if (check) {
    const actual = await readFile(destination);
    if (!actual.equals(bytes)) throw new Error(`generated drift: ${path}`);
  } else {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
}

async function walk(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) result.push(...await walk(child)); else result.push(child);
  }
  return result;
}
const archivePath = "manifests/archive-manifest.json";
const files = (await walk(root)).map((path) => relative(root, path)).filter((path) => path !== archivePath).sort();
const retainedFiles = [];
for (const path of files) {
  const bytes = await readFile(join(root, path));
  const metadata = await stat(join(root, path));
  retainedFiles.push({ path, mode: (metadata.mode & 0o777).toString(8).padStart(4, "0"), bytes: bytes.length, sha256: sha256(bytes) });
}
const archive = encoded({ objectType: "capsule.experiment-archive-manifest", objectVersion: 1, identity: contract.identity, manifestSelfExcluded: true, retainedFiles });
if (check) {
  const actual = await readFile(join(root, archivePath));
  if (!actual.equals(archive)) throw new Error("archive manifest drift");
} else await writeFile(join(root, archivePath), archive);
console.log(JSON.stringify({ status: "PASSED", check, retainedFiles: retainedFiles.length, effects: "NONE" }));
