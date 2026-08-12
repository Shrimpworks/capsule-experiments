#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

if (process.argv.length !== 8) {
  throw new Error("usage: build-root.mjs INIT LAUNCHER SOURCE MANIFEST INPUT OUTPUT");
}

const [, , initPath, launcherPath, sourcePath, sourceManifestPath, inputPath, outputPath] = process.argv;
const BLOCK = 1024;
const BLOCKS = 8192;
const INODES = 128;
const INODE_SIZE = 128;
const INODE_TABLE_BLOCK = 5;
const FIRST_DATA_BLOCK = 21;
const image = Buffer.alloc(BLOCK * BLOCKS);
let nextBlock = FIRST_DATA_BLOCK;

const nodes = [
  { inode: 2, path: "/", parent: 2, mode: 0o40755, type: 2 },
  { inode: 11, path: "/usr", parent: 2, mode: 0o40755, type: 2 },
  { inode: 12, path: "/usr/local", parent: 11, mode: 0o40755, type: 2 },
  { inode: 13, path: "/usr/local/libexec", parent: 12, mode: 0o40755, type: 2 },
  { inode: 14, path: "/usr/local/bin", parent: 12, mode: 0o40755, type: 2 },
  { inode: 15, path: "/opt", parent: 2, mode: 0o40755, type: 2 },
  { inode: 16, path: "/opt/capsule", parent: 15, mode: 0o40755, type: 2 },
  { inode: 17, path: "/opt/capsule/inputs", parent: 16, mode: 0o40555, type: 2 },
  { inode: 18, path: "/dev", parent: 2, mode: 0o40755, type: 2 },
  { inode: 19, path: "/proc", parent: 2, mode: 0o40555, type: 2 },
  { inode: 20, path: "/usr/local/libexec/capsule-init.krun", parent: 13, mode: 0o100755, type: 1, data: await readFile(initPath) },
  { inode: 21, path: "/usr/local/libexec/capsule-launcher", parent: 13, mode: 0o100755, type: 1, data: await readFile(launcherPath) },
  { inode: 22, path: "/opt/capsule/inputs/main.mjs", parent: 17, mode: 0o100444, type: 1, data: await readFile(sourcePath) },
  { inode: 23, path: "/opt/capsule/inputs/source-manifest.cbor", parent: 17, mode: 0o100444, type: 1, data: await readFile(sourceManifestPath) },
  { inode: 24, path: "/opt/capsule/inputs/input.json", parent: 17, mode: 0o100444, type: 1, data: await readFile(inputPath) },
];

const byInode = new Map(nodes.map((node) => [node.inode, node]));
const base = (path) => path === "/" ? "/" : path.slice(path.lastIndexOf("/") + 1);

function allocateBlock(bytes = Buffer.alloc(0)) {
  if (nextBlock >= BLOCKS) throw new Error("root image capacity exceeded");
  const block = nextBlock++;
  bytes.copy(image, block * BLOCK, 0, Math.min(bytes.length, BLOCK));
  return block;
}

function directoryBytes(node) {
  const children = nodes.filter((candidate) => candidate.parent === node.inode && candidate.inode !== node.inode);
  const entries = [
    { inode: node.inode, name: ".", type: 2 },
    { inode: node.parent, name: "..", type: 2 },
    ...children.map((child) => ({ inode: child.inode, name: base(child.path), type: child.type })),
  ];
  const result = Buffer.alloc(BLOCK);
  let offset = 0;
  entries.forEach((entry, index) => {
    const name = Buffer.from(entry.name);
    const minimum = (8 + name.length + 3) & ~3;
    const record = index === entries.length - 1 ? BLOCK - offset : minimum;
    result.writeUInt32LE(entry.inode, offset);
    result.writeUInt16LE(record, offset + 4);
    result[offset + 6] = name.length;
    result[offset + 7] = entry.type;
    name.copy(result, offset + 8);
    offset += record;
  });
  return result;
}

