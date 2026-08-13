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

function macho(bytes, label) {
  refuse(bytes.readUInt32LE(0) === 0xfeedfacf, `${label}: Mach-O 64 magic mismatch`);
  refuse(bytes.readUInt32LE(4) === 0x0100000c, `${label}: arm64 CPU mismatch`);
  const fileType = bytes.readUInt32LE(12);
  const commands = bytes.readUInt32LE(16);
  const result = { fileType, installName: null, dependencies: [], minos: null, sdk: null, codeSignature: false, symbols: [] };
  let symtab = null;
  let offset = 32;
  for (let index = 0; index < commands; index += 1) {
    const command = bytes.readUInt32LE(offset);
    const size = bytes.readUInt32LE(offset + 4);
    refuse(size >= 8 && offset + size <= bytes.length, `${label}: load command bounds`);
    if (command === 0x0d || command === 0x0c) {
      const nameOffset = bytes.readUInt32LE(offset + 8);
      refuse(nameOffset >= 24 && nameOffset < size, `${label}: dylib name bounds`);
      const end = bytes.indexOf(0, offset + nameOffset);
      refuse(end >= 0 && end < offset + size, `${label}: dylib name terminator`);
      const name = bytes.subarray(offset + nameOffset, end).toString();
      if (command === 0x0d) result.installName = name;
      else result.dependencies.push(name);
    } else if (command === 0x32) {
      const version = (value) => `${value >>> 16}.${(value >>> 8) & 255}.${value & 255}`.replace(/\.0$/, "");
      result.minos = version(bytes.readUInt32LE(offset + 12));
      result.sdk = version(bytes.readUInt32LE(offset + 16));
    } else if (command === 0x1d) {
      result.codeSignature = true;
    } else if (command === 0x02) {
      symtab = {
        symoff: bytes.readUInt32LE(offset + 8),
        nsyms: bytes.readUInt32LE(offset + 12),
        stroff: bytes.readUInt32LE(offset + 16),
        strsize: bytes.readUInt32LE(offset + 20),
      };
    }
    offset += size;
  }
  refuse(offset <= bytes.length && symtab !== null, `${label}: missing bounded symbol table`);
  refuse(symtab.symoff + symtab.nsyms * 16 <= bytes.length && symtab.stroff + symtab.strsize <= bytes.length, `${label}: symbol table bounds`);
  for (let index = 0; index < symtab.nsyms; index += 1) {
    const entry = symtab.symoff + index * 16;
    const stringIndex = bytes.readUInt32LE(entry);
    refuse(stringIndex < symtab.strsize, `${label}: symbol string index`);
    const end = bytes.indexOf(0, symtab.stroff + stringIndex);
    refuse(end >= 0 && end < symtab.stroff + symtab.strsize, `${label}: symbol terminator`);
    result.symbols.push({
      name: bytes.subarray(symtab.stroff + stringIndex, end).toString(),
      type: bytes[entry + 4],
    });
  }
  result.dependencies.sort();
  return result;
}

const expectedInputs = {
  "materialized-profile.json": [10301, "198688bacd50aaee4f57b4cd7c56cea6b939c10aa220fbbeba7d315de820d1fd"],
  "libkrun.h": [54658, "dce44d1d70ab770b1089e57646e025281a4137fe5052b9dd8eaefb80c01a1bd8"],
  "libkrun-abi-audit.c": [2512, "419256ea91de9b5e5323e1f1d6d42afb0a5fa85a8835d0d0404734af0ee92356"],
  "libkrun.1.dylib": [4393448, "055d9d18dc964fec4aba21948c4a344cb7a51cb48a2c70017484b718eae12f9f"],
  "capsule-host-runner.c": [7917, "5a5560fa667390253bf504d7c045fcbcc304fa5829b22a8acf1fff00a8e37eb9"],
  "capsule-host-runner": [100488, "a30e3f7cba5f480b6e164536854749b5e1ba3349f20af6c9c8e5d2590bffe1ad"],
};
for (const [name, [size, digest]] of Object.entries(expectedInputs)) {
  const bytes = await readFile(join(root, "inputs/c2b-v4", name));
  refuse(bytes.length === size && sha256(bytes) === digest, `${name}: source identity mismatch`);
}
const expectedEvidence = {
  "artifact-closure-report.json": [3671, "6a082be63bb15f96e19f5c11673717e546d4fd8ef602d19d1f2b5036daac573d"],
  "libkrunfw-macho.txt": [3014, "16bc3f79c7a4312498d2584a87360af3078d1c2aeac31a5c85d088c1b27621b9"],
  "kernel-extraction.txt": [65, "71ba5da8883f302a062d1bd1147e9e3bae75c2f2aea639ef180a25aa679f80be"],
};
for (const [name, [size, digest]] of Object.entries(expectedEvidence)) {
  const bytes = await readFile(join(root, "inputs/c2b-artifact-closure", name));
  refuse(bytes.length === size && sha256(bytes) === digest, `${name}: historical evidence identity mismatch`);
}

