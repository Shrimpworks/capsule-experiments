#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const artifactDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const corpus = resolve(artifactDir, "../../schemas/conformance/v0/mjs-source-validator-v1");
const roles = [
  [
    "daemon",
    "CapsuleSourceValidatorDaemon.xpc/Contents/Resources/capsule-mjs-source-validator-daemon",
  ],
  [
    "approval-broker",
    "CapsuleSourceValidatorBroker.xpc/Contents/Resources/capsule-mjs-source-validator-approval-broker",
  ],
];

for (const [role, executable] of roles) {
  const binary = join(artifactDir, "dist", executable);
  const ordinary = spawnSync(binary, [], {
    input: readFileSync(join(corpus, role, "request-ordinary.bin")),
    env: {},
    maxBuffer: 1024 * 1024,
  });
  if (
    ordinary.status !== 0 ||
    ordinary.stderr.length !== 0 ||
    !ordinary.stdout.equals(readFileSync(join(corpus, role, "result-ordinary.bin")))
  ) {
    throw new Error(`${role}: exact benign known answer mismatch`);
  }

  const other = role === "daemon" ? "approval-broker" : "daemon";
  for (const input of [
    readFileSync(join(corpus, other, "request-ordinary.bin")),
    readFileSync(join(corpus, role, "reject-request-cap-plus-one.bin")),
  ]) {
    const refused = spawnSync(binary, [], { input, env: {}, maxBuffer: 1024 * 1024 });
    if (refused.status === 0 || refused.stdout.length !== 0 || refused.stderr.length !== 0) {
      throw new Error(`${role}: malformed or cross-role bytes did not refuse without output`);
    }
  }
}

const source = readFileSync(join(artifactDir, "launcher/launcher.c"), "utf8");
const acceptedKeys = [...source.matchAll(/xpc_dictionary_get_value\(event, "([^"]+)"\)/g)].map(
  (match) => match[1],
);
if (JSON.stringify(acceptedKeys) !== JSON.stringify(["request"])) {
  throw new Error(`launcher accepts an unexpected XPC key surface: ${acceptedKeys.join(",")}`);
}
for (const forbidden of [
  "MachServices",
  "application-groups",
  "Keychain",
  "NSXPC",
  "JSON",
  "argv[",
]) {
  if (source.includes(forbidden))
    throw new Error(`launcher source includes forbidden generic/authority surface: ${forbidden}`);
}

console.log("verified exact role parser known answers and closed inactive launcher surface");