function allocateFile(data) {
  const dataBlocks = [];
  for (let offset = 0; offset < data.length; offset += BLOCK) {
    dataBlocks.push(allocateBlock(data.subarray(offset, offset + BLOCK)));
  }
  if (dataBlocks.length === 0) dataBlocks.push(allocateBlock());
  return { firstBlock: dataBlocks[0], blockCount: dataBlocks.length, sectors: dataBlocks.length * 2 };
}

for (const node of nodes) {
  const data = node.type === 2 ? directoryBytes(node) : node.data;
  const allocation = allocateFile(data);
  node.size = data.length;
  node.firstBlock = allocation.firstBlock;
  node.blockCount = allocation.blockCount;
  node.sectors = allocation.sectors;
}

function writeInode(node) {
  const offset = INODE_TABLE_BLOCK * BLOCK + (node.inode - 1) * INODE_SIZE;
  image.writeUInt16LE(node.mode, offset);
  image.writeUInt16LE(0, offset + 2);
  image.writeUInt32LE(node.size, offset + 4);
  image.writeUInt32LE(0, offset + 8);
  image.writeUInt32LE(0, offset + 12);
  image.writeUInt32LE(0, offset + 16);
  image.writeUInt32LE(0, offset + 20);
  image.writeUInt16LE(0, offset + 24);
  const subdirs = nodes.filter((child) => child.parent === node.inode && child.type === 2 && child.inode !== node.inode).length;
  image.writeUInt16LE(node.type === 2 ? 2 + subdirs : 1, offset + 26);
  image.writeUInt32LE(node.sectors, offset + 28);
  image.writeUInt32LE(0x00080000, offset + 32);
  image.writeUInt16LE(0xf30a, offset + 40);
  image.writeUInt16LE(1, offset + 42);
  image.writeUInt16LE(4, offset + 44);
  image.writeUInt16LE(0, offset + 46);
  image.writeUInt32LE(0, offset + 48);
  image.writeUInt32LE(0, offset + 52);
  image.writeUInt16LE(node.blockCount, offset + 56);
  image.writeUInt16LE(0, offset + 58);
  image.writeUInt32LE(node.firstBlock, offset + 60);
}
nodes.forEach(writeInode);

const usedInodeMaximum = Math.max(...nodes.map((node) => node.inode));
const usedBlocks = nextBlock;
const freeBlocks = BLOCKS - usedBlocks;
const freeInodes = INODES - usedInodeMaximum;

const blockBitmap = 3 * BLOCK;
for (let block = 0; block < usedBlocks; block += 1) image[blockBitmap + (block >> 3)] |= 1 << (block & 7);
const inodeBitmap = 4 * BLOCK;
for (let inode = 1; inode <= usedInodeMaximum; inode += 1) image[inodeBitmap + ((inode - 1) >> 3)] |= 1 << ((inode - 1) & 7);

const sb = BLOCK;
image.writeUInt32LE(INODES, sb + 0);
image.writeUInt32LE(BLOCKS, sb + 4);
image.writeUInt32LE(0, sb + 8);
image.writeUInt32LE(freeBlocks, sb + 12);
image.writeUInt32LE(freeInodes, sb + 16);
image.writeUInt32LE(1, sb + 20);
image.writeUInt32LE(0, sb + 24);
image.writeInt32LE(0, sb + 28);
image.writeUInt32LE(BLOCKS, sb + 32);
image.writeUInt32LE(BLOCKS, sb + 36);
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
Buffer.from("c5b1-executable1", "ascii").copy(image, sb + 104);
Buffer.from("CAPSULE-C5B1", "ascii").copy(image, sb + 120);

const gd = 2 * BLOCK;
image.writeUInt32LE(3, gd + 0);
image.writeUInt32LE(4, gd + 4);
image.writeUInt32LE(INODE_TABLE_BLOCK, gd + 8);
image.writeUInt16LE(freeBlocks, gd + 12);
image.writeUInt16LE(freeInodes, gd + 14);
image.writeUInt16LE(nodes.filter((node) => node.type === 2).length, gd + 16);

await writeFile(outputPath, image);
console.log(JSON.stringify({ result: "PASSED", bytes: image.length, usedBlocks, freeBlocks, nodes: nodes.length }));
