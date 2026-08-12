#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(process.argv[2] ?? defaultRoot);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const refuse = (condition, message) => { if (!condition) throw new Error(message); };
const json = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));

const profile = await json("manifests/artifact-profile.json");
refuse(profile.objectType === "capsule.c5b1.executable-successor-construction", "profile type mismatch");
refuse(profile.scopedConstructionStatus === "PASSED", "construction status mismatch");
refuse(profile.completeExecutableSuccessorStatus === "BLOCKED" && profile.controlledExecutionStatus === "BLOCKED", "execution status must remain BLOCKED");
refuse(profile.repositoryBaseline === "067fe2beb40361bb714507cab1331004e0a656fa", "repository baseline mismatch");
refuse(profile.predecessor.mergeCommit === "b357d0c0fb29100c180494e67cebd7809aabe3c5" && !profile.predecessor.v19RawBytesRecovered && !profile.predecessor.v19IdentityReused, "predecessor boundary mismatch");
refuse(Object.values(profile.effects).every((value) => value === false), "effect boundary mismatch");

const artifacts = {};
for (const [role, expected] of Object.entries(profile.artifacts)) {
  const bytes = await readFile(join(root, expected.path));
  refuse(bytes.length === expected.bytes && sha256(bytes) === expected.sha256, `${role}: artifact identity mismatch`);
  artifacts[role] = bytes;
}

function verifyMachO(bytes, label) {
  refuse(bytes.readUInt32LE(0) === 0xfeedfacf && bytes.readUInt32LE(4) === 0x0100000c, `${label}: Mach-O arm64 mismatch`);
  const commands = bytes.readUInt32LE(16);
  let offset = 32;
  for (let index = 0; index < commands; index += 1) {
    const command = bytes.readUInt32LE(offset);
    const size = bytes.readUInt32LE(offset + 4);
    refuse(size >= 8 && offset + size <= bytes.length, `${label}: Mach-O load command bounds`);
    refuse(command !== 0x1b, `${label}: LC_UUID is forbidden`);
    refuse(command !== 0x1d, `${label}: LC_CODE_SIGNATURE is forbidden`);
    offset += size;
  }
}

function verifyElf(bytes, label) {
  refuse(bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])), `${label}: ELF magic mismatch`);
  refuse(bytes[4] === 2 && bytes[5] === 1 && bytes.readUInt16LE(16) === 2 && bytes.readUInt16LE(18) === 183, `${label}: static arm64 ELF mismatch`);
}

verifyMachO(artifacts.hostRunner, "host runner");
verifyMachO(artifacts.controller, "controller");
verifyElf(artifacts.trustedInit, "trusted init");
verifyElf(artifacts.trustedLauncher, "trusted launcher");
refuse(artifacts.hostRunner.includes(Buffer.from(profile.artifacts.rawRuntimeRoot.sha256)), "host runner root binding missing");
refuse(artifacts.controller.includes(Buffer.from("construction artifact only")), "controller hard-stop missing");

const rootImage = artifacts.rawRuntimeRoot;
const blockSize = 1024;
const sb = blockSize;
refuse(rootImage.length === 8388608 && rootImage.readUInt16LE(sb + 56) === 0xef53, "root superblock mismatch");
refuse(rootImage.readUInt32LE(sb + 92) === 0, "root journal feature must be disabled");
refuse(rootImage.readUInt32LE(sb + 96) === 0x42, "root feature mismatch");
refuse(rootImage.readUInt16LE(sb + 88) === 128, "root inode size mismatch");
const inodeTable = rootImage.readUInt32LE(blockSize * 2 + 8);

function inode(number) {
  const offset = inodeTable * blockSize + (number - 1) * 128;
  refuse(rootImage.readUInt16LE(offset + 40) === 0xf30a && rootImage.readUInt16LE(offset + 46) === 0, "root extent mismatch");
  return {
    mode: rootImage.readUInt16LE(offset),
    size: rootImage.readUInt32LE(offset + 4),
    blocks: rootImage.readUInt16LE(offset + 56),
    first: rootImage.readUInt32LE(offset + 60),
  };
}

