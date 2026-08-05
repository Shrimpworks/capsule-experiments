#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleManifestRelativePath, sha256File, verifyBundle } from "./i1a-lib.mjs";

const artifactRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundleRoot = join(artifactRoot, "dist/Capsule.app");
const manifestPath = join(bundleRoot, bundleManifestRelativePath);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const verification = await verifyBundle({ bundleRoot, expectedManifestSha256: "" });

function commandOutput(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function codeIdentity(path) {
  const result = spawnSync("/usr/bin/codesign", ["-dv", "--verbose=4", path], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`codesign display failed for ${path}: ${result.stderr}`);
  }
  const output = `${result.stdout}\n${result.stderr}`;
  if (!output.includes("Signature=adhoc") || !output.includes("TeamIdentifier=not set")) {
    throw new Error(`unexpected Apple identity posture for ${path}: ${output}`);
  }
  return {
    signature: "linker-adhoc-no-apple-identity",
    teamIdentifier: null,
    codesignDisplayOnly: true,
    signingOperationUsed: false,
  };
}

const brokerPath = join(bundleRoot, "Contents/MacOS/Capsule");
const construction = {
  schema: "capsule.macos-installation.i1a-unsigned-construction/v1",
  status: "PASSED",
  scope: "unsigned-bytes-and-layout-only",
  profileId: manifest.profileId,
  intendedDevelopmentTeamId: "3DDR84M4JS",
  intendedTeamState: "inactive-metadata-only",
  appleIdentityUsed: false,
  provisioningProfilePresent: false,
  keychainAccessed: false,
  serviceRegistered: false,
  processLaunched: false,
  networkUsed: false,
  executionState: "disabled",
  activation: {
    decision: "refuse",
    reason: "signing-profile-inactive",
  },
  build: {
    target: "arm64-apple-macos14.0",
    sdkPathRedactedToBasename: commandOutput("/usr/bin/basename", [
      commandOutput("/usr/bin/xcrun", ["--sdk", "macosx", "--show-sdk-path"]),
    ]),
    swiftc: commandOutput("/usr/bin/xcrun", ["--sdk", "macosx", "swiftc", "--version"]),
    deterministicCleanDirectories: 2,
    byteIdentical: true,
    network: "not-used",
  },
  brokerExecutable: {
    path: "dist/Capsule.app/Contents/MacOS/Capsule",
    bytes: (await readFile(brokerPath)).length,
    sha256: await sha256File(brokerPath),
    identity: codeIdentity(brokerPath),
  },
  bundleManifest: {
    path: `dist/Capsule.app/${bundleManifestRelativePath}`,
    bytes: (await readFile(manifestPath)).length,
    sha256: await sha256File(manifestPath),
    files: manifest.files.length + 1,
  },
  readback: verification,
  placeholders: [
    {
      role: "capsule.role.agent-daemon/v0",
      path: "dist/Capsule.app/Contents/Library/Helpers/CapsuleDaemon.app/Contents/MacOS/CapsuleDaemon",
      executable: false,
      activation: "refuse",
      guestCreation: "impossible-no-program-bytes",
    },
    {
      role: "capsule.role.execution-supervisor/v0",
      path: "dist/Capsule.app/Contents/Library/Helpers/CapsuleSupervisor.app/Contents/MacOS/CapsuleSupervisor",
      executable: false,
      activation: "refuse",
      guestCreation: "impossible-no-program-bytes",
    },
  ],
  limitations: [
    "No Apple identity, provisioning profile, TeamIdentifier, CDHash enrollment, or effective signed-entitlement evidence exists.",
    "No application, service, launcher, parser, runtime, backend, or guest was installed, registered, or launched.",
    "Private XPC and SMAppService reachability remain unproved until separately authorized I1B/R3 installed evidence.",
    "The daemon and Supervisor files are inert non-executable test-only placeholders, not product binaries.",
  ],
};

const evidencePath = join(artifactRoot, "evidence/construction.json");
await mkdir(dirname(evidencePath), { recursive: true });
await writeFile(evidencePath, `${JSON.stringify(construction, null, 2)}\n`, { mode: 0o644 });
await chmod(evidencePath, 0o644);
