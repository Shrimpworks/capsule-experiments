#!/usr/bin/env node

import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = resolve(here, "../..");
const output = process.argv[2];
if (!output) throw new Error("usage: build-root.mjs OUTPUT");

const BLOCK = 4096;
const BLOCKS = 24576;
const INODES = 256;
const INODE_SIZE = 256;
const INODE_TABLE_BLOCK = 4;
const FIRST_DATA_BLOCK = 20;
const image = Buffer.alloc(BLOCK * BLOCKS);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const predecessor = {
  bundle: join(repository, "experiments/typed-guest-transport-c5b6-deno-static-reproduction/artifacts/capsule-deno-core-c2b-runtime-bundle.tar.gz"),
  init: join(repository, "experiments/typed-guest-transport-c5b1-executable-successor/dist/trusted-init"),
  launcher: join(repository, "experiments/typed-guest-transport-c5b1-executable-successor/dist/trusted-launcher"),
  source: join(repository, "experiments/typed-guest-transport-c5b0-v19-successor/fixtures/main.mjs"),
  manifest: join(repository, "experiments/typed-guest-transport-c5b0-v19-successor/fixtures/source-manifest.cbor"),
  input: join(repository, "experiments/typed-guest-transport-c5b0-v19-successor/fixtures/input.json"),
};

function parseTarGzip(bytes) {
  const tar = gunzipSync(bytes);
  const files = new Map();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const text = (start, length) => header.subarray(start, start + length).toString("utf8").replace(/\0.*$/s, "");
    const name = `${text(345, 155)}${text(345, 155) ? "/" : ""}${text(0, 100)}`;
    if (name.startsWith("/") || name.split("/").includes("..") || name.includes("\\")) throw new Error("unsafe runtime bundle member");
    const sizeText = text(124, 12).trim();
    const size = sizeText ? Number.parseInt(sizeText, 8) : 0;
    const type = header[156];
    offset += 512;
    if (type === 0 || type === 48) files.set(name, Buffer.from(tar.subarray(offset, offset + size)));
    else if (type !== 53) throw new Error(`unsupported runtime bundle member type: ${type}`);
    offset += Math.ceil(size / 512) * 512;
  }
  return files;
}

const bundleBytes = await readFile(predecessor.bundle);
if (bundleBytes.length !== 20981992 || sha256(bundleBytes) !== "ad908b8289c86f25c3413713fa3e60c4c8bb91fec0d52763e870d7a186865ee6") throw new Error("C5b6 runtime bundle mismatch");
const bundle = parseTarGzip(bundleBytes);
if ([...bundle.keys()].sort().join("\n") !== [
  "bin/capsule-deno-core-c2b-fixed-fixture",
  "share/capsule-deno-core/capsule_core_snapshot.bin",
].join("\n")) throw new Error("runtime bundle inventory mismatch");

const exact = async (path, bytes, digest, label) => {
  const value = await readFile(path);
  if (value.length !== bytes || sha256(value) !== digest) throw new Error(`${label} mismatch`);
  return value;
};
const runtime = bundle.get("bin/capsule-deno-core-c2b-fixed-fixture");
const snapshot = bundle.get("share/capsule-deno-core/capsule_core_snapshot.bin");
if (runtime.length !== 68496520 || sha256(runtime) !== "e781a90236cdf1272a9a16189c6be033164fa25a5aa9e52376ef998982ec0a77") throw new Error("runtime mismatch");
if (snapshot.length !== 699988 || sha256(snapshot) !== "4e8965217d5a6675a880326eee6f690bbeec7e7cb243decf2f3e9f453a871a2c") throw new Error("snapshot mismatch");

