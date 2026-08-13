#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exactProfile, translate } from "./model.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vectors = JSON.parse(await readFile(join(root, "fixtures/action-vectors.json"), "utf8"));
for (const test of vectors.cases) {
  const profile = test.profile === "exact" ? exactProfile :
    test.profile === "absent" ? null : { ...exactProfile, sourceFd: 4 };
  const observed = translate(profile, test.mask);
  if (observed.refusal !== test.refusal || JSON.stringify(observed.effects) !== JSON.stringify(test.effects)) {
    throw new Error(`${test.id}: model mismatch`);
  }
  if (observed.executionAuthorized !== undefined && observed.executionAuthorized !== false) {
    throw new Error(`${test.id}: translation authorized execution`);
  }
}
console.log(JSON.stringify({ result: "PASSED", cases: vectors.cases.length, executionAuthorized: false }));
