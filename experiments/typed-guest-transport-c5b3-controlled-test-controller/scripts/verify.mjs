#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(process.argv[2] ?? defaultRoot);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const refuse = (condition, message) => { if (!condition) throw new Error(message); };
const json = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const exactKeys = (value, keys, label) => refuse(JSON.stringify(Object.keys(value)) === JSON.stringify(keys), `${label}: closed keys mismatch`);

const contract = await json("contracts/controller-contract.json");
exactKeys(contract, ["objectType", "objectVersion", "identity", "scope", "authorityOwner", "passiveTransport", "states", "events", "facts", "actions", "dispositions", "fixedPaths", "transport", "faultPolicy", "terminalJoinRequiredFacts", "futureAdapterBoundary"], "contract");
refuse(contract.objectType === "capsule.c5b3.controlled-test-controller-contract" && contract.objectVersion === 1, "contract identity mismatch");
refuse(contract.authorityOwner === "Execution Supervisor" && contract.passiveTransport === "capsule.typed-guest-transport/v1", "controller authority mismatch");
refuse(JSON.stringify(contract.states) === JSON.stringify(["STOPPED", "BOUND", "ENDPOINTS_READY", "RUNNER_READY", "INPUT_TRANSFER", "LAUNCHER_VALIDATED", "CHILD_RUNNING", "RESULT_VALIDATED", "TRAILER_WRITTEN", "FRAME_OBSERVED", "TERMINAL_PROOF", "DURABLE_COMMIT", "COMPLETE", "TEARDOWN", "ABSENCE_PROVEN", "CLEANUP_REQUIRED", "REFUSED_CLEAN", "FENCED", "REFUSED"]), "closed state set mismatch");
refuse(JSON.stringify(contract.events) === JSON.stringify(["BIND_EXACT", "ENDPOINTS_VERIFIED", "DRAINS_STARTED", "RUNNER_STARTED", "INPUTS_WRITTEN", "CHILD_STARTED", "RESULT_ACCEPTED", "TRAILER_COMMITTED", "FRAME_ACCEPTED", "TERMINAL_FACTS_JOINED", "DURABLE_COMMIT_CONFIRMED", "RESPONSE_DELIVERED", "RESPONSE_LOST", "TEARDOWN_CONFIRMED", "ABSENCE_CONFIRMED", "CLEANUP_CONFIRMED", "CANCEL", "DEADLINE", "STALL", "STREAM_RESET", "CAP_PLUS_ONE", "SHORT_WRITE", "READER_DEATH", "PROCESS_FAULT", "BINDING_MISMATCH", "STORE_INDETERMINATE"]), "closed event set mismatch");
refuse(JSON.stringify(contract.terminalJoinRequiredFacts) === JSON.stringify(["CHILD_TREE_ABSENT", "RUNNER_TERMINAL", "RUNNER_ABSENT", "TEARDOWN_RESOLVED", "CLEANUP_FALSE"]), "terminal required facts mismatch");
refuse(contract.fixedPaths.temporaryRoot === "/private/tmp/capsule-c5b3-controlled-typed-transport" && Object.values(contract.fixedPaths).every((path) => path.startsWith(contract.fixedPaths.temporaryRoot)), "fixed path contract mismatch");
refuse(contract.transport.completionPhysicalMaximumBytes === 262368 && contract.transport.completionRetentionBytes === 262369 && contract.transport.trailerWrittenLast && !contract.transport.eofCommits && !contract.transport.exitZeroCommits, "transport cap/completion-last mismatch");
refuse(contract.faultPolicy.responseLossAfterCommit === "REPLAY_BYTE_IDENTICAL_STORED_COMPLETION" && contract.faultPolicy.responseLossBeforeCommit === "REQUEST_TEARDOWN_NO_AUTHORITY", "response-loss oracle mismatch");
refuse(Object.values(contract.futureAdapterBoundary).every((value) => value === false || value === true) && !contract.futureAdapterBoundary.entryPointPresent && !contract.futureAdapterBoundary.effectAdapterPresent && !contract.futureAdapterBoundary.authorizationProfilePresent && !contract.futureAdapterBoundary.executionAuthorized && !contract.futureAdapterBoundary.runnable && contract.futureAdapterBoundary.separateReviewAndAuthorizationRequired, "future adapter boundary mismatch");