const nodes = [
  { inode: 2, path: "/", parent: 2, mode: 0o40755, type: 2 },
  { inode: 11, path: "/usr", parent: 2, mode: 0o40755, type: 2 },
  { inode: 12, path: "/usr/local", parent: 11, mode: 0o40755, type: 2 },
  { inode: 13, path: "/usr/local/bin", parent: 12, mode: 0o40755, type: 2 },
  { inode: 14, path: "/usr/local/libexec", parent: 12, mode: 0o40755, type: 2 },
  { inode: 15, path: "/usr/local/share", parent: 12, mode: 0o40755, type: 2 },
  { inode: 16, path: "/usr/local/share/capsule-deno-core", parent: 15, mode: 0o40555, type: 2 },
  { inode: 17, path: "/opt", parent: 2, mode: 0o40755, type: 2 },
  { inode: 18, path: "/opt/capsule", parent: 17, mode: 0o40755, type: 2 },
  { inode: 19, path: "/opt/capsule/inputs", parent: 18, mode: 0o40555, type: 2 },
  { inode: 20, path: "/dev", parent: 2, mode: 0o40755, type: 2 },
  { inode: 21, path: "/proc", parent: 2, mode: 0o40555, type: 2 },
  { inode: 22, path: "/usr/local/bin/capsule-deno-core-c5b1", parent: 13, mode: 0o100755, type: 1, data: runtime },
  { inode: 23, path: "/usr/local/libexec/capsule-init.krun", parent: 14, mode: 0o100755, type: 1, data: await exact(predecessor.init, 365352, "c6c5f15dd386082e6b108c354afdca27327d6760efdefb54fe9d02e25b80e408", "trusted init") },
  { inode: 24, path: "/usr/local/libexec/capsule-launcher", parent: 14, mode: 0o100755, type: 1, data: await exact(predecessor.launcher, 389312, "278467cd82499590154a9b1a34b0189096d3927c49fefd228dedc2f4db36ea98", "trusted launcher") },
  { inode: 25, path: "/usr/local/share/capsule-deno-core/capsule_core_snapshot.bin", parent: 16, mode: 0o100444, type: 1, data: snapshot },
  { inode: 26, path: "/opt/capsule/inputs/main.mjs", parent: 19, mode: 0o100444, type: 1, data: await exact(predecessor.source, 103, "c8e940feb89b342de2d5e6bd13c413226676de9a539fce34c4107516e635b475", "source") },
  { inode: 27, path: "/opt/capsule/inputs/source-manifest.cbor", parent: 19, mode: 0o100444, type: 1, data: await exact(predecessor.manifest, 89, "712b1bd9739e4f6b0b027600207cbb08fb21b159a57bd34a15cf0ff8f32661b0", "source manifest") },
  { inode: 28, path: "/opt/capsule/inputs/input.json", parent: 19, mode: 0o100444, type: 1, data: await exact(predecessor.input, 36, "9de0c909cfb111bd99c3b0b5f7a10972894270c2867022a71b6b6f3c0cd1af6e", "input") },
];
let nextBlock = FIRST_DATA_BLOCK;
const base = (path) => path === "/" ? "/" : path.slice(path.lastIndexOf("/") + 1);

function directoryBytes(node) {
  const children = nodes.filter((candidate) => candidate.parent === node.inode && candidate.inode !== node.inode);
  const entries = [{ inode: node.inode, name: ".", type: 2 }, { inode: node.parent, name: "..", type: 2 }, ...children.map((child) => ({ inode: child.inode, name: base(child.path), type: child.type }))];
  const result = Buffer.alloc(BLOCK);
  let offset = 0;
  entries.forEach((entry, index) => {
    const name = Buffer.from(entry.name);
    const minimum = (8 + name.length + 3) & ~3;
    const length = index === entries.length - 1 ? BLOCK - offset : minimum;
    result.writeUInt32LE(entry.inode, offset);
    result.writeUInt16LE(length, offset + 4);
    result[offset + 6] = name.length;
    result[offset + 7] = entry.type;
    name.copy(result, offset + 8);
    offset += length;
  });
  return result;
}

function allocate(data) {
  const blocks = Math.max(1, Math.ceil(data.length / BLOCK));
  if (nextBlock + blocks > BLOCKS) throw new Error("root image capacity exceeded");
  const start = nextBlock;
  data.copy(image, start * BLOCK);
  nextBlock += blocks;
  return { start, blocks };
}

for (const node of nodes) {
  const data = node.type === 2 ? directoryBytes(node) : node.data;
  const allocation = allocate(data);
  node.size = data.length;
  node.start = allocation.start;
  node.blocks = allocation.blocks;
}

