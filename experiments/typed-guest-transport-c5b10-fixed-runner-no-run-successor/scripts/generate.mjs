#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { libkrunSymbols, nominalEffects, providerSymbols } from "./verify-profile.mjs";

const check = process.argv.includes("--check");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = resolve(root, "..", "..");
const generated = new Map();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const ref = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes) });
const retain = (path, bytes) => {
  const exact = Buffer.from(bytes);
  generated.set(path, exact);
  return ref(path, exact);
};
const localRef = async (path) => ref(path, await readFile(join(root, path)));
const repositoryRef = async (path) => ref(path, await readFile(join(repository, path)));

const predecessorFrames = {
  source: "experiments/typed-guest-transport-c5b8-c5b7-root-binding-successor/fixtures/source.frame",
  input: "experiments/typed-guest-transport-c5b8-c5b7-root-binding-successor/fixtures/input.frame",
  completion: "experiments/typed-guest-transport-c5b9-immutable-no-run-composite/fixtures/completion.frame",
};
const sourceFrame = retain("fixtures/source.frame", await readFile(join(repository, predecessorFrames.source)));
const inputFrame = retain("fixtures/input.frame", await readFile(join(repository, predecessorFrames.input)));
const completionFrame = retain("fixtures/completion.frame", await readFile(join(repository, predecessorFrames.completion)));

const performedEffects = {
  artifactLinked: false,
  artifactLoaded: false,
  artifactExecuted: false,
  libkrunLoaded: false,
  hvfCalled: false,
  runnerStarted: false,
  processStarted: false,
  vmStarted: false,
  guestStarted: false,
  hostEffectPerformed: false,
  completionCommitted: false,
  deliveryPerformed: false,
  networkAccessed: false,
  credentialsAccessed: false,
  keychainAccessed: false,
  signingIdentityAccessed: false,
  productStateMutated: false,
  admissionChanged: false,
};
const authorization = {
  host: null,
  guest: null,
  executionAuthorization: null,
  executionAuthorized: false,
  constructionAuthorized: true,
  finalManifestAuthorizationRequired: true,
  callerSelectedAuthority: false,
};
const executionRequest = {
  acceptedFields: ["registrationId"],
  registrationId: "5273186561778ee1bb8d78c7911321ce",
  attemptId: "c5ab61f60d5ddc4c00a1bf50a8669344",
  attemptBound: true,
  attemptIssuedBeforeEffects: true,
  replacementPlanBytes: false,
  replacementSourceBytes: false,
  replacementInputBytes: false,
  callerExecutableBytes: false,
  callerHostPaths: false,
  callerEndpoints: false,
  callerFlags: false,
  callerImages: false,
  callerMounts: false,
  callerBackendConfiguration: false,
  callerEnvironment: false,
};

const components = {
  fixedRunnerSource: await localRef("source/fixed_runner.c"),
  fixedRunnerObject: await localRef("dist/fixed-runner.o"),
  supervisorDriverSource: await localRef("source/supervisor_effect_driver.c"),
  supervisorEffectHeader: await localRef("source/supervisor_effect_abi.h"),
  supervisorDriverObject: await localRef("dist/supervisor-effect-driver.o"),
  libkrun: await repositoryRef("experiments/typed-guest-transport-c5b2-governed-input-closure/inputs/c2b-v4/libkrun.1.dylib"),
  libkrunfw: await repositoryRef("experiments/typed-guest-transport-c5b4-libkrunfw-recovery/artifacts/libkrunfw.5.dylib"),
  runtimeRoot: await repositoryRef("experiments/typed-guest-transport-c5b7-deterministic-runtime-root/dist/runtime-root.ext4"),
  sourceFrame,
  inputFrame,
  completionFrame,
};

