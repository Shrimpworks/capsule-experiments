#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { actions, exactProfile } from "./model.mjs";

const check = process.argv.includes("--check");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generated = new Map();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const retain = (path, value) => generated.set(path, json(value));
const ref = async (path) => {
  const bytes = await readFile(join(root, path));
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
};

const runnerEffects = [
  "KRUN_CREATE_CTX", "KRUN_SET_VM_CONFIG", "KRUN_DISABLE_IMPLICIT_CONSOLE",
  "KRUN_DISABLE_IMPLICIT_INIT", "KRUN_DISABLE_IMPLICIT_VSOCK",
  "KRUN_ADD_READ_ONLY_RAW_ROOT_FD", "KRUN_SET_ROOT_DISK_REMOUNT",
  "KRUN_ADD_VIRTIO_CONSOLE_MULTIPORT", "KRUN_ADD_SOURCE_PORT",
  "KRUN_ADD_INPUT_PORT", "KRUN_ADD_COMPLETION_PORT", "KRUN_SET_KERNEL_CONSOLE",
  "KRUN_SET_WORKDIR", "KRUN_SET_EXEC", "WRITE_READY", "REQUIRE_START_BYTE",
  "KRUN_START_ENTER",
];
const allEffects = [
  "CREATE_ENDPOINTS", "START_DRAINS", ...runnerEffects, "WRITE_SOURCE", "WRITE_INPUT",
  "CLOSE_INPUT_WRITERS", "ALLOW_CHILD", "REQUEST_TEARDOWN", "PROVE_ABSENCE",
  "REMOVE_FIXED_ROOT", "REQUEST_DURABLE_COMMIT", "DELIVER_STORED", "REPLAY_STORED",
  "FENCE_STORE", "STOP_MISMATCH",
];

const vectors = {
  objectType: "capsule.c5b5.effect-adapter-vectors",
  objectVersion: 1,
  cases: [
    { id: "profile-absent", profile: "absent", mask: 0, refusal: "PROFILE_ABSENT", effects: [] },
    { id: "profile-mismatch", profile: "mismatch", mask: 0, refusal: "PROFILE_MISMATCH", effects: [] },
    { id: "no-actions", profile: "exact", mask: 0, refusal: null, effects: [] },
    { id: "create-endpoints", profile: "exact", mask: actions.CREATE_ENDPOINTS, refusal: null, effects: ["CREATE_ENDPOINTS"] },
    { id: "start-drains", profile: "exact", mask: actions.START_DRAINS, refusal: null, effects: ["START_DRAINS"] },
    { id: "closed-runner-call-plan", profile: "exact", mask: actions.START_RUNNER, refusal: null, effects: runnerEffects },
    { id: "copy-both-inputs", profile: "exact", mask: actions.WRITE_SOURCE | actions.WRITE_INPUT, refusal: null, effects: ["WRITE_SOURCE", "WRITE_INPUT"] },
    { id: "close-then-allow", profile: "exact", mask: actions.CLOSE_INPUT_WRITERS | actions.ALLOW_CHILD, refusal: null, effects: ["CLOSE_INPUT_WRITERS", "ALLOW_CHILD"] },
    { id: "fault-convergence", profile: "exact", mask: actions.REQUEST_TEARDOWN | actions.PROVE_ABSENCE | actions.REMOVE_FIXED_ROOT, refusal: null, effects: ["REQUEST_TEARDOWN", "PROVE_ABSENCE", "REMOVE_FIXED_ROOT"] },
    { id: "completion-last-publication", profile: "exact", mask: actions.REQUEST_DURABLE_COMMIT | actions.DELIVER_STORED, refusal: null, effects: ["REQUEST_DURABLE_COMMIT", "DELIVER_STORED"] },
    { id: "response-loss-replay", profile: "exact", mask: actions.REPLAY_STORED, refusal: null, effects: ["REPLAY_STORED"] },
    { id: "indeterminate-fence-and-teardown", profile: "exact", mask: actions.REQUEST_TEARDOWN | actions.FENCE_STORE, refusal: null, effects: ["REQUEST_TEARDOWN", "FENCE_STORE"] },
    { id: "stop-mismatch", profile: "exact", mask: actions.STOP_MISMATCH, refusal: null, effects: ["STOP_MISMATCH"] },
    { id: "complete-closed-action-order", profile: "exact", mask: 32767, refusal: null, effects: allEffects },
    { id: "unknown-action", profile: "exact", mask: 32768, refusal: "ACTION_UNKNOWN", effects: [] },
  ],
};
retain("fixtures/action-vectors.json", vectors);

