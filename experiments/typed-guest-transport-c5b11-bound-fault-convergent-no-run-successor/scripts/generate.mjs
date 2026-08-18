#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { libkrunSymbols, nominalEffects, providerSymbols, recoveryEffects } from "./verify-profile.mjs";

const check = process.argv.includes("--check");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = resolve(root, "..", "..");
execFileSync(process.execPath, [join(root, "scripts/generate-bindings.mjs"), ...(check ? ["--check"] : [])],
  { stdio: "ignore" });

const generated = new Map();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const ref = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes) });
const retain = (path, bytes) => { const exact = Buffer.from(bytes); generated.set(path, exact); return ref(path, exact); };
const localRef = async (path) => ref(path, await readFile(join(root, path)));
const repositoryRef = async (path) => ref(path, await readFile(join(repository, path)));

const candidateFailureKinds = [
  "provider-error", "not-applied", "indeterminate", "echo-mismatch", "fact-mismatch",
];
const candidateCreatedRecovery = [
  { step: 14, effect: "fence-attempt", resume: 14 },
  { step: 15, effect: "lookup-fenced-attempt", resume: 15 },
  { step: 16, effect: "request-teardown-once", resume: 17 },
  { step: 17, effect: "reconcile-teardown-outcome", resume: 17 },
  { step: 18, effect: "reconcile-terminal-state", resume: 18 },
  { step: 19, effect: "reconcile-authoritative-absence", resume: 19 },
  { step: 20, effect: "reconcile-fixed-root-removal", resume: 20 },
];
const candidateCompletionRecovery = [
  { step: 14, effect: "fence-attempt", resume: 14 },
  { step: 15, effect: "lookup-fenced-attempt", resume: 15 },
  { step: 22, effect: "reopen-stored-completion", resume: 22 },
  { step: 23, effect: "replay-exact-stored-completion", resume: 23 },
];

function buildCandidateReconciliationFixture() {
  const primaryFailureCases = [];
  for (const [index, effect] of nominalEffects.entries()) {
    const sequence = index + 1;
    for (const failure of candidateFailureKinds) {
      const path = sequence >= 12 ? candidateCompletionRecovery
        : sequence >= 2 ? candidateCreatedRecovery : null;
      primaryFailureCases.push({
        sequence, effect, failure,
        processMayExist: sequence >= 2,
        trace: path ? path.map((item) => item.effect) : ["record-unresolved-cleanup"],
      });
    }
  }
  const recoveryStepFailureCases = [];
  const reopenRetryCases = [];
  for (const [pathName, path] of [["created", candidateCreatedRecovery], ["completion", candidateCompletionRecovery]]) {
    for (const [index, item] of path.entries()) {
      for (const failure of candidateFailureKinds) {
        recoveryStepFailureCases.push({
          path: pathName, step: item.step, effect: item.effect, failure,
          trace: [...path.slice(0, index + 1).map((entry) => entry.effect), "record-unresolved-cleanup"],
          durableResumeStep: item.resume, originalEffectRedriven: false,
        });
      }
      const resumeIndex = path.findIndex((entry) => entry.step >= item.resume);
      reopenRetryCases.push({
        path: pathName, interruptedStep: item.step, durableResumeStep: item.resume,
        trace: ["lookup-recovery-cursor", ...path.slice(resumeIndex).map((entry) => entry.effect)],
        originalEffectRedriven: false,
      });
    }
  }
  const teardownOutcomeCases = candidateFailureKinds.map((outcome) => ({
    outcome, requestCount: 1,
    trace: candidateCreatedRecovery.map((item) => item.effect),
    resumeStepAfterAmbiguousResponse: 17, nonIdempotentEffectRedriven: false,
  }));
  return {
    objectType: "capsule.c5b11.reconciliation-matrix", objectVersion: 2, performed: false,
    primaryFailureCases,
    ambiguousSpawnCases: primaryFailureCases.filter(({ sequence }) => sequence === 2),
    recoveryStepFailureCases, reopenRetryCases, teardownOutcomeCases,
    durableRecordFailure: {
      attemptRemainsFenced: true, processMayExist: true, cleanupResolved: false,
      terminalDisposition: "recovery-required-no-success",
    },
  };
}

