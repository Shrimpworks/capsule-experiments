#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyCandidate } from "./verify-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = resolve(root, "..", "..");
for (const predecessor of [
  "typed-guest-transport-c5b9-immutable-no-run-composite",
  "typed-guest-transport-c5b-controlled-harness-preflight",
]) {
  execFileSync(process.execPath, [join(repository, "experiments", predecessor, "scripts/verify.mjs")], {
    cwd: repository,
    stdio: "pipe",
  });
}
console.log(JSON.stringify(verifyCandidate(root, repository), null, 2));
console.log("No native candidate artifact, dylib, HVF path, runner, VM, guest, host effect, network, credential, or product consumer was loaded or invoked.");
