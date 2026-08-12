#!/usr/bin/env node

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const check = process.argv.includes("--check");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const predecessor = resolve(root, "../typed-guest-transport-c5b0-v19-successor");
const copies = {
  "inputs/c5b0/main.mjs": "fixtures/main.mjs",
  "inputs/c5b0/source-manifest.cbor": "fixtures/source-manifest.cbor",
  "inputs/c5b0/input.json": "fixtures/input.json",
  "inputs/c5b0/expected-completion.json": "fixtures/expected-completion.json",
  "inputs/c5b0/source.frame": "fixtures/source.frame",
  "inputs/c5b0/input.frame": "fixtures/input.frame",
  "inputs/c5b0/completion.frame": "fixtures/completion.frame",
  "inputs/c5b0/successor-profile.json": "manifests/successor-profile.json",
  "inputs/c5b0/no-run-plan.json": "manifests/no-run-plan.json",
  "inputs/c5b0/artifact-boundary.json": "manifests/artifact-boundary.json",
  "inputs/c5b0/archive-manifest.json": "manifests/archive-manifest.json",
};

for (const [destination, source] of Object.entries(copies)) {
  const expected = await readFile(join(predecessor, source));
  const target = join(root, destination);
  if (check) {
    const actual = await readFile(target);
    if (!actual.equals(expected)) throw new Error(`C5b0 input drift: ${destination}`);
  } else {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, expected);
  }
}

console.log(JSON.stringify({ result: "PASSED", inputs: Object.keys(copies).length, check }));