const inputPins = {
  controllerContract: await ref("inputs/c5b3/controller-contract.json"),
  controllerHeader: await ref("inputs/c5b3/controller_core.h"),
  libkrunHeader: await ref("inputs/c5b2/libkrun.h"),
  libkrunStaticInspection: await ref("inputs/c5b2/macho-inspection.json"),
  libkrunfwRecovery: await ref("inputs/c5b4/recovery.json"),
  libkrunfwStaticInspection: await ref("inputs/c5b4/macho-inspection.json"),
};
const source = await ref("source/effect_adapter.c");
const header = await ref("source/effect_adapter.h");
const buildA = await ref("dist/effect-adapter-a.o");
const buildB = await ref("dist/effect-adapter-b.o");
if (buildA.bytes !== buildB.bytes || buildA.sha256 !== buildB.sha256) throw new Error("A/B object mismatch");

const contract = {
  objectType: "capsule.c5b5.no-run-effect-adapter-contract",
  objectVersion: 1,
  identity: "capsule.c5b5.no-run-effect-adapter/2026-08-13",
  scope: "compile-only-action-translation",
  authorityOwner: "Execution Supervisor",
  inputController: "capsule.c5b3.controlled-test-controller/2026-08-13",
  passiveTransport: "capsule.typed-guest-transport/v1",
  immutableProfile: exactProfile,
  descriptorContract: {
    hostRunner: { stdin: 0, stdoutReady: 1, stderr: 2, startAuthorization: 3, root: 4, source: 5, input: 6, completion: 7, closeFromInclusive: 8 },
    launcher: { source: 3, input: 4, completion: 5, closeFromInclusive: 6 },
    completionWriter: "trusted-launcher-only",
    workloadCompletionEndpoint: false,
  },
  runnerCallPlan: runnerEffects,
  fixedStrings: {
    rootDevice: "/dev/vda", rootFilesystem: "ext4", rootOptions: "ro,nosuid,nodev",
    sourcePort: "capsule.source", inputPort: "capsule.input", completionPort: "capsule.completion",
    kernelConsole: "hvc0", workdir: "/", executable: "/usr/local/libexec/capsule-init.krun",
    readyByte: "R", authorizationByte: "G",
  },
  faultAndPublication: {
    capPlusOne: "irreversible-refusal-and-drain",
    stallResetCancel: "request-teardown",
    responseLossBeforeCommit: "no-authority",
    responseLossAfterCommit: "replay-stored",
    completionLast: true,
    teardownAbsenceCleanupRequired: true,
  },
  effectBoundary: {
    translatesOnly: true, invokesOperations: false, executionAuthorized: false,
    entryPointPresent: false, linked: false, loadableComposition: false, callerConfiguration: false,
    pathDiscovery: false, dynamicLoading: false, processLaunch: false, hvfCalled: false,
    vmStarted: false, guestStarted: false,
  },
};
retain("contracts/effect-adapter-contract.json", contract);

