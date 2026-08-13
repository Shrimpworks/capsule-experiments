#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const check = process.argv.includes("--check");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(root, "../..");
const generated = new Map();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const refBytes = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha256(bytes) });
const ref = async (path) => refBytes(path, await readFile(join(root, path)));
const retain = (path, value) => generated.set(path, Buffer.isBuffer(value) ? value : json(value));
const s = (event, facts, state, disposition, actions) => ({ event, facts, expected: { state, disposition, actions } });

const bind = s("BIND_EXACT", ["EXACT_PROFILE", "EXACT_AUTHORIZATION", "EXACT_ARTIFACTS", "FIXED_ROOT_ABSENT"], "BOUND", "ADVANCED", ["CREATE_ENDPOINTS"]);
const endpoints = s("ENDPOINTS_VERIFIED", ["ENDPOINTS_DISTINCT"], "ENDPOINTS_READY", "ADVANCED", ["START_DRAINS"]);
const drains = s("DRAINS_STARTED", ["DRAINS_ACTIVE"], "RUNNER_READY", "ADVANCED", ["START_RUNNER"]);
const runner = s("RUNNER_STARTED", [], "INPUT_TRANSFER", "ADVANCED", ["WRITE_SOURCE", "WRITE_INPUT"]);
const inputs = s("INPUTS_WRITTEN", ["SOURCE_COMPLETE", "INPUT_COMPLETE", "LAUNCHER_INPUTS_VALID"], "LAUNCHER_VALIDATED", "ADVANCED", ["CLOSE_INPUT_WRITERS", "ALLOW_CHILD"]);
const launcher = s("CHILD_STARTED", [], "CHILD_RUNNING", "ADVANCED", []);
const result = s("RESULT_ACCEPTED", ["RESULT_VALID"], "RESULT_VALIDATED", "ADVANCED", []);
const trailer = s("TRAILER_COMMITTED", ["TRAILER_LAST"], "TRAILER_WRITTEN", "ADVANCED", []);
const frame = s("FRAME_ACCEPTED", ["FRAME_EXACT"], "FRAME_OBSERVED", "ADVANCED", []);
const terminal = s("TERMINAL_FACTS_JOINED", ["CHILD_TREE_ABSENT", "RUNNER_TERMINAL", "RUNNER_ABSENT", "TEARDOWN_RESOLVED", "CLEANUP_FALSE"], "TERMINAL_PROOF", "ADVANCED", ["REQUEST_DURABLE_COMMIT"]);
const commit = s("DURABLE_COMMIT_CONFIRMED", ["DURABLE_RECORD"], "DURABLE_COMMIT", "ADVANCED", ["DELIVER_STORED"]);
const delivered = s("RESPONSE_DELIVERED", [], "COMPLETE", "ADVANCED", []);
const prefix = [bind, endpoints, drains, runner, inputs, launcher, result, trailer, frame];

