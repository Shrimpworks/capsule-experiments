#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const refuse = (condition, message) => { if (!condition) throw new Error(message); };
const json = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const exactKeys = (value, keys, label) => refuse(JSON.stringify(Object.keys(value)) === JSON.stringify(keys), `${label}: closed keys mismatch`);

const expectedInputs = new Map([
  ["inputs/c5b3/controller-contract.json", [4185, "36285d7fa3f27a992fda413afb38c1ed05a3af30f496c5784b2165d5b2f90e59"]],
  ["inputs/c5b3/controller_core.h", [4413, "0ae153a47d5a2d0cdfbae7e149139b72abbd35f7f1223dd5745f03df86cadd12"]],
  ["inputs/c5b2/libkrun.h", [54658, "dce44d1d70ab770b1089e57646e025281a4137fe5052b9dd8eaefb80c01a1bd8"]],
  ["inputs/c5b2/macho-inspection.json", [3192, "e86810b067d7eb04d91e4a1a99eeda908891dba2970cb3aa1e68f202fe512b28"]],
  ["inputs/c5b4/recovery.json", [5786, "814eef24d1583b49ecf773043d142b6c7d77fb00a304dc964be7360b427b9cb4"]],
  ["inputs/c5b4/macho-inspection.json", [521, "5389836bb8a99a4159c54a6634bf33152f52969d4200ed51b965d7da616a0c7f"]],
]);
for (const [path, [length, digest]] of expectedInputs) {
  const bytes = await readFile(join(root, path));
  refuse(bytes.length === length && sha256(bytes) === digest, `${path}: immutable input mismatch`);
}

const controller = await json("inputs/c5b3/controller-contract.json");
refuse(controller.objectType === "capsule.c5b3.controlled-test-controller-contract" && controller.scope === "pure-no-run-state-machine", "C5b3 controller input mismatch");
refuse(controller.futureAdapterBoundary.effectAdapterPresent === false && controller.futureAdapterBoundary.executionAuthorized === false, "C5b3 predecessor boundary mismatch");
const libkrunInspection = await json("inputs/c5b2/macho-inspection.json");
const requiredImports = [
  "_krun_add_console_port_inout", "_krun_add_read_only_raw_root_fd",
  "_krun_add_virtio_console_multiport", "_krun_create_ctx",
  "_krun_disable_implicit_console", "_krun_disable_implicit_init",
  "_krun_disable_implicit_vsock", "_krun_set_exec", "_krun_set_kernel_console",
  "_krun_set_root_disk_remount", "_krun_set_vm_config", "_krun_set_workdir",
  "_krun_start_enter",
].sort();
for (const symbol of requiredImports) refuse(libkrunInspection.libkrunExports.includes(symbol), `libkrun input lacks ${symbol}`);
refuse(libkrunInspection.loaded === false && libkrunInspection.executed === false, "libkrun predecessor effect mismatch");
const recovery = await json("inputs/c5b4/recovery.json");
refuse(recovery.retainedArtifact.bytes === 24339104 && recovery.retainedArtifact.sha256 === "0b14f4b8005dafd33c38df5935b9efdb6381c724224b3967ba1cecbecf10b6e9", "libkrunfw recovery identity mismatch");
refuse(recovery.canonicalDecision.role === "sole-runtime-boot-kernel-carrier" && recovery.canonicalDecision.separateFirmware === "INAPPLICABLE", "libkrunfw role mismatch");
refuse(Object.values(recovery.effects).every((value) => value === false), "libkrunfw recovery effect mismatch");

