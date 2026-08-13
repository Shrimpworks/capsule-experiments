#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMachine, step } from "./model.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vectors = JSON.parse(await readFile(join(root, "fixtures/state-vectors.json"), "utf8"));
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

for (const test of vectors.cases) {
  const machine = createMachine();
  for (const item of test.steps) {
    const observed = step(machine, item.event, item.facts);
    if (!equal(observed, item.expected)) {
      throw new Error(`${test.id}/${item.event}: ${JSON.stringify(observed)} != ${JSON.stringify(item.expected)}`);
    }
  }
  if (machine.state !== test.final.state || machine.durable !== test.final.durable) {
    throw new Error(`${test.id}: final state mismatch`);
  }
}

console.log(JSON.stringify({ result: "PASSED", implementation: "test-double-model", cases: vectors.cases.length, effects: "NONE" }));
