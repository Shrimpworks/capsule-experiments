import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const check = (condition, message) => { if (!condition) throw new Error(message); };

export async function parseRoot(path) {
  const image = await readFile(path);
  check(image.length === 100663296, "root byte length mismatch");
  const sb = 1024;
  check(image.readUInt16LE(sb + 56) === 0xef53, "ext magic mismatch");
  check(image.readUInt32LE(sb + 76) === 1, "ext revision mismatch");
  check(image.readUInt32LE(sb + 24) === 2, "block-size encoding mismatch");
  check(image.readUInt32LE(sb + 20) === 0, "first data block mismatch");
  check(image.readUInt32LE(sb + 0) === 256, "inode count mismatch");
  check(image.readUInt32LE(sb + 4) === 24576, "block count mismatch");
  check(image.readUInt32LE(sb + 32) === 32768, "blocks-per-group mismatch");
  check(image.readUInt32LE(sb + 40) === 256, "inodes-per-group mismatch");
  check(image.readUInt16LE(sb + 88) === 256, "inode size mismatch");
  check(image.readUInt32LE(sb + 92) === 0, "compatible features must be empty");
  check(image.readUInt32LE(sb + 96) === 0x42, "incompatible feature set mismatch");
  check(image.readUInt32LE(sb + 100) === 0, "read-only feature set must be empty");
  check(image.readUInt32LE(sb + 224) === 0, "journal inode must be absent");
  check(image.subarray(sb + 120, sb + 136).toString("ascii").replace(/\0.*$/s, "") === "CAPSULE-C5B7", "volume label mismatch");
  for (const offset of [44, 48, 64, 68, 72]) check(image.readUInt32LE(sb + offset) === 0, "filesystem time field is nonzero");

  const block = 4096;
  const gd = block;
  check(image.readUInt32LE(gd + 0) === 2, "block bitmap location mismatch");
  check(image.readUInt32LE(gd + 4) === 3, "inode bitmap location mismatch");
  check(image.readUInt32LE(gd + 8) === 4, "inode table location mismatch");
  check(image.readUInt16LE(gd + 16) === 12, "directory count mismatch");

  const inode = (number) => {
    const offset = 4 * block + (number - 1) * 256;
    const mode = image.readUInt16LE(offset);
    check(image.readUInt16LE(offset + 2) === 0 && image.readUInt16LE(offset + 24) === 0, `inode ${number} owner mismatch`);
    for (const timeOffset of [8, 12, 16, 20]) check(image.readUInt32LE(offset + timeOffset) === 0, `inode ${number} time field is nonzero`);
    check(image.readUInt32LE(offset + 32) === 0x00080000, `inode ${number} extent flag mismatch`);
    check(image.readUInt16LE(offset + 40) === 0xf30a, `inode ${number} extent magic mismatch`);
    check(image.readUInt16LE(offset + 42) === 1 && image.readUInt16LE(offset + 46) === 0, `inode ${number} extent shape mismatch`);
    const blocks = image.readUInt16LE(offset + 56);
    const start = image.readUInt32LE(offset + 60) + image.readUInt16LE(offset + 58) * 0x100000000;
    const size = image.readUInt32LE(offset + 4);
    check(image.readUInt32LE(offset + 52) === 0, `inode ${number} extent logical start mismatch`);
    check(image.readUInt32LE(offset + 28) === blocks * 8, `inode ${number} sector count mismatch`);
    check(blocks === Math.max(1, Math.ceil(size / block)), `inode ${number} block count mismatch`);
    check(start >= 20 && start + blocks <= 24576, `inode ${number} extent outside data area`);
    return { number, mode, size, start, blocks, bytes: Buffer.from(image.subarray(start * block, start * block + size)) };
  };

  const paths = new Map();
  const extents = [];
  const visit = (number, path) => {
    check(!paths.has(path), `duplicate path: ${path}`);
    const value = inode(number);
    paths.set(path, value);
    extents.push([value.start, value.start + value.blocks, path]);
    if ((value.mode & 0o170000) !== 0o040000) return;
    let offset = 0;
    const names = new Set();
    while (offset < value.bytes.length) {
      check(offset + 8 <= value.bytes.length, `directory record truncated: ${path}`);
      const child = value.bytes.readUInt32LE(offset);
      const length = value.bytes.readUInt16LE(offset + 4);
      const nameLength = value.bytes[offset + 6];
      const type = value.bytes[offset + 7];
      check(length >= 8 && length % 4 === 0 && offset + length <= value.bytes.length, `directory record length invalid: ${path}`);
      check(nameLength <= length - 8, `directory name length invalid: ${path}`);
      const name = value.bytes.subarray(offset + 8, offset + 8 + nameLength).toString("utf8");
      check(name && !name.includes("/") && !names.has(name), `directory name invalid: ${path}`);
      names.add(name);
      if (name === ".") check(child === number && type === 2, `dot entry invalid: ${path}`);
      else if (name === "..") check(type === 2, `dotdot entry invalid: ${path}`);
      else visit(child, path === "/" ? `/${name}` : `${path}/${name}`);
      offset += length;
    }
    check(offset === value.bytes.length && names.has(".") && names.has(".."), `directory closure invalid: ${path}`);
  };
  visit(2, "/");

  extents.sort((a, b) => a[0] - b[0]);
  check(extents[0][0] === 20, "first data extent mismatch");
  for (let index = 1; index < extents.length; index += 1) check(extents[index - 1][1] === extents[index][0], `non-contiguous or overlapping extent: ${extents[index][2]}`);
  const usedBlocks = extents.at(-1)[1];
  check(image.readUInt32LE(sb + 12) === 24576 - usedBlocks, "superblock free-block count mismatch");
  check(image.readUInt16LE(gd + 12) === 24576 - usedBlocks, "group free-block count mismatch");
  check(image.readUInt32LE(sb + 16) === 228 && image.readUInt16LE(gd + 14) === 228, "free-inode count mismatch");
  const blockBitmap = image.subarray(2 * block, 3 * block);
  for (let number = 0; number < 24576; number += 1) check(Boolean(blockBitmap[number >> 3] & (1 << (number & 7))) === (number < usedBlocks), `block bitmap mismatch at ${number}`);
  const inodeBitmap = image.subarray(3 * block, 4 * block);
  for (let number = 1; number <= 256; number += 1) check(Boolean(inodeBitmap[(number - 1) >> 3] & (1 << ((number - 1) & 7))) === (number <= 28), `inode bitmap mismatch at ${number}`);

  return { image, paths, usedBlocks, freeBlocks: 24576 - usedBlocks, digest: sha256(image) };
}
