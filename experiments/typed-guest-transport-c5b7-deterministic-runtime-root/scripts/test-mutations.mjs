#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const verifier = join(root, "scripts/verify.mjs");
const rewriteJson = async (copy, path, mutate) => {
  const value = JSON.parse(await readFile(join(copy, path), "utf8"));
  mutate(value);
  await writeFile(join(copy, path), `${JSON.stringify(value, null, 2)}\n`);
};
const mutateRoot = async (copy, mutate) => {
  const path = join(copy, "dist/runtime-root.ext4");
  const bytes = Buffer.from(await readFile(path));
  mutate(bytes);
  await writeFile(path, bytes);
};
const inodeOffset = (number) => 4 * 4096 + (number - 1) * 256;
const cases = [
  { id: "root-byte", oracle: "root digest mismatch", mutate: (copy) => mutateRoot(copy, (bytes) => { bytes[bytes.length - 1] ^= 1; }) },
  { id: "journal-feature", oracle: "compatible features must be empty", mutate: (copy) => mutateRoot(copy, (bytes) => { bytes.writeUInt32LE(4, 1024 + 92); }) },
  { id: "foreign-path", oracle: "root path inventory mismatch", mutate: (copy) => mutateRoot(copy, (bytes) => {
    const offset = bytes.indexOf(Buffer.from("dev"), 20 * 4096);
    if (offset < 0 || offset >= 21 * 4096) throw new Error("root dev entry not found");
    Buffer.from("tmp").copy(bytes, offset);
  }) },
  { id: "foreign-owner", oracle: "inode 22 owner mismatch", mutate: (copy) => mutateRoot(copy, (bytes) => { bytes.writeUInt16LE(1, inodeOffset(22) + 2); }) },
  { id: "runtime-mode", oracle: "mode mismatch: /usr/local/bin/capsule-deno-core-c5b1", mutate: (copy) => mutateRoot(copy, (bytes) => { bytes.writeUInt16LE(0o100744, inodeOffset(22)); }) },
  { id: "source-byte", oracle: "content mismatch: /opt/capsule/inputs/main.mjs", mutate: (copy) => mutateRoot(copy, (bytes) => {
    const start = bytes.readUInt32LE(inodeOffset(26) + 60);
    bytes[start * 4096] ^= 1;
  }) },
  { id: "truncated-root", oracle: "root byte length mismatch", mutate: async (copy) => {
    const path = join(copy, "dist/runtime-root.ext4"); const bytes = await readFile(path); await writeFile(path, bytes.subarray(0, bytes.length - 1));
  } },
  { id: "claim-effect", oracle: "effect boundary mismatch", mutate: (copy) => rewriteJson(copy, "manifests/runtime-root-profile.json", (profile) => { profile.effects.runtimeExecuted = true; }) },
  { id: "controller-pin", oracle: "metadata-only pin mismatch", mutate: (copy) => rewriteJson(copy, "manifests/runtime-root-profile.json", (profile) => { profile.metadataOnly.controller.mergeCommit = "0".repeat(40); }) },
  { id: "wrong-dotdot", oracle: "dotdot entry invalid: /usr", mutate: (copy) => mutateRoot(copy, (bytes) => {
    const start = bytes.readUInt32LE(inodeOffset(11) + 60) * 4096;
    const second = bytes.readUInt16LE(start + 4);
    bytes.writeUInt32LE(11, start + second);
  }) },
  { id: "inode-alias", oracle: "inode reachable at multiple paths", mutate: (copy) => mutateRoot(copy, (bytes) => {
    const start = bytes.readUInt32LE(inodeOffset(19) + 60) * 4096;
    const end = start + bytes.readUInt32LE(inodeOffset(19) + 4);
    const name = bytes.indexOf(Buffer.from("input.json"), start);
    if (name < 0 || name >= end) throw new Error("input.json entry not found");
    bytes.writeUInt32LE(26, name - 8);
  }) },
  { id: "link-count", oracle: "inode 22 link count mismatch", mutate: (copy) => mutateRoot(copy, (bytes) => { bytes.writeUInt16LE(2, inodeOffset(22) + 26); }) },
  { id: "profile-file-size", oracle: "content profile mismatch", mutate: (copy) => rewriteJson(copy, "manifests/runtime-root-profile.json", (profile) => { profile.content.runtime.bytes += 1; }) },
  { id: "adapter-compatibility-disclosure", oracle: "adapter compatibility boundary mismatch", mutate: (copy) => rewriteJson(copy, "manifests/runtime-root-profile.json", (profile) => { profile.metadataOnly.effectAdapter.compatibleAsIs = true; }) },
  { id: "archive-extra", oracle: "archive inventory mismatch", mutate: (copy) => writeFile(join(copy, "unexpected.bin"), Buffer.of(0)) }
];
const retained = JSON.parse(await readFile(join(root, "evidence/2026-08-13/mutation-dispositions.json"), "utf8"));
if (JSON.stringify(retained.cases) !== JSON.stringify(cases.map(({ id, oracle }) => ({ id, disposition: "REFUSED", oracle })))) throw new Error("retained mutation inventory mismatch");

const results = [];
for (const test of cases) {
  const temporary = await mkdtemp(join(tmpdir(), "capsule-c5b7-mutation."));
  const copy = join(temporary, "packet");
  try {
    await cp(root, copy, { recursive: true });
    await test.mutate(copy);
    let output = "";
    try {
      execFileSync(process.execPath, [verifier, copy], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CAPSULE_EXPERIMENTS_ROOT: resolve(root, "../..") } });
      throw new Error(`${test.id}: mutation was accepted`);
    } catch (error) {
      output = `${error.stdout ?? ""}${error.stderr ?? ""}${error.message ?? ""}`;
      if (!output.includes(test.oracle)) throw new Error(`${test.id}: expected ${test.oracle}; received ${output}`);
    }
    results.push({ id: test.id, disposition: "REFUSED", oracle: test.oracle });
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
console.log(JSON.stringify({ result: "PASSED", cases: results }, null, 2));
