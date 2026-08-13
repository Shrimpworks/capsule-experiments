#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(process.argv[2] ?? defaultRoot);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const refuse = (condition, message) => { if (!condition) throw new Error(message); };
const json = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));

const expected = {
  archive: [19709993, "5bfae6efee63dbdf04a8fac2a69d772d9f900af2f54c4429b4acdfd6d86b9979"],
  artifact: [24339104, "0b14f4b8005dafd33c38df5935b9efdb6381c724224b3967ba1cecbecf10b6e9"],
  sources: {
    "LICENSE-GPL-2.0-only": [18729, "f6b78c087c3ebdf0f3c13415070dd480a3f35d8fc76f3d02180a407c1c812f79"],
    "LICENSE-LGPL-2.1-only": [26530, "dc626520dcd53a22f727af3ee42c770e56c97a64fe3adb063799d8ab032fe551"],
    Makefile: [5169, "81bc05513f0da06b917870ab8d51e00d0b93eff390f4bfbfa1d1c3ae041d0bcc"],
    "bin2cbundle.py": [4878, "fa11e5b49e10d469eebd7b6e4ec4d2f5529337f12b9b50c988683b665778f6d6"],
    "kernel.c": [93814877, "96561a4e5dccec0364a28ac32c5668e13e31180d083f412c9f8be7599380c70d"],
  },
};

async function exact(path, [size, digest], message) {
  const bytes = await readFile(join(root, path));
  refuse(bytes.length === size && sha256(bytes) === digest, message);
  return bytes;
}

const archive = await exact("inputs/libkrunfw-prebuilt-aarch64.tgz", expected.archive, "official archive identity mismatch");
const artifact = await exact("artifacts/libkrunfw.5.dylib", expected.artifact, "retained artifact identity mismatch");
for (const [name, identity] of Object.entries(expected.sources)) await exact(`sources/${name}`, identity, `${name}: retained source identity mismatch`);

const expectedMembers = [
  "libkrunfw/",
  "libkrunfw/LICENSE-GPL-2.0-only",
  "libkrunfw/LICENSE-LGPL-2.1-only",
  "libkrunfw/bin2cbundle.py",
  "libkrunfw/Makefile",
  "libkrunfw/kernel.c",
];
const archivePath = join(root, "inputs/libkrunfw-prebuilt-aarch64.tgz");
const members = execFileSync("/usr/bin/tar", ["-tzf", archivePath], { encoding: "utf8" }).trimEnd().split("\n").sort();
refuse(JSON.stringify(members) === JSON.stringify(expectedMembers.sort()), "archive member inventory mismatch");
for (const member of members) {
  refuse(!member.startsWith("/") && !/(^|\/)\.\.?($|\/)/.test(member), `unsafe archive member: ${member}`);
}
for (const name of Object.keys(expected.sources)) {
  const archived = execFileSync("/usr/bin/tar", ["-xOzf", archivePath, `libkrunfw/${name}`], { maxBuffer: 110_000_000 });
  const retained = await readFile(join(root, `sources/${name}`));
  refuse(archived.equals(retained), `${name}: archive-to-retained source mismatch`);
}

function version(value) {
  return `${value >>> 16}.${(value >>> 8) & 255}.${value & 255}`.replace(/\.0$/, "");
}

function macho(bytes) {
  refuse(bytes.readUInt32LE(0) === 0xfeedfacf, "Mach-O magic mismatch");
  refuse(bytes.readUInt32LE(4) === 0x0100000c, "Mach-O architecture mismatch");
  refuse(bytes.readUInt32LE(12) === 6, "Mach-O file role mismatch");
  const count = bytes.readUInt32LE(16);
  let offset = 32;
  let installName = null;
  let minos = null;
  let sdk = null;
  let uuid = null;
  let codeSignature = false;
  let symtab = null;
  const dependencies = [];
  for (let index = 0; index < count; index += 1) {
    const command = bytes.readUInt32LE(offset);
    const size = bytes.readUInt32LE(offset + 4);
    refuse(size >= 8 && offset + size <= bytes.length, "Mach-O load command bounds");
    if (command === 0x0d || command === 0x0c) {
      const nameOffset = bytes.readUInt32LE(offset + 8);
      refuse(nameOffset >= 24 && nameOffset < size, "Mach-O dylib name bounds");
      const end = bytes.indexOf(0, offset + nameOffset);
      refuse(end >= 0 && end < offset + size, "Mach-O dylib name terminator");
      const name = bytes.subarray(offset + nameOffset, end).toString();
      if (command === 0x0d) installName = name;
      else dependencies.push(name);
    } else if (command === 0x32) {
      minos = version(bytes.readUInt32LE(offset + 12));
      sdk = version(bytes.readUInt32LE(offset + 16));
    } else if (command === 0x1b) {
      uuid = [...bytes.subarray(offset + 8, offset + 24)].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
    } else if (command === 0x1d) {
      codeSignature = true;
    } else if (command === 0x02) {
      symtab = { symoff: bytes.readUInt32LE(offset + 8), nsyms: bytes.readUInt32LE(offset + 12), stroff: bytes.readUInt32LE(offset + 16), strsize: bytes.readUInt32LE(offset + 20) };
    }
    offset += size;
  }
  refuse(symtab !== null && symtab.symoff + symtab.nsyms * 16 <= bytes.length && symtab.stroff + symtab.strsize <= bytes.length, "Mach-O symbol table bounds");
  const exports = [];
  for (let index = 0; index < symtab.nsyms; index += 1) {
    const entry = symtab.symoff + index * 16;
    const stringIndex = bytes.readUInt32LE(entry);
    refuse(stringIndex < symtab.strsize, "Mach-O symbol string index");
    const end = bytes.indexOf(0, symtab.stroff + stringIndex);
    refuse(end >= 0 && end < symtab.stroff + symtab.strsize, "Mach-O symbol terminator");
    const name = bytes.subarray(symtab.stroff + stringIndex, end).toString();
    if ((bytes[entry + 4] & 1) === 1 && (bytes[entry + 4] & 0x0e) !== 0) exports.push(name);
  }
  return { installName, minos, sdk, uuid, codeSignature, dependencies: dependencies.sort(), exports: exports.sort() };
}

