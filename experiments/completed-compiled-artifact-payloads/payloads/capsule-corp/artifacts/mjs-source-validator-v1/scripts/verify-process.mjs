#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const artifactDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const binary = join(artifactDir, "dist/capsule-mjs-source-validator-aarch64-apple-darwin");
const profile = readFileSync(join(artifactDir, "evidence/artifact-profile.bin"));
const profileIdentity = createHash("sha256")
  .update("capsule.source-validator.artifact-profile/v0")
  .update(Buffer.from([0]))
  .update(profile)
  .digest("hex");

async function interruptedCase(label, signal, delayMs) {
  const child = spawn(binary, [`--artifact-profile-digest=${profileIdentity}`], {
    env: {},
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  child.stdin.write(Buffer.from([0, 0]));
  const timer = setTimeout(() => child.kill(signal), delayMs);
  const outcome = await new Promise((resolveOutcome) =>
    child.on("close", (code, observedSignal) => resolveOutcome({ code, observedSignal })),
  );
  clearTimeout(timer);
  if (Buffer.concat(stdout).length !== 0 || Buffer.concat(stderr).length !== 0) {
    throw new Error(`${label}: interrupted child emitted output`);
  }
  if (outcome.code === 0 || outcome.observedSignal !== signal) {
    throw new Error(`${label}: child was not terminated by ${signal}`);
  }
}

await interruptedCase("deadline", "SIGKILL", 100);
await interruptedCase("parent-cancellation", "SIGTERM", 10);
console.log(
  JSON.stringify({ deadline: "no-result", cancellation: "no-result", admission: "V2-unproven" }),
);
