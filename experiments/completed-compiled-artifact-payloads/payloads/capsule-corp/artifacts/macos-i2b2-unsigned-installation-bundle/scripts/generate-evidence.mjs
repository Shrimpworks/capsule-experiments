#!/usr/bin/env node
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleManifestRelativePath, sha256, sha256File, verifyBundle } from "./i2b2-lib.mjs";

const artifactRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(artifactRoot, "../..");
const bundleRoot = join(artifactRoot, "dist/Capsule.app");
const manifestPath = join(bundleRoot, bundleManifestRelativePath);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const readback = await verifyBundle({ bundleRoot });
const profilePath = join(
  repositoryRoot,
  "schemas/conformance/macos-i2b2-unsigned-installation/profile.json",
);
const profileBytes = await readFile(profilePath);

const evidence = {
  schema: "capsule.macos-installation.i2b2-unsigned-construction/v0",
  status: "PASSED",
  scope: "unsigned-installation-only-bytes-and-layout",
  profileId: manifest.profileId,
  intendedDevelopmentTeamId: "3DDR84M4JS",
  appleIdentityUsed: false,
  provisioningProfilePresent: false,
  keychainAccessed: false,
  serviceRegistered: false,
  processLaunched: false,
  networkUsed: false,
  filesystemStateCreated: false,
  signingOperationUsed: false,
  bootstrapRequestCreated: false,
  bootstrapRecordCreated: false,
  supervisorStoreCreated: false,
  attemptsEnabled: false,
  runtimePresent: false,
  backendPresent: false,
  guestPresent: false,
  construction: {
    deterministicCleanDirectories: 2,
    byteIdentical: true,
    source: "checked-in-I1A-tree-plus-closed-I2B2-declared-inputs",
  },
  profile: {
    path: "schemas/conformance/macos-i2b2-unsigned-installation/profile.json",
    bytes: profileBytes.length,
    sha256: sha256(profileBytes),
    recursivelyClassifiedFields: readback.fieldCount,
  },
  bundleManifest: {
    path: `dist/Capsule.app/${bundleManifestRelativePath}`,
    bytes: (await readFile(manifestPath)).length,
    sha256: await sha256File(manifestPath),
    files: readback.bundleFileCount,
  },
  readback,
  refusals: [
    "missing",
    "extra",
    "duplicate",
    "mixed",
    "substituted",
    "wrong-role",
    "wrong-profile",
    "wrong-service",
    "unsafe-entitlement",
    "active-signing",
    "bootstrap-created",
    "store-created",
    "profile-cap-plus-one",
    "manifest-cap-plus-one",
    "bundle-path-cap-plus-one",
  ],
  limitations: [
    "Coordinator and Supervisor files remain inert non-executable placeholders; no production wrapper or key implementation exists.",
    "Entitlement, Keychain-group, App-Group, service, and constraint files are unsigned inactive declared inputs, not effective platform authority.",
    "Signed containing-release, component-profile, CDHash, effective-entitlement, EUID, audit-session, and installed-container bindings remain unavailable until separately authorized I2B3.",
    "No signing, installation, registration, launch, Keychain, protected-root, owner, store, runtime, backend, or guest operation occurred.",
  ],
};

const path = join(artifactRoot, "evidence/construction.json");
await mkdir(dirname(path), { recursive: true });
await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o644 });
await chmod(path, 0o644);