const sourceFrame = await localRef("fixtures/source.frame");
const inputFrame = await localRef("fixtures/input.frame");
const completionFrame = await localRef("fixtures/completion.frame");
const attemptRuntimeProfile = await localRef("contracts/attempt-runtime-profile.json");
const attemptPlan = await localRef("contracts/attempt-plan.json");
const reconciliationMatrix = retain("fixtures/reconciliation-matrix.json",
  json(buildCandidateReconciliationFixture()));
const independentRecoveryOracle = await localRef("oracles/independent-recovery-oracle.json");

const performedEffects = {
  artifactLinked: false, artifactLoaded: false, artifactExecuted: false,
  libkrunLoaded: false, hvfCalled: false, runnerStarted: false, processStarted: false,
  vmStarted: false, guestStarted: false, hostEffectPerformed: false,
  completionCommitted: false, deliveryPerformed: false, networkAccessed: false,
  credentialsAccessed: false, keychainAccessed: false, signingIdentityAccessed: false,
  serviceStateMutated: false, productStateMutated: false, admissionChanged: false,
};
const authorization = {
  host: null, guest: null, executionAuthorization: null, executionAuthorized: false,
  constructionAuthorized: true, finalManifestAuthorizationRequired: true,
  callerSelectedAuthority: false,
};
const executionRequest = {
  acceptedFields: ["registrationId"],
  registrationId: "5273186561778ee1bb8d78c7911321ce",
  attemptId: "c5ab61f60d5ddc4c00a1bf50a8669344",
  attemptBound: true, attemptIssuedBeforeEffects: true,
  replacementPlanBytes: false, replacementSourceBytes: false, replacementInputBytes: false,
  callerExecutableBytes: false, callerHostPaths: false, callerEndpoints: false,
  callerFlags: false, callerImages: false, callerMounts: false,
  callerBackendConfiguration: false, callerEnvironment: false,
};

const components = {
  fixedRunnerSource: await localRef("source/fixed_runner.c"),
  fixedRunnerObject: await localRef("dist/fixed-runner.o"),
  supervisorDriverSource: await localRef("source/supervisor_effect_driver.c"),
  supervisorEffectHeader: await localRef("source/supervisor_effect_abi.h"),
  generatedAttemptBindings: await localRef("source/attempt_bindings.h"),
  supervisorDriverObject: await localRef("dist/supervisor-effect-driver.o"),
  attemptRuntimeProfile,
  attemptPlan,
  reconciliationMatrix,
  independentRecoveryOracle,
  libkrun: await repositoryRef("experiments/typed-guest-transport-c5b2-governed-input-closure/inputs/c2b-v4/libkrun.1.dylib"),
  libkrunfw: await repositoryRef("experiments/typed-guest-transport-c5b4-libkrunfw-recovery/artifacts/libkrunfw.5.dylib"),
  runtimeRoot: await repositoryRef("experiments/typed-guest-transport-c5b7-deterministic-runtime-root/dist/runtime-root.ext4"),
  sourceFrame, inputFrame, completionFrame,
};