const profile = await json("manifests/input-closure.json");
refuse(profile.objectType === "capsule.c5b2.governed-input-closure" && profile.objectVersion === 1, "profile identity mismatch");
refuse(profile.repositoryBaseline === "ee00ae2abbce64ae6458b82d0b53d904ee39aeb6", "repository baseline mismatch");
refuse(profile.capsuleSource.commit === "e5401a81b727915ec01afe9012a77e7586a57c13", "Capsule source mismatch");
refuse(profile.scopedInputClosureStatus === "PASSED", "scoped status mismatch");
refuse(profile.completeExecutableSuccessorStatus === "BLOCKED" && profile.controlledExecutionStatus === "BLOCKED" && profile.runtimeProfileAdmission === "BLOCKED", "parent status mismatch");
refuse(profile.predecessor.mergeCommit === "db08ebf277432e06d6cba3b7f7338e3bd4a61252" && !profile.predecessor.hardStopControllerReused, "predecessor mismatch");
refuse(profile.governedSources.libkrun.acceptedCommit === "7432eda5a49220976b0167005aa43ee622f9d632", "governed libkrun source mismatch");
for (const [name, [size, digest]] of Object.entries(expectedInputs)) {
  const retained = profile.boundAvailableInputs[name];
  refuse(retained?.path === `inputs/c2b-v4/${name}` && retained.bytes === size && retained.sha256 === digest, `${name}: profile binding mismatch`);
}
for (const [name, [size, digest]] of Object.entries(expectedEvidence)) {
  const key = name === "artifact-closure-report.json" ? "artifactClosureReport" : name === "libkrunfw-macho.txt" ? "libkrunfwMachO" : "kernelExtraction";
  const retained = profile.retainedIdentityOnlyEvidence[key];
  refuse(retained?.path === `inputs/c2b-artifact-closure/${name}` && retained.bytes === size && retained.sha256 === digest, `${name}: profile evidence binding mismatch`);
}
refuse(profile.governedArtifactClosure.libkrun.bindingStatus === "BOUND" && profile.governedArtifactClosure.libkrun.loaded === false, "libkrun binding mismatch");
refuse(profile.governedArtifactClosure.denoCoreExecutable.retainedBytesAvailable === false && profile.governedArtifactClosure.denoCoreExecutable.bindingStatus === "BLOCKED", "runtime blocker mismatch");
refuse(profile.governedArtifactClosure.libkrunfw.retainedBytesAvailable === false && profile.governedArtifactClosure.libkrunfw.bindingStatus === "BLOCKED", "libkrunfw blocker mismatch");
refuse(profile.governedArtifactClosure.kernel.bindingStatus === "EVIDENCE_ONLY", "kernel role mismatch");
refuse(profile.governedArtifactClosure.separateFirmware.bindingStatus === "INAPPLICABLE", "firmware role mismatch");
refuse(profile.governedArtifactClosure.denoCoreExecutable.expectedBytes === 68496520 && profile.governedArtifactClosure.denoCoreExecutable.expectedSha256 === "e781a90236cdf1272a9a16189c6be033164fa25a5aa9e52376ef998982ec0a77", "runtime retained identity mismatch");
refuse(profile.governedArtifactClosure.libkrunfw.expectedBytes === 24339104 && profile.governedArtifactClosure.libkrunfw.expectedSha256 === "0b14f4b8005dafd33c38df5935b9efdb6381c724224b3967ba1cecbecf10b6e9", "libkrunfw retained identity mismatch");
refuse(profile.governedArtifactClosure.kernel.expectedBytes === 24117248 && profile.governedArtifactClosure.kernel.expectedSha256 === "b50a4165215d5d897ab3614606a2105756cf8f2b2510cbceda9dc06057a5622d", "kernel retained identity mismatch");
const controller = profile.governedArtifactClosure.controlledTestController;
refuse(controller.bindingStatus === "BLOCKED" && controller.path === null && controller.bytes === null && controller.sha256 === null, "controller must remain explicitly unbound");
refuse(profile.composition.compositeManifest === null && profile.composition.runtimeRoot === null && profile.composition.controller === null && profile.composition.executable === false, "composition must remain unbound");
refuse(Object.values(profile.effects).every((value) => value === false), "effect boundary mismatch");