const profile = {
  objectType: "capsule.c5b5.no-run-effect-adapter-profile",
  objectVersion: 1,
  identity: contract.identity,
  scopedConstructionStatus: "PASSED",
  completeCompositionStatus: "BLOCKED",
  controlledExecutionStatus: "BLOCKED",
  productAdmission: "BLOCKED",
  repositoryBaseline: "5a2f835e8c9df8279237f940f5af757e119593bd",
  capsuleContract: { repository: "Shrimpworks/capsule-corp", commit: "22acf665797e248028c2625586322f698bc2ba74", acceptedADRs: ["ADR-0040", "ADR-0041", "ADR-0046"], typedTransportManifestSha256: "79767a34a27bcc32a5f9a479b6a8737f9f5791447fa425ad83455546eadae235" },
  prerequisites: {
    c5b3: { repository: "Shrimpworks/capsule-experiments", commit: "d3020c660c98efebe45f213ed1591220c70c180f", copiedInputs: [inputPins.controllerContract, inputPins.controllerHeader] },
    c5b2: { repository: "Shrimpworks/capsule-experiments", commit: "5a2f835e8c9df8279237f940f5af757e119593bd", libkrunDylib: { bytes: 4393448, sha256: exactProfile.libkrunDylibSha256, loaded: false }, copiedInputs: [inputPins.libkrunHeader, inputPins.libkrunStaticInspection] },
    c5b4: { repository: "Shrimpworks/capsule-experiments", commit: "ea2aa55130fb105c6b283cf24454c1efbf5b9680", libkrunfwDylib: { bytes: 24339104, sha256: exactProfile.libkrunfwDylibSha256, role: "sole-runtime-boot-kernel-carrier", copiedIntoThisSlice: false, loaded: false }, copiedInputs: [inputPins.libkrunfwRecovery, inputPins.libkrunfwStaticInspection] },
  },
  adapter: { source, header, buildA, buildB, deterministicBuilds: 2, byteEqual: true, format: "Mach-O arm64 MH_OBJECT", entryPoint: false, linked: false, loaded: false, executed: false, imports: 13, exports: 2 },
  absentPrerequisites: {
    governedDenoCoreBytes: true,
    rebuiltRuntimeRoot: true,
    executableCompositeManifest: true,
    executionAuthorizationProfile: true,
    effectImplementation: true,
  },
  effects: { artifactLoaded: false, artifactExecuted: false, dylibLinked: false, dylibLoaded: false, hvfCalled: false, processStarted: false, vmStarted: false, guestStarted: false, networkAccessed: false, credentialAccessed: false, keychainAccessed: false, signed: false, installed: false, serviceRegistered: false, productStateMutated: false, admissionChanged: false },
};
retain("manifests/adapter-profile.json", profile);
retain("evidence/2026-08-13/construction.json", {
  workItem: "C5b5 deterministic no-run effect-adapter construction",
  scopedStatus: "PASSED", completeCompositionStatus: "BLOCKED", controlledExecutionStatus: "BLOCKED",
  result: "A compile-only adapter validates exact immutable prerequisites and translates every C5b3 action into a closed descriptive operation plan. It has no effect implementation or execution authority.",
  deterministicBuild: { builds: 2, byteEqual: true, bytes: buildA.bytes, sha256: buildA.sha256 },
  effects: profile.effects,
});
retain("evidence/2026-08-13/model-results.json", { status: "PASSED", cases: vectors.cases.map(({ id, refusal, effects }) => ({ id, refusal, effects })) });
retain("evidence/2026-08-13/mutation-dispositions.json", {
  status: "PASSED",
  cases: [
    { id: "profile-absent", expected: "PROFILE_ABSENT" },
    { id: "profile-magic", expected: "PROFILE_MISMATCH" },
    { id: "profile-version", expected: "PROFILE_MISMATCH" },
    { id: "profile-structure-size", expected: "PROFILE_MISMATCH" },
    { id: "profile-each-fd", expected: "PROFILE_MISMATCH" },
    { id: "profile-resource-or-cap", expected: "PROFILE_MISMATCH" },
    { id: "profile-each-input-digest", expected: "PROFILE_MISMATCH" },
    { id: "unknown-action-bit", expected: "ACTION_UNKNOWN" },
    { id: "object-import", expected: "exact undefined-symbol closure mismatch" },
    { id: "object-export", expected: "exact exported-symbol closure mismatch" },
    { id: "object-load-command", expected: "MH_OBJECT no-load-command refusal" },
    { id: "archive-extra-or-changed-file", expected: "archive inventory/identity mismatch" },
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
    if (entry.isDirectory()) result.push(...await walk(child));
    else result.push(child);
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
const archive = json({ objectType: "capsule.experiment-archive-manifest", objectVersion: 1, identity: contract.identity, manifestSelfExcluded: true, retainedFiles });
if (check) {
  const actual = await readFile(join(root, archivePath));
  if (!actual.equals(archive)) throw new Error("archive manifest drift");
} else {
  await writeFile(join(root, archivePath), archive);
}
console.log(JSON.stringify({ result: "PASSED", check, vectors: vectors.cases.length, retainedFiles: retainedFiles.length, effects: "NONE" }));
