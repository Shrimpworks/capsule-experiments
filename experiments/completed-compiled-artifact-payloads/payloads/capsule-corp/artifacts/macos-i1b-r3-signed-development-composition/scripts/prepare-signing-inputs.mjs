#!/usr/bin/env node
import assert from "node:assert/strict";
import { copyFile, lstat, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { readExactProfile } from "./profile-metadata.mjs";

if (process.argv.length !== 6) {
  throw new Error(
    "usage: prepare-signing-inputs.mjs <Capsule.app> <broker-profile> <daemon-profile> <supervisor-profile>",
  );
}

const bundle = resolve(process.argv[2]);
assert.equal(basename(bundle), "Capsule.app", "bundle must be named Capsule.app");
assert.equal((await lstat(bundle)).isDirectory(), true, "bundle is not a directory");

const roles = [
  {
    role: "approval-broker",
    bundleIdentifier: "com.capsulecorp.capsule.broker",
    source: process.argv[3],
    destination: join(bundle, "Contents/embedded.provisionprofile"),
  },
  {
    role: "daemon",
    bundleIdentifier: "com.capsulecorp.capsule.daemon",
    source: process.argv[4],
    destination: join(
      bundle,
      "Contents/Library/Helpers/CapsuleDaemon.app/Contents/embedded.provisionprofile",
    ),
  },
  {
    role: "supervisor",
    bundleIdentifier: "com.capsulecorp.capsule.supervisor",
    source: process.argv[5],
    destination: join(
      bundle,
      "Contents/Library/Helpers/CapsuleSupervisor.app/Contents/embedded.provisionprofile",
    ),
  },
];

const profiles = [];
for (const role of roles) {
  const { path, publicMetadata } = await readExactProfile(role.source, role.bundleIdentifier);
  await copyFile(path, role.destination);
  profiles.push({ role: role.role, bundleIdentifier: role.bundleIdentifier, ...publicMetadata });
}

const output = {
  schema: "capsule.macos-installation.i1b-r3-signing-inputs/v1",
  teamIdentifier: "3DDR84M4JS",
  certificateSha1: "80A4969BCD1B3926020888094B9D812A283D3793",
  developerIdUsed: false,
  notarizationUsed: false,
  executionState: "disabled",
  profileComposition: {
    containingRoles: profiles,
    xpcLaunchers: "no-independent-profile-required-by-supported-macos-xpc-bundle-composition",
    parserChildren: "no-independent-profile",
  },
};
const outputPath = join(bundle, "Contents/Resources/CapsuleI1BR3/signing-inputs.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o644 });
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