const contract = await json("contracts/effect-adapter-contract.json");
exactKeys(contract, ["objectType", "objectVersion", "identity", "scope", "authorityOwner", "inputController", "passiveTransport", "immutableProfile", "descriptorContract", "runnerCallPlan", "fixedStrings", "faultAndPublication", "effectBoundary"], "contract");
refuse(contract.objectType === "capsule.c5b5.no-run-effect-adapter-contract" && contract.objectVersion === 1 && contract.scope === "compile-only-action-translation", "adapter contract mismatch");
refuse(contract.authorityOwner === "Execution Supervisor" && contract.passiveTransport === "capsule.typed-guest-transport/v1", "adapter authority mismatch");
refuse(contract.descriptorContract.hostRunner.root === 4 && contract.descriptorContract.hostRunner.source === 5 && contract.descriptorContract.hostRunner.input === 6 && contract.descriptorContract.hostRunner.completion === 7 && contract.descriptorContract.hostRunner.closeFromInclusive === 8, "host FD closure mismatch");
refuse(contract.descriptorContract.launcher.source === 3 && contract.descriptorContract.launcher.input === 4 && contract.descriptorContract.launcher.completion === 5 && contract.descriptorContract.launcher.closeFromInclusive === 6 && !contract.descriptorContract.workloadCompletionEndpoint, "launcher FD closure mismatch");
refuse(contract.immutableProfile.sourcePhysicalMaximum === 262296 && contract.immutableProfile.inputPhysicalMaximum === 262296 && contract.immutableProfile.completionPhysicalMaximum === 262368 && contract.immutableProfile.completionRetentionBytes === 262369, "transport cap mismatch");
refuse(contract.faultAndPublication.completionLast && contract.faultAndPublication.teardownAbsenceCleanupRequired && contract.faultAndPublication.responseLossAfterCommit === "replay-stored", "completion/fault contract mismatch");
refuse(Object.entries(contract.effectBoundary).every(([key, value]) => key === "translatesOnly" ? value === true : value === false), "adapter effect boundary mismatch");

const profile = await json("manifests/adapter-profile.json");
refuse(profile.repositoryBaseline === "5a2f835e8c9df8279237f940f5af757e119593bd" && profile.prerequisites.c5b3.commit === "d3020c660c98efebe45f213ed1591220c70c180f" && profile.prerequisites.c5b4.commit === "ea2aa55130fb105c6b283cf24454c1efbf5b9680", "immutable provenance mismatch");
refuse(profile.scopedConstructionStatus === "PASSED" && profile.completeCompositionStatus === "BLOCKED" && profile.controlledExecutionStatus === "BLOCKED" && profile.productAdmission === "BLOCKED", "status boundary mismatch");
refuse(Object.values(profile.absentPrerequisites).every((value) => value === true), "missing prerequisite boundary mismatch");
refuse(Object.values(profile.effects).every((value) => value === false), "profile effects must remain false");
for (const role of ["source", "header", "buildA", "buildB"]) {
  const entry = profile.adapter[role];
  const bytes = await readFile(join(root, entry.path));
  refuse(bytes.length === entry.bytes && sha256(bytes) === entry.sha256, `${role}: adapter identity mismatch`);
}
refuse(profile.adapter.buildA.sha256 === profile.adapter.buildB.sha256 && profile.adapter.byteEqual && profile.adapter.deterministicBuilds === 2, "deterministic adapter mismatch");
refuse(profile.adapter.format === "Mach-O arm64 MH_OBJECT" && !profile.adapter.entryPoint && !profile.adapter.linked && !profile.adapter.loaded && !profile.adapter.executed, "adapter artifact boundary mismatch");

function inspectObject(bytes, label) {
  refuse(bytes.readUInt32LE(0) === 0xfeedfacf && bytes.readUInt32LE(4) === 0x0100000c, `${label}: Mach-O arm64 mismatch`);
  refuse(bytes.readUInt32LE(12) === 1, `${label}: not MH_OBJECT`);
  const commandCount = bytes.readUInt32LE(16);
  let offset = 32;
  let symtab = null;
  const forbiddenCommands = new Set([0x0c, 0x0d, 0x18, 0x1b, 0x1d, 0x28, 0x80000028, 0x8000001c, 0x80000022]);
  for (let index = 0; index < commandCount; index += 1) {
    const command = bytes.readUInt32LE(offset);
    const size = bytes.readUInt32LE(offset + 4);
    refuse(size >= 8 && offset + size <= bytes.length, `${label}: load command bounds`);
    refuse(!forbiddenCommands.has(command), `${label}: executable/load/signature command forbidden`);
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
    const nType = bytes[entry + 4];
    const type = nType & 0x0e;
    const external = (nType & 0x01) !== 0;
    if (external && type === 0) undefinedSymbols.push(name);
    if (external && type !== 0 && name.startsWith("_c5b5_")) defined.push(name);
  }
  refuse(JSON.stringify(undefinedSymbols.sort()) === JSON.stringify(requiredImports), `${label}: exact undefined-symbol closure mismatch`);
  refuse(JSON.stringify(defined.sort()) === JSON.stringify(["_c5b5_translate_controller_actions", "_c5b5_validate_immutable_profile"]), `${label}: exact exported-symbol closure mismatch`);
}
inspectObject(await readFile(join(root, profile.adapter.buildA.path)), "adapter A");
inspectObject(await readFile(join(root, profile.adapter.buildB.path)), "adapter B");