function inodeBytes(number) {
  const node = inode(number);
  return rootImage.subarray(node.first * blockSize, node.first * blockSize + node.size);
}

function directory(number) {
  const bytes = inodeBytes(number);
  const entries = new Map();
  for (let offset = 0; offset < bytes.length;) {
    const ino = bytes.readUInt32LE(offset);
    const length = bytes.readUInt16LE(offset + 4);
    const nameLength = bytes[offset + 6];
    refuse(length >= 8 && offset + length <= bytes.length, "root directory bounds mismatch");
    if (ino !== 0) entries.set(bytes.subarray(offset + 8, offset + 8 + nameLength).toString(), ino);
    offset += length;
  }
  return entries;
}

function resolveRoot(path) {
  let current = 2;
  for (const part of path.split("/").filter(Boolean)) {
    const child = directory(current).get(part);
    if (!child) return null;
    current = child;
  }
  return current;
}

for (const [path, artifactRole] of [
  ["/usr/local/libexec/capsule-init.krun", "trustedInit"],
  ["/usr/local/libexec/capsule-launcher", "trustedLauncher"],
]) {
  const number = resolveRoot(path);
  refuse(number !== null && inodeBytes(number).equals(artifacts[artifactRole]), `${path}: root embedded artifact mismatch`);
}
for (const [path, inputPath] of [
  ["/opt/capsule/inputs/main.mjs", "inputs/c5b0/main.mjs"],
  ["/opt/capsule/inputs/source-manifest.cbor", "inputs/c5b0/source-manifest.cbor"],
  ["/opt/capsule/inputs/input.json", "inputs/c5b0/input.json"],
]) {
  const number = resolveRoot(path);
  const expected = await readFile(join(root, inputPath));
  refuse(number !== null && inodeBytes(number).equals(expected), `${path}: root embedded input mismatch`);
}
refuse(resolveRoot("/usr/local/bin/capsule-deno-core-c5b1") === null, "governed runtime path must remain absent");

const predecessorKnown = {
  "inputs/c5b0/main.mjs": [103, "c8e940feb89b342de2d5e6bd13c413226676de9a539fce34c4107516e635b475"],
  "inputs/c5b0/source-manifest.cbor": [89, "712b1bd9739e4f6b0b027600207cbb08fb21b159a57bd34a15cf0ff8f32661b0"],
  "inputs/c5b0/input.json": [36, "9de0c909cfb111bd99c3b0b5f7a10972894270c2867022a71b6b6f3c0cd1af6e"],
  "inputs/c5b0/source.frame": [255, "c8d035b02af814c2df23916bb060018c50412dd208131ec37a65f87c94ce8173"],
  "inputs/c5b0/input.frame": [188, "c4b66bba6dd33af06760118f34955b637308538d300ace79aa68381ae3f7f2c2"],
  "inputs/c5b0/completion.frame": [259, "d60681ed713f8e11df7cd85301552ef84e3f2831c014fb65741350c9e0db7a7c"],
};
for (const [path, [size, digest]] of Object.entries(predecessorKnown)) {
  const bytes = await readFile(join(root, path));
  refuse(bytes.length === size && sha256(bytes) === digest, `${path}: C5b0 input identity mismatch`);
}

async function walk(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(child)));
    else result.push(child);
  }
  return result;
}
const archivePath = "manifests/archive-manifest.json";
const archive = await json(archivePath);
const actual = (await walk(root)).map((path) => relative(root, path)).filter((path) => path !== archivePath).sort();
const declared = archive.retainedFiles.map((entry) => entry.path);
refuse(JSON.stringify(actual) === JSON.stringify(declared), "archive inventory mismatch");
for (const entry of archive.retainedFiles) {
  const bytes = await readFile(join(root, entry.path));
  refuse(bytes.length === entry.bytes && sha256(bytes) === entry.sha256, `${entry.path}: archive identity mismatch`);
}

console.log(JSON.stringify({ result: "PASSED", scopedConstruction: "PASSED", completeExecutableSuccessor: "BLOCKED", controlledExecution: "BLOCKED", artifacts: 5, retainedFiles: declared.length, effects: "NONE" }));