const profile = await json("manifests/controller-profile.json");
exactKeys(profile, ["objectType", "objectVersion", "identity", "scopedControllerConstructionStatus", "completeExecutableSuccessorStatus", "controlledExecutionStatus", "runtimeProfileAdmission", "repositoryBaseline", "capsuleContractInput", "predecessor", "controller", "externalImmutablePrerequisites", "boundAvailableInputs", "composition", "effects"], "profile");
refuse(profile.objectType === "capsule.c5b3.controlled-test-controller-profile" && profile.objectVersion === 1, "profile identity mismatch");
refuse(profile.repositoryBaseline === "5a2f835e8c9df8279237f940f5af757e119593bd" && profile.predecessor.mergeCommit === profile.repositoryBaseline, "predecessor baseline mismatch");
refuse(profile.capsuleContractInput.commit === "22acf665797e248028c2625586322f698bc2ba74" && profile.capsuleContractInput.adr0046Status === "Accepted" && profile.capsuleContractInput.typedTransportManifestSha256 === "79767a34a27bcc32a5f9a479b6a8737f9f5791447fa425ad83455546eadae235", "Capsule contract input mismatch");
refuse(profile.scopedControllerConstructionStatus === "PASSED" && profile.completeExecutableSuccessorStatus === "BLOCKED" && profile.controlledExecutionStatus === "BLOCKED" && profile.runtimeProfileAdmission === "BLOCKED", "status boundary mismatch");
refuse(!profile.composition.runnable && !profile.composition.executionAuthorized && profile.composition.runtimeRoot === null && profile.composition.compositeManifest === null && profile.composition.effectAdapter === null && profile.composition.authorizationProfile === null, "controller must remain non-executable");
refuse(profile.externalImmutablePrerequisites.exactRunAuthorizationProfile.status === "BLOCKED" && !profile.externalImmutablePrerequisites.exactRunAuthorizationProfile.present && profile.externalImmutablePrerequisites.exactRunAuthorizationProfile.digest === null, "authorization profile must remain absent");
refuse(profile.externalImmutablePrerequisites.governedDenoCore.status === "BLOCKED" && !profile.externalImmutablePrerequisites.governedDenoCore.bytesPresent && profile.externalImmutablePrerequisites.governedDenoCore.expectedSha256 === "e781a90236cdf1272a9a16189c6be033164fa25a5aa9e52376ef998982ec0a77", "governed runtime prerequisite mismatch");
refuse(profile.externalImmutablePrerequisites.libkrunfwBootKernelCarrier.status === "BLOCKED" && !profile.externalImmutablePrerequisites.libkrunfwBootKernelCarrier.bytesPresent && profile.externalImmutablePrerequisites.separateFirmware.status === "INAPPLICABLE" && !profile.externalImmutablePrerequisites.separateFirmware.pathAuthority, "boot carrier prerequisite mismatch");
refuse(Object.values(profile.effects).every((value) => value === false), "effect boundary mismatch");

for (const role of ["contract", "source", "header", "buildA", "buildB"]) {
  const entry = profile.controller[role];
  const bytes = await readFile(join(root, entry.path));
  refuse(bytes.length === entry.bytes && sha256(bytes) === entry.sha256, `${role === "source" ? "controller source" : role.startsWith("build") ? "controller build" : role} identity mismatch`);
}
refuse(profile.controller.buildA.bytes === profile.controller.buildB.bytes && profile.controller.buildA.sha256 === profile.controller.buildB.sha256 && profile.controller.byteEqual && profile.controller.deterministicBuilds === 2, "deterministic build mismatch");
refuse(profile.controller.format === "Mach-O arm64 relocatable object" && !profile.controller.entryPointPresent && !profile.controller.effectAdapterPresent && !profile.controller.executable && !profile.controller.executed, "controller must remain non-executable");