const parsed = macho(artifact);
refuse(parsed.installName === "libkrunfw.5.dylib", "Mach-O install name mismatch");
refuse(parsed.minos === "14.0" && parsed.sdk === "26.5", "Mach-O platform mismatch");
refuse(parsed.uuid === "6D70E4BD197732C890914B99162A9C5F", "Mach-O UUID mismatch");
refuse(parsed.codeSignature, "Mach-O embedded code signature missing");
refuse(JSON.stringify(parsed.dependencies) === JSON.stringify(["/usr/lib/libSystem.B.dylib"]), "Mach-O dependency closure mismatch");
refuse(JSON.stringify(parsed.exports) === JSON.stringify(["_KERNEL_BUNDLE", "_krunfw_get_kernel", "_krunfw_get_version"]), "Mach-O export closure mismatch");

const systemFile = execFileSync("/usr/bin/file", [join(root, "artifacts/libkrunfw.5.dylib")], { encoding: "utf8" });
const systemLoads = execFileSync("/usr/bin/otool", ["-L", join(root, "artifacts/libkrunfw.5.dylib")], { encoding: "utf8" });
const systemSymbols = execFileSync("/usr/bin/nm", ["-gjU", join(root, "artifacts/libkrunfw.5.dylib")], { encoding: "utf8" });
refuse(systemFile.includes("Mach-O 64-bit dynamically linked shared library arm64"), "system file readback mismatch");
refuse(systemLoads.includes("libkrunfw.5.dylib") && systemLoads.includes("/usr/lib/libSystem.B.dylib"), "system load-command readback mismatch");
for (const name of parsed.exports) refuse(systemSymbols.split("\n").includes(name), `system export readback missing ${name}`);

const recovery = await json("manifests/recovery.json");
refuse(recovery.objectType === "capsule.c5b4.libkrunfw-deterministic-recovery" && recovery.objectVersion === 1, "recovery identity mismatch");
refuse(recovery.repositoryBaseline === "5a2f835e8c9df8279237f940f5af757e119593bd", "repository baseline mismatch");
refuse(recovery.scopedRecoveryStatus === "PASSED", "scoped status mismatch");
refuse(recovery.completeExecutableSuccessorStatus === "BLOCKED" && recovery.controlledExecutionStatus === "BLOCKED" && recovery.runtimeProfileAdmission === "BLOCKED", "parent status mismatch");
refuse(recovery.upstream.releaseAssetId === 441852825 && recovery.upstream.archive.bytes === expected.archive[0] && recovery.upstream.archive.sha256 === expected.archive[1], "upstream archive binding mismatch");
refuse(recovery.build.stages === 2 && recovery.build.freshStages && recovery.build.sandboxApplied && recovery.build.cleanEnvironment && recovery.build.byteComparison === "IDENTICAL" && recovery.build.expectedHistoricalIdentityMatched, "build comparison mismatch");
refuse(recovery.retainedArtifact.bytes === expected.artifact[0] && recovery.retainedArtifact.sha256 === expected.artifact[1], "retained output binding mismatch");
refuse(recovery.canonicalDecision.role === "sole-runtime-boot-kernel-carrier" && recovery.canonicalDecision.extractedKernelRole === "derived-evidence-only-not-separate-runtime-input" && recovery.canonicalDecision.separateFirmware === "INAPPLICABLE", "boot-role decision mismatch");
refuse(recovery.sourceAvailability.generatedKernelBundleSourceRetained && !recovery.sourceAvailability.preferredFormKernelSourceComplete && recovery.sourceAvailability.distributionSourceComplianceStatus === "BLOCKED", "source-availability boundary mismatch");
refuse(Object.values(recovery.effects).every((value) => value === false), "effect boundary mismatch");

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
const manifest = await json(manifestPath);
refuse(manifest.manifestSelfExcluded === true, "manifest self-exclusion mismatch");
const actual = (await walk(root)).map((path) => relative(root, path)).filter((path) => path !== manifestPath).sort();
const declared = manifest.retainedFiles.map(({ path }) => path);
refuse(JSON.stringify(actual) === JSON.stringify(declared), "archive inventory mismatch");
for (const entry of manifest.retainedFiles) {
  const bytes = await readFile(join(root, entry.path));
  const metadata = await stat(join(root, entry.path));
  refuse(bytes.length === entry.bytes && sha256(bytes) === entry.sha256, `${entry.path}: archive identity mismatch`);
  refuse((metadata.mode & 0o777).toString(8).padStart(4, "0") === entry.mode, `${entry.path}: archive mode mismatch`);
}

console.log(JSON.stringify({ result: "PASSED", scopedRecovery: "PASSED", completeExecutableSuccessor: "BLOCKED", controlledExecution: "BLOCKED", retainedFiles: declared.length, effects: "NONE" }));