function writeInode(node) {
  const offset = INODE_TABLE_BLOCK * BLOCK + (node.inode - 1) * INODE_SIZE;
  image.writeUInt16LE(node.mode, offset);
  image.writeUInt16LE(0, offset + 2);
  image.writeUInt32LE(node.size, offset + 4);
  image.writeUInt16LE(0, offset + 24);
  const subdirs = nodes.filter((child) => child.parent === node.inode && child.type === 2 && child.inode !== node.inode).length;
  image.writeUInt16LE(node.type === 2 ? 2 + subdirs : 1, offset + 26);
  image.writeUInt32LE(node.blocks * (BLOCK / 512), offset + 28);
  image.writeUInt32LE(0x00080000, offset + 32);
  image.writeUInt16LE(0xf30a, offset + 40);
  image.writeUInt16LE(1, offset + 42);
  image.writeUInt16LE(4, offset + 44);
  image.writeUInt16LE(0, offset + 46);
  image.writeUInt32LE(0, offset + 48);
  image.writeUInt32LE(0, offset + 52);
  image.writeUInt16LE(node.blocks, offset + 56);
  image.writeUInt16LE(0, offset + 58);
  image.writeUInt32LE(node.start, offset + 60);
}
nodes.forEach(writeInode);

const usedInodeMaximum = Math.max(...nodes.map((node) => node.inode));
const freeBlocks = BLOCKS - nextBlock;
const freeInodes = INODES - usedInodeMaximum;
for (let block = 0; block < nextBlock; block += 1) image[2 * BLOCK + (block >> 3)] |= 1 << (block & 7);
for (let inode = 1; inode <= usedInodeMaximum; inode += 1) image[3 * BLOCK + ((inode - 1) >> 3)] |= 1 << ((inode - 1) & 7);

const sb = 1024;
image.writeUInt32LE(INODES, sb + 0);
image.writeUInt32LE(BLOCKS, sb + 4);
image.writeUInt32LE(0, sb + 8);
image.writeUInt32LE(freeBlocks, sb + 12);
image.writeUInt32LE(freeInodes, sb + 16);
image.writeUInt32LE(0, sb + 20);
image.writeUInt32LE(2, sb + 24);
image.writeInt32LE(2, sb + 28);
image.writeUInt32LE(32768, sb + 32);
image.writeUInt32LE(32768, sb + 36);
image.writeUInt32LE(INODES, sb + 40);
image.writeUInt16LE(0, sb + 52);
image.writeInt16LE(-1, sb + 54);
image.writeUInt16LE(0xef53, sb + 56);
image.writeUInt16LE(1, sb + 58);
image.writeUInt16LE(1, sb + 60);
image.writeUInt32LE(0, sb + 64);
image.writeUInt32LE(0, sb + 68);
image.writeUInt32LE(0, sb + 72);
image.writeUInt32LE(1, sb + 76);
image.writeUInt16LE(0, sb + 80);
image.writeUInt16LE(0, sb + 82);
image.writeUInt32LE(11, sb + 84);
image.writeUInt16LE(INODE_SIZE, sb + 88);
image.writeUInt16LE(0, sb + 90);
image.writeUInt32LE(0, sb + 92);
image.writeUInt32LE(0x42, sb + 96);
image.writeUInt32LE(0, sb + 100);
Buffer.from("c5b7-runtime-v1", "ascii").copy(image, sb + 104);
Buffer.from("CAPSULE-C5B7", "ascii").copy(image, sb + 120);

const gd = BLOCK;
image.writeUInt32LE(2, gd + 0);
image.writeUInt32LE(3, gd + 4);
image.writeUInt32LE(INODE_TABLE_BLOCK, gd + 8);
image.writeUInt16LE(freeBlocks, gd + 12);
image.writeUInt16LE(freeInodes, gd + 14);
image.writeUInt16LE(nodes.filter((node) => node.type === 2).length, gd + 16);

await writeFile(output, image, { mode: 0o644 });
console.log(JSON.stringify({ result: "PASSED", bytes: image.length, blockBytes: BLOCK, usedBlocks: nextBlock, freeBlocks, nodes: nodes.length, sha256: sha256(image), effects: "NONE" }));