function machoObject(bytes, label) {
  refuse(bytes.readUInt32LE(0) === 0xfeedfacf && bytes.readUInt32LE(4) === 0x0100000c, `${label}: Mach-O arm64 mismatch`);
  refuse(bytes.readUInt32LE(12) === 1, `${label}: must be MH_OBJECT`);
  const commandCount = bytes.readUInt32LE(16);
  let offset = 32;
  let symtab = null;
  for (let index = 0; index < commandCount; index += 1) {
    const command = bytes.readUInt32LE(offset);
    const size = bytes.readUInt32LE(offset + 4);
    refuse(size >= 8 && offset + size <= bytes.length, `${label}: load command bounds`);
    refuse(![0x0c, 0x0d, 0x18, 0x1b, 0x1d, 0x28, 0x80000028].includes(command), `${label}: executable/load/signature command forbidden`);
    if (command === 0x02) symtab = { symoff: bytes.readUInt32LE(offset + 8), nsyms: bytes.readUInt32LE(offset + 12), stroff: bytes.readUInt32LE(offset + 16), strsize: bytes.readUInt32LE(offset + 20) };
    offset += size;
  }
  refuse(symtab !== null && symtab.symoff + symtab.nsyms * 16 <= bytes.length && symtab.stroff + symtab.strsize <= bytes.length, `${label}: symbol bounds`);
  const defined = [];
  const undefinedSymbols = [];
  for (let index = 0; index < symtab.nsyms; index += 1) {
    const entry = symtab.symoff + index * 16;
    const stringIndex = bytes.readUInt32LE(entry);
    refuse(stringIndex < symtab.strsize, `${label}: symbol string bounds`);
    const end = bytes.indexOf(0, symtab.stroff + stringIndex);
    refuse(end >= 0 && end < symtab.stroff + symtab.strsize, `${label}: symbol terminator`);
    const name = bytes.subarray(symtab.stroff + stringIndex, end).toString();
    const type = bytes[entry + 4] & 0x0e;
    if (type === 0) undefinedSymbols.push(name);
    else if (name.startsWith("_c5b3_")) defined.push(name);
  }
  refuse(undefinedSymbols.length === 0, `${label}: imports/effect dependencies forbidden`);
  refuse(JSON.stringify(defined.sort()) === JSON.stringify(["_c5b3_controller_reset", "_c5b3_controller_step"]), `${label}: exported symbol closure mismatch`);
}
machoObject(await readFile(join(root, profile.controller.buildA.path)), "controller A");
machoObject(await readFile(join(root, profile.controller.buildB.path)), "controller B");

const sourceText = await readFile(join(root, profile.controller.source.path), "utf8");
for (const required of ["C5B3_EVENT_CAP_PLUS_ONE", "C5B3_EVENT_STALL", "C5B3_EVENT_STREAM_RESET", "C5B3_EVENT_CANCEL", "C5B3_EVENT_RESPONSE_LOST", "C5B3_EVENT_STORE_INDETERMINATE", "C5B3_ACTION_REQUEST_DURABLE_COMMIT", "C5B3_ACTION_PROVE_ABSENCE", "C5B3_ACTION_REMOVE_FIXED_ROOT"]) refuse(sourceText.includes(required), `controller source missing ${required}`);
for (const forbidden of ["fork(", "exec", "posix_spawn", "dlopen", "krun_", "Hypervisor", "socket(", "connect(", "open(", "system(", "popen("]) refuse(!sourceText.includes(forbidden), `controller source contains forbidden effect surface ${forbidden}`);