const source = await readFile(join(root, profile.adapter.source.path), "utf8");
for (const symbol of requiredImports.map((value) => value.slice(1))) refuse(source.includes(symbol), `adapter source lacks ${symbol}`);
for (const required of ["C5B3_ACTION_REQUEST_TEARDOWN", "C5B3_ACTION_PROVE_ABSENCE", "C5B3_ACTION_REMOVE_FIXED_ROOT", "C5B3_ACTION_REQUEST_DURABLE_COMMIT", "C5B3_ACTION_REPLAY_STORED", "C5B3_ACTION_FENCE_STORE", "completion_retention_bytes"]) refuse(source.includes(required), `adapter source lacks ${required}`);
for (const forbidden of ["dlopen(", "dlsym(", "fork(", "posix_spawn", "execve(", "system(", "popen(", "socket(", "connect(", "int main("]) refuse(!source.includes(forbidden), `adapter source contains forbidden effect ${forbidden}`);

const vectors = await json("fixtures/action-vectors.json");
refuse(vectors.objectType === "capsule.c5b5.effect-adapter-vectors" && vectors.objectVersion === 1 && vectors.cases.length === 15, "vector inventory mismatch");
const runner = ["KRUN_CREATE_CTX", "KRUN_SET_VM_CONFIG", "KRUN_DISABLE_IMPLICIT_CONSOLE", "KRUN_DISABLE_IMPLICIT_INIT", "KRUN_DISABLE_IMPLICIT_VSOCK", "KRUN_ADD_READ_ONLY_RAW_ROOT_FD", "KRUN_SET_ROOT_DISK_REMOUNT", "KRUN_ADD_VIRTIO_CONSOLE_MULTIPORT", "KRUN_ADD_SOURCE_PORT", "KRUN_ADD_INPUT_PORT", "KRUN_ADD_COMPLETION_PORT", "KRUN_SET_KERNEL_CONSOLE", "KRUN_SET_WORKDIR", "KRUN_SET_EXEC", "WRITE_READY", "REQUIRE_START_BYTE", "KRUN_START_ENTER"];
const independentRows = [[1, ["CREATE_ENDPOINTS"]], [2, ["START_DRAINS"]], [4, runner], [8, ["WRITE_SOURCE"]], [16, ["WRITE_INPUT"]], [32, ["CLOSE_INPUT_WRITERS"]], [64, ["ALLOW_CHILD"]], [128, ["REQUEST_TEARDOWN"]], [256, ["PROVE_ABSENCE"]], [512, ["REMOVE_FIXED_ROOT"]], [1024, ["REQUEST_DURABLE_COMMIT"]], [2048, ["DELIVER_STORED"]], [4096, ["REPLAY_STORED"]], [8192, ["FENCE_STORE"]], [16384, ["STOP_MISMATCH"]]];
for (const test of vectors.cases) {
  let refusal = null;
  let effects = [];
  if (test.profile === "absent") refusal = "PROFILE_ABSENT";
  else if (test.profile === "mismatch") refusal = "PROFILE_MISMATCH";
  else if ((test.mask & ~32767) !== 0) refusal = "ACTION_UNKNOWN";
  else effects = independentRows.flatMap(([bit, row]) => (test.mask & bit) !== 0 ? row : []);
  refuse(refusal === test.refusal && JSON.stringify(effects) === JSON.stringify(test.effects), `${test.id}: independent model mismatch`);
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
const archive = await json(archivePath);
refuse(archive.manifestSelfExcluded === true && archive.identity === contract.identity, "archive identity mismatch");
const actual = (await walk(root)).map((path) => relative(root, path)).filter((path) => path !== archivePath).sort();
const declared = archive.retainedFiles.map(({ path }) => path);
refuse(JSON.stringify(actual) === JSON.stringify(declared), "archive inventory mismatch");
for (const entry of archive.retainedFiles) {
  const bytes = await readFile(join(root, entry.path));
  const metadata = await stat(join(root, entry.path));
  refuse(bytes.length === entry.bytes && sha256(bytes) === entry.sha256, `${entry.path}: archive identity mismatch`);
  refuse((metadata.mode & 0o777).toString(8).padStart(4, "0") === entry.mode, `${entry.path}: archive mode mismatch`);
}

console.log(JSON.stringify({ result: "PASSED", scopedConstruction: "PASSED", completeComposition: "BLOCKED", controlledExecution: "BLOCKED", vectors: vectors.cases.length, imports: requiredImports.length, exports: 2, retainedFiles: declared.length, effects: "NONE" }));