const sourceProfile = await json("inputs/c2b-v4/materialized-profile.json");
refuse(sourceProfile.libkrunBuild.retainedArtifact.sha256 === profile.governedArtifactClosure.libkrun.artifact.sha256, "libkrun source-profile binding mismatch");
refuse(sourceProfile.composedProfile.runtime.sha256 === profile.governedArtifactClosure.denoCoreExecutable.expectedSha256, "runtime identity mismatch");
refuse(sourceProfile.bootRole.libkrunfw.sha256 === profile.governedArtifactClosure.libkrunfw.expectedSha256, "libkrunfw identity mismatch");
refuse(sourceProfile.bootRole.kernel.sha256 === profile.governedArtifactClosure.kernel.expectedSha256, "kernel identity mismatch");
refuse(sourceProfile.bootRole.separateFirmware === "inapplicable-no-path-authority", "source firmware role mismatch");
const historicalClosure = await json("inputs/c2b-artifact-closure/artifact-closure-report.json");
const historicalByRole = Object.fromEntries(historicalClosure.constructedFinalIdentities.map((entry) => [entry.role, entry]));
refuse(historicalByRole["libkrunfw-dylib"].sha256 === profile.governedArtifactClosure.libkrunfw.expectedSha256, "historical libkrunfw identity mismatch");
refuse(historicalByRole["guest-kernel"].sha256 === profile.governedArtifactClosure.kernel.expectedSha256, "historical kernel identity mismatch");
const libkrunfwMachO = await readFile(join(root, "inputs/c2b-artifact-closure/libkrunfw-macho.txt"), "utf8");
refuse(libkrunfwMachO.includes("name libkrunfw.5.dylib") && libkrunfwMachO.includes("minos 14.0") && libkrunfwMachO.includes("sdk 26.5") && libkrunfwMachO.includes("cmd LC_CODE_SIGNATURE"), "historical libkrunfw static evidence mismatch");
const kernelExtraction = await readFile(join(root, "inputs/c2b-artifact-closure/kernel-extraction.txt"), "utf8");
refuse(kernelExtraction === "kernelLoad=0x80000000\nkernelEntry=0x80000000\nkernelSize=24117248\n", "historical kernel extraction evidence mismatch");

