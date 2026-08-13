#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const verifier = join(root, "scripts/verify.mjs");
const cases = [
  ["profile-root-size", "manifests/effect-implementation-profile.json", "134217728", "100663296", "C5b5 root size"],
  ["contract-effect", "contracts/effect-implementation-contract.json", '"invokesClosedEffects": true', '"invokesClosedEffects": false', "closed effect boundary"],
  ["source-fixed-path", "source/effect_implementation.c", '"/dev/vda"', '"/dev/vdb"', "source identity"],
  ["header-cap", "source/effect_implementation.h", "C5B7_REFUSE_FRAME_CAP = 104", "C5B7_REFUSE_FRAME_CAP = 999", "header identity"],
  ["production-object", "dist/effect-implementation-a.o", null, null, "production A/B object identity"],
  ["predecessor", "inputs/c5b5/effect-adapter-contract.json", '"objectVersion": 1', '"objectVersion": 2', "C5b5 predecessor identity"],
  ["archive-extra", "unexpected", "", "x", "closed archive inventory"],
];

const results = [];
for (const [id, path, from, to, expected] of cases) {
  const temporary = await mkdtemp(join(tmpdir(), `capsule-c5b7-${id}-`));
  try {
    const copy = spawnSync("ditto", [root, temporary], { encoding: "utf8" });
    if (copy.status !== 0) throw new Error(`copy failed: ${copy.stderr}`);
    const target = join(temporary, path);
    if (id === "production-object") {
      const bytes = Buffer.from(await readFile(target)); bytes[64] ^= 1; await writeFile(target, bytes);
    } else if (id === "archive-extra") {
      await writeFile(target, to);
    } else {
      const original = await readFile(target, "utf8");
      if (!original.includes(from)) throw new Error(`${id}: mutation source absent`);
      await writeFile(target, original.replace(from, to));
    }
    const run = spawnSync(process.execPath, [join(temporary, "scripts/verify.mjs")], { encoding: "utf8" });
    if (run.status === 0) throw new Error(`${id}: verifier accepted mutation`);
    results.push({ id, expected, refused: true });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
console.log(JSON.stringify({ status: "PASSED", cases: results }, null, 2));