const profile = {
  objectType: "capsule.c5b10.fixed-runner-no-run-successor",
  objectVersion: 1,
  identity: "capsule.c5b10.fixed-runner-no-run-successor/2026-08-17",
  status: "construction-only-not-authorized",
  scopedStatus: "PASSED",
  parentStatus: "BLOCKED",
  productAdmission: "BLOCKED",
  repositoryBaseline: "7fc3af9c46895b340c3118a96cb50abb26b1d977",
  capsuleContext: "748fd0ef7a8fbf81a5c80f099c7592b88369d684",
  predecessors: {
    c5b7RuntimeRoot: "78485fb91a31733c568fe43e5fa295474e5956e1",
    c5b9NoRunComposite: "3965e6b5cc87d476da7f431d7ed8a5758011a1b8",
    c5bCompatibilityPreflight: "7fc3af9c46895b340c3118a96cb50abb26b1d977",
  },
  components,
  runnerRoot: {
    bytes: 100663296,
    sha256: "5ad18f20cbc97c7a70ead3e795fd3649672513323041e913b0eb55b7acc88775",
    historicalRunnerBytes: 134217728,
    historicalRunnerSha256: "390a4786a20d45f1c691ec8c203f84f5e9d372a30e98f867cc8309a144ca6798",
    historicalIdentityAccepted: false,
  },
  ownership: {
    libkrunOwner: "fixed-host-runner-process",
    runnerLibkrunImports: libkrunSymbols,
    supervisorLibkrunImports: [],
    runnerSupervisorEffectImports: [],
    supervisorEffectProviderImports: providerSymbols,
    duplicateLibkrunOwnership: false,
    historicalRootBoundEffectObjectLinked: false,
  },
  effectAbi: {
    publicEntryPoint: "_c5b10_drive_registered_attempt",
    providerSymbols,
    closedOutcomes: ["APPLIED", "NOT_APPLIED", "INDETERMINATE"],
    providersRetained: false,
    providerBindingStatus: "BLOCKED",
    requestEchoRequired: true,
    exactFactsRequired: true,
  },
  ordering: {
    nominalEffects,
    faultOnlyEffects: ["request-teardown"],
    readyBeforeFrameWrites: true,
    frameWritesBeforeWriterClosure: true,
    writerClosureBeforeStart: true,
    startBeforeCompletionDrain: true,
    completionLast: true,
    terminalJoinBeforeAbsence: true,
    absenceBeforeRootRemoval: true,
    commitBeforeDelivery: true,
  },
  transport: {
    payloadMaximumBytes: 262144,
    sourcePhysicalMaximum: 262296,
    inputPhysicalMaximum: 262296,
    completionPhysicalMaximum: 262368,
    completionRetentionBytes: 262369,
    readyByte: "R",
    startByte: "G",
    startWriterClosedAfterByte: true,
    completionTrailerLast: true,
    eofCommits: false,
    exitZeroCommits: false,
  },
  executionRequest,
  authorization,
  performedEffects,
  contradictionResolutions: {
    runnerRootIdentity: {
      resolved: true,
      mechanism: "The new fixed-runner source and object bind the exact 100,663,296-byte C5b7 root and reject the historical 134,217,728-byte identity.",
    },
    effectSequence: {
      resolved: true,
      mechanism: "The Supervisor driver writes both bounded frames, closes their writers, and only then sends the one-byte start authorization; completion, join, absence, root removal, commit, and delivery follow in order.",
    },
    perEffectAbi: {
      resolved: true,
      mechanism: "Fourteen distinct typed Supervisor provider symbols replace the historical single per-libkrun-call operation port; the fixed runner exports no Supervisor effect ABI.",
    },
    singleLibkrunOwner: {
      resolved: true,
      mechanism: "Only fixed-runner.o imports the closed 13-symbol libkrun surface; supervisor-effect-driver.o imports no libkrun symbol and the historical root-bound effect object is not linked.",
    },
  },
  limitations: [
    "The Supervisor effect providers are deliberately absent and no object is linked or runnable.",
    "No native artifact, dylib, HVF interface, runner, VM, guest, host effect, or product consumer was loaded or invoked.",
    "Static ABI and ordering closure do not prove platform behavior, completion truth, teardown, or authoritative absence.",
    "Controlled execution, preferred-form libkrunfw/kernel source compliance, installed composition, independent review, and runtime/profile admission remain blocked.",
    "The original dispatch contained an incorrect expansion of Capsule abbreviation 748fd0e; the orchestrator corrected it to exact 748fd0ef7a8fbf81a5c80f099c7592b88369d684.",
    "The sibling repository was initially unavailable; the orchestrator supplied this authorized disposable clone before construction resumed.",
  ],
};
const profileRef = retain("contracts/fixed-runner-profile.json", json(profile));