const vectors = await json("fixtures/state-vectors.json");
refuse(vectors.objectType === "capsule.c5b3.controller-state-vectors" && vectors.objectVersion === 1 && vectors.cases.length === 20, "state vector inventory mismatch");
const ids = vectors.cases.map(({ id }) => id);
refuse(new Set(ids).size === ids.length, "duplicate state vector id");
const independentFaults = new Set(contract.faultPolicy.irreversible);
const includesAll = (actual, required) => required.every((value) => actual.includes(value));
function independentStep(machine, event, facts) {
  const result = (state, disposition, actions) => { machine.state = state; return { state, disposition, actions }; };
  if (event === "STORE_INDETERMINATE") { machine.durable = false; return result("FENCED", "FENCED", ["FENCE_STORE", "REQUEST_TEARDOWN"]); }
  if (machine.state === "COMPLETE") {
    if (event === "RESPONSE_LOST" && machine.durable) return result("COMPLETE", "REPLAY", ["REPLAY_STORED"]);
    return result("COMPLETE", "REFUSED", ["STOP_MISMATCH"]);
  }
  if (["FENCED", "REFUSED_CLEAN", "REFUSED"].includes(machine.state)) return result(machine.state, machine.state === "FENCED" ? "FENCED" : "REFUSED", [machine.state === "FENCED" ? "FENCE_STORE" : "STOP_MISMATCH"]);
  if (independentFaults.has(event) || (event === "RESPONSE_LOST" && !machine.durable)) return result("TEARDOWN", "TEARDOWN_REQUIRED", ["REQUEST_TEARDOWN"]);
  const table = new Map([
    ["STOPPED", ["BIND_EXACT", ["EXACT_PROFILE", "EXACT_AUTHORIZATION", "EXACT_ARTIFACTS", "FIXED_ROOT_ABSENT"], "BOUND", ["CREATE_ENDPOINTS"]]],
    ["BOUND", ["ENDPOINTS_VERIFIED", ["ENDPOINTS_DISTINCT"], "ENDPOINTS_READY", ["START_DRAINS"]]],
    ["ENDPOINTS_READY", ["DRAINS_STARTED", ["DRAINS_ACTIVE"], "RUNNER_READY", ["START_RUNNER"]]],
    ["RUNNER_READY", ["RUNNER_STARTED", [], "INPUT_TRANSFER", ["WRITE_SOURCE", "WRITE_INPUT"]]],
    ["INPUT_TRANSFER", ["INPUTS_WRITTEN", ["SOURCE_COMPLETE", "INPUT_COMPLETE", "LAUNCHER_INPUTS_VALID"], "LAUNCHER_VALIDATED", ["CLOSE_INPUT_WRITERS", "ALLOW_CHILD"]]],
    ["LAUNCHER_VALIDATED", ["CHILD_STARTED", [], "CHILD_RUNNING", []]],
    ["CHILD_RUNNING", ["RESULT_ACCEPTED", ["RESULT_VALID"], "RESULT_VALIDATED", []]],
    ["RESULT_VALIDATED", ["TRAILER_COMMITTED", ["TRAILER_LAST"], "TRAILER_WRITTEN", []]],
    ["TRAILER_WRITTEN", ["FRAME_ACCEPTED", ["FRAME_EXACT"], "FRAME_OBSERVED", []]],
    ["FRAME_OBSERVED", ["TERMINAL_FACTS_JOINED", contract.terminalJoinRequiredFacts, "TERMINAL_PROOF", ["REQUEST_DURABLE_COMMIT"]]],
    ["TERMINAL_PROOF", ["DURABLE_COMMIT_CONFIRMED", ["DURABLE_RECORD"], "DURABLE_COMMIT", ["DELIVER_STORED"]]],
    ["TEARDOWN", ["TEARDOWN_CONFIRMED", ["TEARDOWN_RESOLVED"], "ABSENCE_PROVEN", ["PROVE_ABSENCE"]]],
  ]);
  const row = table.get(machine.state);
  if (row && event === row[0] && includesAll(facts, row[1])) {
    if (row[2] === "DURABLE_COMMIT") machine.durable = true;
    return result(row[2], "ADVANCED", row[3]);
  }
  if (machine.state === "DURABLE_COMMIT") {
    if (event === "RESPONSE_DELIVERED") return result("COMPLETE", "ADVANCED", []);
    if (event === "RESPONSE_LOST" && machine.durable) return result("COMPLETE", "REPLAY", ["REPLAY_STORED"]);
  }
  if (machine.state === "ABSENCE_PROVEN") {
    if (event === "ABSENCE_CONFIRMED" && includesAll(facts, ["CHILD_TREE_ABSENT", "RUNNER_ABSENT"])) return result("CLEANUP_REQUIRED", "ADVANCED", ["REMOVE_FIXED_ROOT"]);
  }
  if (machine.state === "CLEANUP_REQUIRED") {
    if (event === "CLEANUP_CONFIRMED" && includesAll(facts, ["FIXED_ROOT_REMOVED"])) return result("REFUSED_CLEAN", "REFUSED", []);
  }
  return result("REFUSED", "REFUSED", ["STOP_MISMATCH"]);
}
const responseLoss = Object.fromEntries(vectors.cases.filter(({ id }) => id.includes("response-loss") || id.includes("repeat-loss")).map((test) => [test.id, test.final]));
refuse(responseLoss["response-loss-before-durable-commit"].state === "TEARDOWN" && !responseLoss["response-loss-before-durable-commit"].durable, "response-loss oracle mismatch");
refuse(responseLoss["response-loss-after-durable-commit"].state === "COMPLETE" && responseLoss["response-loss-after-durable-commit"].durable && responseLoss["repeat-loss-replays-stored"].durable, "response-loss oracle mismatch");
for (const test of vectors.cases) {
  refuse(test.steps.length > 0, `${test.id}: empty vector`);
  const machine = { state: "STOPPED", durable: false };
  for (const item of test.steps) {
    exactKeys(item, ["event", "facts", "expected"], `${test.id}/${item.event}`);
    exactKeys(item.expected, ["state", "disposition", "actions"], `${test.id}/${item.event}/expected`);
    refuse(contract.events.includes(item.event) && item.facts.every((fact) => contract.facts.includes(fact)), `${test.id}: unknown event/fact`);
    refuse(contract.states.includes(item.expected.state) && contract.dispositions.includes(item.expected.disposition) && item.expected.actions.every((action) => contract.actions.includes(action)), `${test.id}: unknown expected value`);
    const observed = independentStep(machine, item.event, item.facts);
    refuse(JSON.stringify(observed) === JSON.stringify(item.expected), `${test.id}/${item.event}: independent state disposition mismatch`);
  }
  refuse(machine.state === test.final.state && machine.durable === test.final.durable, `${test.id}: independent final state mismatch`);
}