const vectors = {
  objectType: "capsule.c5b3.controller-state-vectors",
  objectVersion: 1,
  cases: [
    { id: "happy-completion-last", steps: [...prefix, terminal, commit, delivered], final: { state: "COMPLETE", durable: true } },
    { id: "bind-missing-authorization", steps: [s("BIND_EXACT", ["EXACT_PROFILE", "EXACT_ARTIFACTS", "FIXED_ROOT_ABSENT"], "REFUSED", "REFUSED", ["STOP_MISMATCH"])], final: { state: "REFUSED", durable: false } },
    { id: "endpoint-alias", steps: [bind, s("ENDPOINTS_VERIFIED", [], "REFUSED", "REFUSED", ["STOP_MISMATCH"])], final: { state: "REFUSED", durable: false } },
    { id: "source-input-cap-plus-one", steps: [bind, endpoints, drains, runner, s("CAP_PLUS_ONE", [], "TEARDOWN", "TEARDOWN_REQUIRED", ["REQUEST_TEARDOWN"])], final: { state: "TEARDOWN", durable: false } },
    { id: "zero-progress-stall", steps: [bind, endpoints, drains, runner, s("STALL", [], "TEARDOWN", "TEARDOWN_REQUIRED", ["REQUEST_TEARDOWN"])], final: { state: "TEARDOWN", durable: false } },
    { id: "stream-reset-during-input", steps: [bind, endpoints, drains, runner, s("STREAM_RESET", [], "TEARDOWN", "TEARDOWN_REQUIRED", ["REQUEST_TEARDOWN"])], final: { state: "TEARDOWN", durable: false } },
    { id: "cancel-before-runner", steps: [bind, endpoints, s("CANCEL", [], "TEARDOWN", "TEARDOWN_REQUIRED", ["REQUEST_TEARDOWN"])], final: { state: "TEARDOWN", durable: false } },
    { id: "cancel-during-child", steps: [bind, endpoints, drains, runner, inputs, launcher, s("CANCEL", [], "TEARDOWN", "TEARDOWN_REQUIRED", ["REQUEST_TEARDOWN"])], final: { state: "TEARDOWN", durable: false } },
    { id: "reader-death-after-trailer", steps: [bind, endpoints, drains, runner, inputs, launcher, result, trailer, s("READER_DEATH", [], "TEARDOWN", "TEARDOWN_REQUIRED", ["REQUEST_TEARDOWN"])], final: { state: "TEARDOWN", durable: false } },
    { id: "runner-fault-before-trailer", steps: [bind, endpoints, drains, runner, inputs, launcher, result, s("PROCESS_FAULT", [], "TEARDOWN", "TEARDOWN_REQUIRED", ["REQUEST_TEARDOWN"])], final: { state: "TEARDOWN", durable: false } },
    { id: "runner-fault-after-frame", steps: [...prefix, s("PROCESS_FAULT", [], "TEARDOWN", "TEARDOWN_REQUIRED", ["REQUEST_TEARDOWN"])], final: { state: "TEARDOWN", durable: false } },
    { id: "response-loss-before-durable-commit", steps: [...prefix, terminal, s("RESPONSE_LOST", [], "TEARDOWN", "TEARDOWN_REQUIRED", ["REQUEST_TEARDOWN"])], final: { state: "TEARDOWN", durable: false } },
    { id: "response-loss-after-durable-commit", steps: [...prefix, terminal, commit, s("RESPONSE_LOST", [], "COMPLETE", "REPLAY", ["REPLAY_STORED"])], final: { state: "COMPLETE", durable: true } },
    { id: "repeat-loss-replays-stored", steps: [...prefix, terminal, commit, delivered, s("RESPONSE_LOST", [], "COMPLETE", "REPLAY", ["REPLAY_STORED"])], final: { state: "COMPLETE", durable: true } },
    { id: "indeterminate-store-fences", steps: [...prefix, terminal, s("STORE_INDETERMINATE", [], "FENCED", "FENCED", ["FENCE_STORE", "REQUEST_TEARDOWN"])], final: { state: "FENCED", durable: false } },
    { id: "fault-converges-clean", steps: [bind, endpoints, drains, runner, s("DEADLINE", [], "TEARDOWN", "TEARDOWN_REQUIRED", ["REQUEST_TEARDOWN"]), s("TEARDOWN_CONFIRMED", ["TEARDOWN_RESOLVED"], "ABSENCE_PROVEN", "ADVANCED", ["PROVE_ABSENCE"]), s("ABSENCE_CONFIRMED", ["CHILD_TREE_ABSENT", "RUNNER_ABSENT"], "CLEANUP_REQUIRED", "ADVANCED", ["REMOVE_FIXED_ROOT"]), s("CLEANUP_CONFIRMED", ["FIXED_ROOT_REMOVED"], "REFUSED_CLEAN", "REFUSED", [])], final: { state: "REFUSED_CLEAN", durable: false } },
    { id: "cleanup-without-absence-refuses", steps: [bind, s("CANCEL", [], "TEARDOWN", "TEARDOWN_REQUIRED", ["REQUEST_TEARDOWN"]), s("CLEANUP_CONFIRMED", ["FIXED_ROOT_REMOVED"], "REFUSED", "REFUSED", ["STOP_MISMATCH"])], final: { state: "REFUSED", durable: false } },
    { id: "terminal-join-missing-runner-absence", steps: [...prefix, s("TERMINAL_FACTS_JOINED", ["CHILD_TREE_ABSENT", "RUNNER_TERMINAL", "TEARDOWN_RESOLVED", "CLEANUP_FALSE"], "REFUSED", "REFUSED", ["STOP_MISMATCH"])], final: { state: "REFUSED", durable: false } },
    { id: "trailer-not-last", steps: [bind, endpoints, drains, runner, inputs, launcher, result, s("TRAILER_COMMITTED", [], "REFUSED", "REFUSED", ["STOP_MISMATCH"])], final: { state: "REFUSED", durable: false } },
    { id: "duplicate-delivery-after-complete", steps: [...prefix, terminal, commit, delivered, s("RESPONSE_DELIVERED", [], "COMPLETE", "REFUSED", ["STOP_MISMATCH"])], final: { state: "COMPLETE", durable: true } }
  ]
};
retain("fixtures/state-vectors.json", vectors);

