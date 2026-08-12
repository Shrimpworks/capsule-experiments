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

async function mutateBytes(copy, path, offset) {
  const bytes = Buffer.from(await readFile(join(copy, path)));
  bytes[offset] ^= 1;
  await writeFile(join(copy, path), bytes);
  await updateArchive(copy, path);
}

const cases = [
  {
    id: "source-byte",
    expected: "source digest mismatch",
    mutate: (copy) => mutateBytes(copy, "fixtures/main.mjs", 0),
  },
  {
    id: "frame-plan-binding",
    expected: "frame plan binding mismatch",
    mutate: (copy) => mutateBytes(copy, "fixtures/source.frame", 48),
  },
  {
    id: "profile-contract-removal",
    expected: "profile contract set mismatch",
    mutate: async (copy) => {
      const path = "manifests/successor-profile.json";
      const profile = JSON.parse(await readFile(join(copy, path), "utf8"));
      delete profile.contractIdentities.controller;
      await writeFile(join(copy, path), `${JSON.stringify(profile, null, 2)}\n`);
      await updateArchive(copy, path);
    },
  },
  {
    id: "unavailable-artifact-claim",
    expected: "executable boundary must remain null",
    mutate: async (copy) => {
      const path = "manifests/artifact-boundary.json";
      const boundary = JSON.parse(await readFile(join(copy, path), "utf8"));
      boundary.unavailableExecutableSuccessorIdentities[0].bytes = 1;
      boundary.unavailableExecutableSuccessorIdentities[0].sha256 = "00".repeat(32);
      await writeFile(join(copy, path), `${JSON.stringify(boundary, null, 2)}\n`);
      await updateArchive(copy, path);
    },
  },
  {
    id: "c5a-baseline-byte",
    expected: "C5a retained input mismatch",
    mutate: (copy) => mutateBytes(copy, "inputs/c5a/accept-input-ordinary.bin", 0),
  },
  {
    id: "closed-inventory-extra",
    expected: "archive inventory mismatch",
    mutate: (copy) => writeFile(join(copy, "unexpected.bin"), Buffer.of(0)),
  },
];

const retained = JSON.parse(
  await readFile(join(root, "evidence/2026-08-11/mutation-dispositions.json"), "utf8"),
);
if (JSON.stringify(retained.cases) !== JSON.stringify(cases.map(({ id, expected }) => ({ id, expected })))) {
  throw new Error("retained mutation table mismatch");
}

const results = [];
for (const test of cases) {
  const temporary = await mkdtemp(join(tmpdir(), "capsule-c5b0-mutation-"));
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
      if (!output.includes(test.expected)) {
        throw new Error(`${test.id}: expected ${test.expected}; received ${output}`);
      }
    }
    results.push({ id: test.id, disposition: "REFUSED", oracle: test.expected });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({ result: "PASSED", cases: results }, null, 2));