const retainedMatrix = await json("evidence/2026-08-13/state-matrix.json");
refuse(retainedMatrix.status === "PASSED" && retainedMatrix.cases.length === vectors.cases.length && JSON.stringify(retainedMatrix.cases.map(({ id }) => id)) === JSON.stringify(ids), "retained state matrix mismatch");

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
const archive = await json(archivePath);
refuse(archive.manifestSelfExcluded === true && archive.identity === profile.identity, "archive identity mismatch");
const actual = (await walk(root)).map((path) => relative(root, path)).filter((path) => path !== archivePath).sort();
const declared = archive.retainedFiles.map(({ path }) => path);
refuse(JSON.stringify(actual) === JSON.stringify(declared), "archive inventory mismatch");
for (const entry of archive.retainedFiles) {
  const path = join(root, entry.path);
  const bytes = await readFile(path);
  const metadata = await stat(path);
  refuse(bytes.length === entry.bytes && sha256(bytes) === entry.sha256, `${entry.path}: archive identity mismatch`);
  refuse((metadata.mode & 0o777).toString(8).padStart(4, "0") === entry.mode, `${entry.path}: archive mode mismatch`);
}

console.log(JSON.stringify({ result: "PASSED", scopedController: "PASSED", completeExecutableSuccessor: "BLOCKED", controlledExecution: "BLOCKED", vectors: vectors.cases.length, imports: 0, retainedFiles: declared.length, effects: "NONE" }));