const lib = macho(await readFile(join(root, "inputs/c2b-v4/libkrun.1.dylib")), "libkrun");
refuse(lib.fileType === 6 && lib.installName === "libkrun.1.dylib", "libkrun Mach-O role mismatch");
refuse(lib.minos === "11.0" && lib.sdk === "26.5", "libkrun platform mismatch");
refuse(!lib.codeSignature, "libkrun must remain unsigned");
refuse(JSON.stringify(lib.dependencies) === JSON.stringify([
  "/System/Library/Frameworks/Hypervisor.framework/Versions/A/Hypervisor",
  "/usr/lib/libSystem.B.dylib",
  "/usr/lib/libiconv.2.dylib",
].sort()), "libkrun dependency closure mismatch");
const exports = lib.symbols.filter(({ name, type }) => name.startsWith("_krun_") && (type & 1) === 1 && (type & 0x0e) !== 0).map(({ name }) => name).sort();
const requiredExports = sourceProfile.abiReview.reviewedExports.map((name) => `_${name}`).sort();
for (const name of requiredExports) refuse(exports.includes(name), `libkrun missing reviewed export ${name}`);

const runner = macho(await readFile(join(root, "inputs/c2b-v4/capsule-host-runner")), "runner");
refuse(runner.fileType === 2 && runner.minos === "14.0" && runner.sdk === "26.5", "runner Mach-O role mismatch");
refuse(!runner.codeSignature, "runner must remain unsigned");
refuse(JSON.stringify(runner.dependencies) === JSON.stringify(["/usr/lib/libSystem.B.dylib", "@rpath/libkrun.1.dylib"].sort()), "runner dependency closure mismatch");
const runnerKrunImports = runner.symbols.filter(({ name, type }) => name.startsWith("_krun_") && (type & 0x0e) === 0).map(({ name }) => name).sort();
const expectedRunnerImports = [
  "krun_add_console_port_inout", "krun_add_read_only_raw_root_fd", "krun_add_virtio_console_multiport",
  "krun_create_ctx", "krun_disable_implicit_console", "krun_disable_implicit_init",
  "krun_disable_implicit_vsock", "krun_set_exec", "krun_set_kernel_console",
  "krun_set_root_disk_remount", "krun_set_vm_config", "krun_set_workdir", "krun_start_enter",
].map((name) => `_${name}`).sort();
refuse(JSON.stringify(runnerKrunImports) === JSON.stringify(expectedRunnerImports), "runner libkrun import closure mismatch");

const inspection = await json("evidence/2026-08-12/macho-inspection.json");
refuse(inspection.status === "PASSED" && !inspection.loaded && !inspection.executed && inspection.abiSyntaxOnly === "PASSED", "inspection effect/status mismatch");
refuse(JSON.stringify(inspection.libkrunExports) === JSON.stringify(exports), "independent libkrun export readbacks disagree");
refuse(JSON.stringify(inspection.runnerUndefinedKrunSymbols) === JSON.stringify(runnerKrunImports), "independent runner import readbacks disagree");
const inspectionDependencyNames = (entries) => entries.map((entry) => entry.split(" (compatibility version")[0]).sort();
refuse(JSON.stringify(inspectionDependencyNames(inspection.libkrunDependencies).filter((name) => name !== lib.installName)) === JSON.stringify(lib.dependencies), "independent libkrun dependency readbacks disagree");
refuse(JSON.stringify(inspectionDependencyNames(inspection.runnerDependencies)) === JSON.stringify(runner.dependencies), "independent runner dependency readbacks disagree");
refuse(inspection.file.libkrun === "Mach-O 64-bit dynamically linked shared library arm64" && inspection.file.runner === "Mach-O 64-bit executable arm64", "independent file-format readback mismatch");

const c5b1 = await readFile(join(root, "inputs/c5b1/artifact-profile.json"));
refuse(c5b1.length === profile.predecessor.artifactProfile.bytes && sha256(c5b1) === profile.predecessor.artifactProfile.sha256, "C5b1 predecessor identity mismatch");

async function walk(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(child)));
    else result.push(child);
  }
  return result;
}
const archivePath = "manifests/archive-manifest.json";
const archive = await json(archivePath);
refuse(archive.manifestSelfExcluded === true, "manifest self-exclusion mismatch");
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

console.log(JSON.stringify({ result: "PASSED", scopedInputClosure: "PASSED", completeExecutableSuccessor: "BLOCKED", controlledExecution: "BLOCKED", boundInputs: Object.keys(expectedInputs).length, retainedFiles: declared.length, effects: "NONE" }));