const profile = {
  objectType: "capsule.c5b11.bound-fault-convergent-no-run-successor",
  objectVersion: 1,
  identity: "capsule.c5b11.bound-fault-convergent-no-run-successor/2026-08-18",
  status: "construction-only-not-authorized",
  scopedStatus: "PASSED",
  parentStatus: "BLOCKED",
  productAdmission: "BLOCKED",
  repositoryBaseline: "ecc3e5efb835931d2d2113d1bc20831a35aba8b4",
  capsuleContext: "748fd0ef7a8fbf81a5c80f099c7592b88369d684",
  predecessors: {
    c5b7RuntimeRoot: "78485fb91a31733c568fe43e5fa295474e5956e1",
    c5b9NoRunComposite: "3965e6b5cc87d476da7f431d7ed8a5758011a1b8",
    c5b10MergedCommit: "6eb030130734882de4529e647a5a0ac29af362f6",
    c5b10MergeCommit: "ecc3e5efb835931d2d2113d1bc20831a35aba8b4",
    c5b10PullRequest: "https://github.com/Shrimpworks/capsule-experiments/pull/30",
    c5b10AcceptedEvidence: false,
    c5b10ImportantFindings: ["stale-attempt-profile-binding", "incomplete-fault-reconciliation"],
  },
  components,
  bindingLayers: {
    attemptRuntimeProfile: {
      ...attemptRuntimeProfile,
      binds: [
        "fixedRunnerSource", "fixedRunnerObject", "libkrun", "libkrunfw", "runtimeRoot",
        "runtimeExecutable", "runtimeSnapshot", "c5b7RootProfile", "c5b7ArchiveManifest",
        "c5b6Provenance", "c5b6Sbom", "c5b6NoticeClosure", "c5b4SourceObligations",
      ],
      excludesSupervisorDriver: true,
      staleC5b8Sha256Rejected: "06079eea39ce9a2e0547837555a6953787d8c32d614f0ec7b9b07ef408de04cd",
    },
    attemptPlan: { ...attemptPlan, carriedByEveryFrameAndEffect: true },
    outerComposition: {
      bindsSupervisorDriver: true,
      driverSource: components.supervisorDriverSource,
      driverObject: components.supervisorDriverObject,
      abiHeader: components.supervisorEffectHeader,
      generatedBindings: components.generatedAttemptBindings,
      nonSelfReferential: true,
    },
  },
  runnerRoot: {
    bytes: 100663296,
    sha256: "5ad18f20cbc97c7a70ead3e795fd3649672513323041e913b0eb55b7acc88775",
    historicalRunnerBytes: 134217728,
    historicalRunnerSha256: "390a4786a20d45f1c691ec8c203f84f5e9d372a30e98f867cc8309a144ca6798",
    historicalIdentityAccepted: false,
  },
  ownership: {
    libkrunOwner: "fixed-host-runner-process", runnerLibkrunImports: libkrunSymbols,
    supervisorLibkrunImports: [], runnerSupervisorEffectImports: [],
    supervisorEffectProviderImports: providerSymbols, duplicateLibkrunOwnership: false,
    historicalRootBoundEffectObjectLinked: false,
  },
  effectAbi: {
    publicEntryPoint: "_c5b11_drive_registered_attempt", providerSymbols,
    closedOutcomes: ["APPLIED", "NOT_APPLIED", "INDETERMINATE"],
    providersRetained: false, providerBindingStatus: "BLOCKED",
    requestEchoRequired: true, exactFactsRequired: true,
    profileEchoRequired: true, frameEchoRequired: true,
    teardownIntentDurableBeforeSideEffectRequired: true,
    teardownDurableResumeStep: 17,
    recoveryCursorDurableAndMonotonicRequired: true,
  },
  ordering: {
    nominalEffects, recoveryEffects,
    readyBeforeFrameWrites: true, frameWritesBeforeWriterClosure: true,
    writerClosureBeforeStart: true, startBeforeCompletionDrain: true,
    completionLast: true, terminalJoinBeforeAbsence: true,
    absenceBeforeRootRemoval: true, commitBeforeDelivery: true,
  },
  faultConvergence: {
    matrix: reconciliationMatrix,
    independentOracle: independentRecoveryOracle,
    coveredFailures: ["provider-error", "NOT_APPLIED", "INDETERMINATE", "echo-mismatch", "fact-mismatch"],
    nonIdempotentRedrive: false, teardownRequestMaximum: 1,
    ambiguousSpawnProcessMayExist: true, startupRecoveryCursorLookup: true,
    recoveryStepFailureCrossProduct: true, interruptionReopenResume: true,
    fencedAttemptLookup: true, teardownOutcomeReconciled: true,
    terminalJoinBeforeAbsence: true, absenceBeforeRootRemoval: true,
    unresolvedCleanupDurable: true, commitResponseLossUsesStoredRecord: true,
    replayExactBytes: true,
  },
  transport: {
    payloadMaximumBytes: 262144, sourcePhysicalMaximum: 262296,
    inputPhysicalMaximum: 262296, completionPhysicalMaximum: 262368,
    completionRetentionBytes: 262369, readyByte: "R", startByte: "G",
    startWriterClosedAfterByte: true, completionTrailerLast: true,
    eofCommits: false, exitZeroCommits: false,
  },
  executionRequest, authorization, performedEffects,
  contradictionResolutions: {
    runnerRootIdentity: { resolved: true, mechanism: "The attempt runtime profile digests the exact C5b11 runner source/object, libkrun, libkrunfw, and 100,663,296-byte root; all frames and effect echoes carry that new profile digest." },
    effectSequence: { resolved: true, mechanism: "The spawn boundary becomes process-may-exist before invocation; every ambiguous spawn or later failure enters fenced, non-redriving teardown/terminal/absence/root reconciliation or durable unresolved state, and startup reopens the durable recovery cursor." },
    perEffectAbi: { resolved: true, mechanism: "Twenty-four closed typed provider symbols separate nominal effects, recovery-cursor lookup, reconciliation, unresolved cleanup, and exact stored replay." },
    singleLibkrunOwner: { resolved: true, mechanism: "Only fixed-runner.o imports the closed 13-symbol libkrun surface; the Supervisor driver imports no libkrun symbol." },
  },
  limitations: [
    "C5b10 commit 6eb0301 and PR #30 are preserved but not accepted evidence because independent review found stale attempt binding and incomplete fault reconciliation.",
    "The Supervisor effect providers are deliberately absent and no object is linked or runnable.",
    "The independently authored literal oracle, generated matrix, Clang AST structure, and C source are static construction evidence, not proof of provider or platform behavior.",
    "No native artifact, dylib, HVF interface, runner, VM, guest, host effect, network target, credential, Keychain item, service, or product consumer was loaded or invoked.",
    "Controlled execution, provider implementations, installed composition, fresh independent review, runtime/profile admission, and product admission remain BLOCKED.",
    "The original dispatch's incorrect Capsule hash expansion was corrected to 748fd0ef7a8fbf81a5c80f099c7592b88369d684.",
    "The initial sibling-path blocker was resolved by the orchestrator-supplied disposable clone.",
    "PR #30 merged before the requested amendment draft transition; the orchestrator re-dispatched C5b-S1A as this fresh successor.",
    "C5b4 preferred-form kernel source is incomplete and distribution source compliance remains BLOCKED; exact binary identity is not dependency, source, licensing, or distribution admission.",
    "Supervisor provider provenance, cross-host reproducibility, installed composition, runtime/profile admission, and product admission remain BLOCKED.",
  ],
};
const profileRef = retain("contracts/fixed-runner-profile.json", json(profile));

