#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const verifier = join(root, "scripts/verify.mjs");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function updateArchive(copy, path) {
  const manifestPath = join(copy, "manifests/archive-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const bytes = await readFile(join(copy, path));
  const entry = manifest.retainedFiles.find((candidate) => candidate.path === path);
  if (!entry) throw new Error(`archive entry absent: ${path}`);
  entry.bytes = bytes.length;
  entry.sha256 = sha256(bytes);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function updateArtifact(copy, role, bytes) {
  const path = "manifests/artifact-profile.json";
  const profile = JSON.parse(await readFile(join(copy, path), "utf8"));
  profile.artifacts[role].bytes = bytes.length;
  profile.artifacts[role].sha256 = sha256(bytes);
  await writeFile(join(copy, path), `${JSON.stringify(profile, null, 2)}\n`);
  await updateArchive(copy, path);
}

async function rebindRoot(copy, rootBytes) {
  const profile = JSON.parse(await readFile(join(copy, "manifests/artifact-profile.json"), "utf8"));
  const previous = profile.artifacts.rawRuntimeRoot.sha256;
  const current = sha256(rootBytes);
  await updateArtifact(copy, "rawRuntimeRoot", rootBytes);
  const runnerPath = "dist/host-runner";
  const runner = Buffer.from(await readFile(join(copy, runnerPath)));
  const offset = runner.indexOf(Buffer.from(previous));
  if (offset < 0) throw new Error("host runner root digest binding absent");
  Buffer.from(current).copy(runner, offset);
  await writeFile(join(copy, runnerPath), runner);
  await updateArchive(copy, runnerPath);
  await updateArtifact(copy, "hostRunner", runner);
}

async function mutateByte(copy, path, offset) {
  const bytes = Buffer.from(await readFile(join(copy, path)));
  bytes[offset] ^= 1;
  await writeFile(join(copy, path), bytes);
  await updateArchive(copy, path);
  return bytes;
}

const cases = [
  { id: "host-runner-byte", expected: "artifact identity mismatch", mutate: (copy) => mutateByte(copy, "dist/host-runner", 256) },
  {
    id: "root-input-byte", expected: "root embedded input mismatch", mutate: async (copy) => {
      const rootBytes = await mutateByte(copy, "dist/runtime-root.ext4", 769 * 1024);
      await rebindRoot(copy, rootBytes);
    },
  },
  {
    id: "root-journal-feature", expected: "root journal feature must be disabled", mutate: async (copy) => {
      const path = "dist/runtime-root.ext4";
      const bytes = Buffer.from(await readFile(join(copy, path)));
      bytes.writeUInt32LE(4, 1024 + 92);
      await writeFile(join(copy, path), bytes);
      await updateArchive(copy, path);
      await rebindRoot(copy, bytes);
    },
  },
  { id: "c5b0-input-byte", expected: "root embedded input mismatch", mutate: (copy) => mutateByte(copy, "inputs/c5b0/main.mjs", 0) },
  {
    id: "execution-status-claim", expected: "execution status must remain BLOCKED", mutate: async (copy) => {
      const path = "manifests/artifact-profile.json";
      const profile = JSON.parse(await readFile(join(copy, path), "utf8"));
      profile.controlledExecutionStatus = "PASSED";
      await writeFile(join(copy, path), `${JSON.stringify(profile, null, 2)}\n`);
      await updateArchive(copy, path);
    },
  },
  {
    id: "root-runtime-insertion", expected: "governed runtime path must remain absent", mutate: async (copy) => {
      const path = "dist/runtime-root.ext4";
      const bytes = Buffer.from(await readFile(join(copy, path)));
      const dirOffset = 25 * 1024;
      const name = Buffer.from("capsule-deno-core-c5b1");
      bytes.writeUInt16LE(12, dirOffset + 16);
      bytes.writeUInt32LE(24, dirOffset + 24);
      bytes.writeUInt16LE(1000, dirOffset + 28);
      bytes[dirOffset + 30] = name.length;
      bytes[dirOffset + 31] = 1;
      name.copy(bytes, dirOffset + 32);
      await writeFile(join(copy, path), bytes);
      await updateArchive(copy, path);
      await rebindRoot(copy, bytes);
    },
  },
  { id: "closed-inventory-extra", expected: "archive inventory mismatch", mutate: (copy) => writeFile(join(copy, "unexpected.bin"), Buffer.of(0)) },
];

const retained = await (async () => JSON.parse(await readFile(join(root, "evidence/2026-08-11/mutation-dispositions.json"), "utf8")))();
if (JSON.stringify(retained.cases) !== JSON.stringify(cases.map(({ id, expected }) => ({ id, expected })))) {
  throw new Error("retained mutation table mismatch");
}

const results = [];
for (const test of cases) {
  const temporary = await mkdtemp(join(tmpdir(), "capsule-c5b1-mutation-"));
  const copy = join(temporary, "packet");
  try {
    await cp(root, copy, { recursive: true });
    await test.mutate(copy);
    let output = "";
    try {
      execFileSync(process.execPath, [verifier, copy], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      throw new Error(`${test.id}: verifier accepted mutation`);
    } catch (error) {
      output = `${error.stdout ?? ""}${error.stderr ?? ""}${error.message ?? ""}`;
      if (!output.includes(test.expected)) throw new Error(`${test.id}: expected ${test.expected}; received ${output}`);
    }
    results.push({ id: test.id, disposition: "REFUSED", oracle: test.expected });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({ result: "PASSED", cases: results }, null, 2));