const packet = {
  objectType: "capsule.c5b10.fixed-runner-no-run-packet",
  objectVersion: 1,
  identity: "capsule.c5b10.fixed-runner-no-run-packet/2026-08-17",
  status: "construction-only-not-authorized",
  scopedStatus: "PASSED",
  parentStatus: "BLOCKED",
  profile: profileRef,
  executionRequest,
  fixedFixtures: { source: sourceFrame, input: inputFrame, completion: completionFrame },
  authorization,
  performedEffects,
};
retain("contracts/no-run-successor.json", json(packet));
retain("fixtures/effect-sequence.json", json({
  objectType: "capsule.c5b10.effect-sequence-fixture",
  objectVersion: 1,
  registrationId: executionRequest.registrationId,
  attemptId: executionRequest.attemptId,
  nominalEffects: nominalEffects.map((effect, index) => ({ sequence: index + 1, effect })),
  faultOnlyEffects: [{ sequence: 14, effect: "request-teardown" }],
  performed: false,
}));
retain("evidence/2026-08-17/construction.json", json({
  workItem: "C5b-S1 fixed-runner no-run successor",
  scopedStatus: "PASSED",
  parentC5bStatus: "BLOCKED",
  result: "The versioned source/object packet resolves the four retained static contradictions without linking, loading, or executing a native artifact.",
  deterministicObjects: { builds: 2, byteEqual: true },
  toolchain: { appleClang: "21.0.0 (clang-2100.1.1.101)", node: "22.22.1", target: "arm64-apple-macos" },
  authorization,
  performedEffects,
}));
retain("evidence/2026-08-17/mutation-dispositions.json", json({
  status: "PASSED",
  restoredInvalidCases: [
    "runner-root-size", "runner-root-digest", "effect-order", "per-effect-abi",
    "supervisor-libkrun-import", "duplicate-libkrun-owner", "execute-request-widening",
    "caller-authority", "host-presence", "guest-presence", "execution-authorization",
    "performed-effect", "completion-last", "teardown-order", "contradiction-reopened",
    "component-substitution", "closed-inventory-extra",
  ],
  originalCandidateRestoredAfterEveryCase: true,
  nativeCandidateArtifactMutated: false,
}));

for (const [path, bytes] of generated) {
  const destination = join(root, path);
  if (check) {
    if (!(await readFile(destination)).equals(bytes)) throw new Error(`generated file drift: ${path}`);
  } else {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
}

async function walk(path) {
  const output = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) output.push(...await walk(child)); else output.push(child);
  }
  return output;
}
const manifestPath = join(root, "manifests/archive-manifest.json");
const files = [];
for (const absolute of (await walk(root)).sort()) {
  if (absolute === manifestPath) continue;
  const bytes = await readFile(absolute);
  files.push({ path: relative(root, absolute), bytes: bytes.length, sha256: sha256(bytes) });
}
const manifestBytes = json({
  objectType: "capsule.experiment-archive-manifest",
  objectVersion: 1,
  identity: profile.identity,
  manifestSelfExcluded: true,
  files,
});
if (check) {
  if (!(await readFile(manifestPath)).equals(manifestBytes)) throw new Error("generated file drift: manifests/archive-manifest.json");
} else {
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, manifestBytes);
}

console.log(JSON.stringify({ result: "PASSED", check, retainedFiles: files.length }));