retain("contracts/no-run-successor.json", json({
  objectType: "capsule.c5b11.bound-fault-convergent-no-run-packet", objectVersion: 1,
  identity: "capsule.c5b11.bound-fault-convergent-no-run-packet/2026-08-18",
  status: "construction-only-not-authorized", scopedStatus: "PASSED", parentStatus: "BLOCKED",
  profile: profileRef, attemptRuntimeProfile, attemptPlan, executionRequest,
  fixedFixtures: { source: sourceFrame, input: inputFrame, completion: completionFrame },
  reconciliationMatrix, independentRecoveryOracle, authorization, performedEffects,
}));
retain("fixtures/effect-sequence.json", json({
  objectType: "capsule.c5b11.effect-sequence-fixture", objectVersion: 1,
  registrationId: executionRequest.registrationId, attemptId: executionRequest.attemptId,
  nominalEffects: nominalEffects.map((effect, index) => ({ sequence: index + 1, effect })),
  recoveryEffects: recoveryEffects.map((effect, index) => ({ sequence: index + 14, effect })),
  performed: false,
}));
retain("evidence/2026-08-18/construction.json", json({
  workItem: "C5b-S1B C5b11 bound fault-convergent no-run successor amendment",
  scopedStatus: "PASSED", parentC5bStatus: "BLOCKED",
  result: "The amended immutable packet closes the three C5b-S3 Important findings without native linking, loading, or execution.",
  deterministicObjects: { builds: 2, byteEqual: true },
  toolchain: { appleClang: "21.0.0 (clang-2100.1.1.101)", node: "22.22.1", target: "arm64-apple-macos" },
  attemptRuntimeProfile, attemptPlan, authorization, performedEffects,
}));
retain("evidence/2026-08-18/mutation-dispositions.json", json({
  status: "PASSED",
  restoredInvalidCases: [
    "runner-root-size", "runner-root-digest", "stale-c5b8-profile", "frame-profile-substitution",
    "effect-echo-profile-removal", "ambiguous-spawn-state-bypass",
    "ambiguous-spawn-failure-bypass", "startup-recovery-cursor-removal",
    "startup-recovery-path-confusion",
    "source-reconciliation-absence", "source-reconciliation-root-removal",
    "source-teardown-reconciliation", "source-teardown-redrive-cursor",
    "source-unresolved-cleanup", "source-stored-completion-replay",
    "stored-completion-frame-binding", "runtime-executable-substitution",
    "runtime-snapshot-substitution", "root-profile-identity-substitution",
    "root-profile-manifest-substitution", "root-archive-manifest-substitution",
    "runtime-provenance-substitution", "runtime-sbom-substitution",
    "runtime-notice-substitution", "kernel-source-obligation-substitution",
    "driver-source-substitution", "driver-object-substitution", "independent-oracle-substitution",
    "effect-order", "per-effect-abi", "supervisor-libkrun-import", "duplicate-libkrun-owner",
    "execute-request-widening", "caller-authority", "host-presence", "guest-presence",
    "execution-authorization", "performed-effect", "completion-magic", "completion-protocol",
    "completion-method", "completion-role", "completion-header-length", "completion-attempt",
    "completion-registration", "completion-plan", "completion-profile", "completion-status",
    "completion-flags", "completion-reserved", "completion-payload-length",
    "completion-payload-digest", "completion-trailer-magic", "completion-trailer-protocol",
    "completion-trailer-method", "completion-trailer-role", "completion-trailer-length",
    "completion-trailer-attempt", "completion-trailer-digest", "ambiguous-spawn-matrix-bypass",
    "recovery-cross-product-missing", "reopen-retry-missing", "reconciliation-absence",
    "reconciliation-root-removal", "reconciliation-teardown", "unresolved-cleanup",
    "stored-completion-replay", "component-substitution", "closed-inventory-extra",
  ],
  originalCandidateRestoredAfterEveryCase: true, nativeCandidateArtifactMutated: false,
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
  objectType: "capsule.experiment-archive-manifest", objectVersion: 1,
  identity: profile.identity, manifestSelfExcluded: true, files,
});
if (check) {
  if (!(await readFile(manifestPath)).equals(manifestBytes)) throw new Error("generated file drift: manifests/archive-manifest.json");
} else {
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, manifestBytes);
}
console.log(JSON.stringify({ result: "PASSED", check, retainedFiles: files.length }));