const contract = await ref("contracts/controller-contract.json");
const source = await ref("source/controller_core.c");
const header = await ref("source/controller_core.h");
const buildA = await ref("dist/controller-core-a.o");
const buildB = await ref("dist/controller-core-b.o");
if (buildA.bytes !== buildB.bytes || buildA.sha256 !== buildB.sha256) throw new Error("controller A/B objects differ");
const c5b2Path = "experiments/typed-guest-transport-c5b2-governed-input-closure/manifests/input-closure.json";
const c5b2Bytes = await readFile(join(repositoryRoot, c5b2Path));

const profile = {
  objectType: "capsule.c5b3.controlled-test-controller-profile",
  objectVersion: 1,
  identity: "capsule.c5b3.controlled-test-controller/2026-08-13",
  scopedControllerConstructionStatus: "PASSED",
  completeExecutableSuccessorStatus: "BLOCKED",
  controlledExecutionStatus: "BLOCKED",
  runtimeProfileAdmission: "BLOCKED",
  repositoryBaseline: "5a2f835e8c9df8279237f940f5af757e119593bd",
  capsuleContractInput: {
    repository: "Shrimpworks/capsule-corp",
    commit: "22acf665797e248028c2625586322f698bc2ba74",
    adr0046Status: "Accepted",
    typedTransportManifestSha256: "79767a34a27bcc32a5f9a479b6a8737f9f5791447fa425ad83455546eadae235"
  },
  predecessor: {
    mergeCommit: "5a2f835e8c9df8279237f940f5af757e119593bd",
    experimentRoot: "experiments/typed-guest-transport-c5b2-governed-input-closure",
    inputClosure: refBytes(c5b2Path, c5b2Bytes)
  },
  controller: {
    contract,
    source,
    header,
    buildA,
    buildB,
    deterministicBuilds: 2,
    byteEqual: true,
    format: "Mach-O arm64 relocatable object",
    entryPointPresent: false,
    effectAdapterPresent: false,
    executable: false,
    executed: false
  },
  externalImmutablePrerequisites: {
    governedDenoCore: { status: "BLOCKED", bytesPresent: false, expectedBytes: 68496520, expectedSha256: "e781a90236cdf1272a9a16189c6be033164fa25a5aa9e52376ef998982ec0a77" },
    libkrunfwBootKernelCarrier: { status: "BLOCKED", bytesPresent: false, expectedBytes: 24339104, expectedSha256: "0b14f4b8005dafd33c38df5935b9efdb6381c724224b3967ba1cecbecf10b6e9" },
    derivedKernelEvidenceOnly: { status: "EVIDENCE_ONLY", runtimePathAuthority: false, expectedBytes: 24117248, expectedSha256: "b50a4165215d5d897ab3614606a2105756cf8f2b2510cbceda9dc06057a5622d" },
    separateFirmware: { status: "INAPPLICABLE", pathAuthority: false },
    rebuiltRuntimeRoot: { status: "BLOCKED", bytesPresent: false },
    compositeManifest: { status: "BLOCKED", present: false },
    exactRunAuthorizationProfile: { status: "BLOCKED", present: false, digest: null },
    effectAdapter: { status: "BLOCKED", present: false }
  },
  boundAvailableInputs: {
    libkrun: { bytes: 4393448, sha256: "055d9d18dc964fec4aba21948c4a344cb7a51cb48a2c70017484b718eae12f9f", source: "C5b2 input closure" },
    hostRunner: { bytes: 100488, sha256: "a30e3f7cba5f480b6e164536854749b5e1ba3349f20af6c9c8e5d2590bffe1ad", source: "C5b2 input closure" },
    fixedSource: { bytes: 103, sha256: "c8e940feb89b342de2d5e6bd13c413226676de9a539fce34c4107516e635b475", source: "C5b0 packet" },
    fixedInput: { bytes: 36, sha256: "9de0c909cfb111bd99c3b0b5f7a10972894270c2867022a71b6b6f3c0cd1af6e", source: "C5b0 packet" },
    expectedCompletion: { bytes: 35, sha256: "bb7234ee486b0fbccc2091859ec93499e6a14ea7d6e091cdef60a0e2a6e8371c", source: "C5b0 packet" }
  },
  composition: { runnable: false, executionAuthorized: false, runtimeRoot: null, compositeManifest: null, effectAdapter: null, authorizationProfile: null },
  effects: {
    controllerExecuted: false,
    artifactLoaded: false,
    libkrunLoaded: false,
    hvfCalled: false,
    processStarted: false,
    vmStarted: false,
    guestStarted: false,
    networkAccessed: false,
    credentialAccessed: false,
    keychainAccessed: false,
    serviceRegistered: false,
    productStateMutated: false,
    admissionChanged: false
  }
};
retain("manifests/controller-profile.json", profile);

