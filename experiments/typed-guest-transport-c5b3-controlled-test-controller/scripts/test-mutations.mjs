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
  if (!entry) throw new Error(`missing archive entry: ${path}`);
  entry.bytes = bytes.length;
  entry.sha256 = sha256(bytes);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function rewriteJson(copy, path, mutate) {
  const value = JSON.parse(await readFile(join(copy, path), "utf8"));
  mutate(value);
  await writeFile(join(copy, path), `${JSON.stringify(value, null, 2)}\n`);
  await updateArchive(copy, path);
}

async function rebindContract(copy) {
  const contractPath = "contracts/controller-contract.json";
  const bytes = await readFile(join(copy, contractPath));
  await rewriteJson(copy, "manifests/controller-profile.json", (profile) => {
    profile.controller.contract.bytes = bytes.length;
    profile.controller.contract.sha256 = sha256(bytes);
  });
}

const cases = [
  {
    id: "controller-object-byte", expected: "controller build identity mismatch", mutate: async (copy) => {
      const path = "dist/controller-core-a.o";
      const bytes = Buffer.from(await readFile(join(copy, path)));
      bytes[256] ^= 1;
      await writeFile(join(copy, path), bytes);
      await updateArchive(copy, path);
    }
  },
  {
    id: "controller-source-byte", expected: "controller source identity mismatch", mutate: async (copy) => {
      const path = "source/controller_core.c";
      const bytes = Buffer.from(await readFile(join(copy, path)));
      bytes[64] ^= 1;
      await writeFile(join(copy, path), bytes);
      await updateArchive(copy, path);
    }
  },
  {
    id: "invent-entry-point", expected: "controller must remain non-executable", mutate: (copy) => rewriteJson(copy, "manifests/controller-profile.json", (profile) => { profile.controller.entryPointPresent = true; profile.controller.executable = true; })
  },
  {
    id: "invent-authorization-profile", expected: "authorization profile must remain absent", mutate: (copy) => rewriteJson(copy, "manifests/controller-profile.json", (profile) => { profile.externalImmutablePrerequisites.exactRunAuthorizationProfile.present = true; profile.externalImmutablePrerequisites.exactRunAuthorizationProfile.digest = "0".repeat(64); })
  },
  {
    id: "invent-runtime-binding", expected: "governed runtime prerequisite mismatch", mutate: (copy) => rewriteJson(copy, "manifests/controller-profile.json", (profile) => { profile.externalImmutablePrerequisites.governedDenoCore.status = "BOUND"; profile.externalImmutablePrerequisites.governedDenoCore.bytesPresent = true; })
  },
  {
    id: "response-loss-redrive", expected: "response-loss oracle mismatch", mutate: (copy) => rewriteJson(copy, "fixtures/state-vectors.json", (vectors) => { vectors.cases.find(({ id }) => id === "response-loss-after-durable-commit").final.durable = false; })
  },
  {
    id: "remove-terminal-absence", expected: "terminal required facts mismatch", mutate: async (copy) => {
      await rewriteJson(copy, "contracts/controller-contract.json", (contract) => { contract.terminalJoinRequiredFacts = contract.terminalJoinRequiredFacts.filter((fact) => fact !== "RUNNER_ABSENT"); });
      await rebindContract(copy);
    }
  },
  {
    id: "fixed-path-widening", expected: "fixed path contract mismatch", mutate: async (copy) => {
      await rewriteJson(copy, "contracts/controller-contract.json", (contract) => { contract.fixedPaths.hostRunner = "/tmp/capsule-host-runner"; });
      await rebindContract(copy);
    }
  },
  {
    id: "closed-inventory-extra", expected: "archive inventory mismatch", mutate: (copy) => writeFile(join(copy, "unexpected.bin"), Buffer.of(0))
  }
];

const retained = JSON.parse(await readFile(join(root, "evidence/2026-08-13/mutation-dispositions.json"), "utf8"));
if (JSON.stringify(retained.cases) !== JSON.stringify(cases.map(({ id, expected }) => ({ id, expected })))) throw new Error("retained mutation inventory mismatch");

const results = [];
for (const test of cases) {
  const temporary = await mkdtemp(join(tmpdir(), "capsule-c5b3-mutation-"));
  const copy = join(temporary, "packet");
  try {
    await cp(root, copy, { recursive: true });
    await test.mutate(copy);
    let output = "";
    try {
      execFileSync(process.execPath, [verifier, copy], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      throw new Error(`${test.id}: mutation was accepted`);
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