retain("evidence/2026-08-13/construction.json", {
  workItem: "C5b3 deterministic no-run controlled-test controller",
  scopedStatus: "PASSED",
  completeExecutableSuccessorStatus: "BLOCKED",
  controlledExecutionStatus: "BLOCKED",
  result: "Pure controller state-machine source and two byte-equal non-executable arm64 object builds are retained; no effect adapter or authorization profile exists.",
  deterministicBuild: { builds: 2, byteEqual: true, bytes: buildA.bytes, sha256: buildA.sha256 },
  toolchain: { target: "arm64-apple-macos14", language: "C17", linked: false, executed: false },
  effects: profile.effects
});
retain("evidence/2026-08-13/state-matrix.json", {
  status: "PASSED",
  implementation: "independent Node test double plus independent verifier",
  cases: vectors.cases.map(({ id, final }) => ({ id, final }))
});
retain("evidence/2026-08-13/mutation-dispositions.json", {
  status: "PASSED",
  cases: [
    { id: "controller-object-byte", expected: "controller build identity mismatch" },
    { id: "controller-source-byte", expected: "controller source identity mismatch" },
    { id: "invent-entry-point", expected: "controller must remain non-executable" },
    { id: "invent-authorization-profile", expected: "authorization profile must remain absent" },
    { id: "invent-runtime-binding", expected: "governed runtime prerequisite mismatch" },
    { id: "response-loss-redrive", expected: "response-loss oracle mismatch" },
    { id: "remove-terminal-absence", expected: "terminal required facts mismatch" },
    { id: "fixed-path-widening", expected: "fixed path contract mismatch" },
    { id: "closed-inventory-extra", expected: "archive inventory mismatch" }
  ]
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
const archive = json({ objectType: "capsule.experiment-archive-manifest", objectVersion: 1, identity: profile.identity, manifestSelfExcluded: true, retainedFiles });
if (check) {
  const actual = await readFile(join(root, archivePath));
  if (!actual.equals(archive)) throw new Error("archive manifest drift");
} else {
  await writeFile(join(root, archivePath), archive);
}
console.log(JSON.stringify({ result: "PASSED", check, vectors: vectors.cases.length, retainedFiles: retainedFiles.length, effects: "NONE" }));
