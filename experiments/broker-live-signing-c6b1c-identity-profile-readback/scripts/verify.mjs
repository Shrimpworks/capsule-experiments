#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedFiles = [
  "HANDOFF.md",
  "README.md",
  "RESULTS.md",
  "evidence/portal-receipt.json",
  "scripts/verify.mjs",
];

async function files(directory = root, prefix = "") {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      result.push(...(await files(resolve(directory, entry.name), relative)));
    } else {
      assert.equal(entry.isFile(), true, `${relative}: non-file inventory entry refused`);
      result.push(relative);
    }
  }
  return result.sort();
}

assert.deepEqual(await files(), expectedFiles, "closed experiment inventory mismatch");

const receipt = JSON.parse(
  await readFile(resolve(root, "evidence/portal-receipt.json"), "utf8"),
);
assert.equal(receipt.objectType, "capsule.c6b1c.identity-profile-portal-receipt");
assert.equal(receipt.objectVersion, 0);
assert.deepEqual(receipt.status, {
  portalResourceCreation: "PASSED",
  completeIdentityProfileReadback: "BLOCKED",
  installedSigning: "BLOCKED",
  productAdmission: "BLOCKED",
});
assert.equal(
  receipt.immutableInputs.capsuleExperimentsBaseCommit,
  "3d7bd46352506bf6018286749c2c85a3e2f683df",
);
assert.equal(
  receipt.immutableInputs.capsuleCorpCommit,
  "16fb810b97e7ff2a157a251ae4dc8023dcfc01b4",
);
assert.equal(
  receipt.immutableInputs.brokerHarnessMergeCommit,
  "4a2447d4bd0e03132dc616e608031ca313630cdd",
);
assert.equal(
  receipt.immutableInputs.brokerHarnessCompositeSha256,
  "0f07954b18fee3db90c440522e4df6f131ed1b2e889bb6f14a746cf43b5d68f8",
);
assert.equal(
  receipt.immutableInputs.supervisorSeamReferenceCommit,
  "067fe2beb40361bb714507cab1331004e0a656fa",
);
assert.deepEqual(receipt.environment, {
  ownerLabel: "dsteele-shrimp-mbp18-4-01",
  macOSVersion: "26.5.2",
  macOSBuild: "25F84",
  architecture: "arm64",
  xcodeVersion: "26.6",
  xcodeBuild: "17F113",
  sdkVersion: "26.5",
  appleClangVersion: "21.0.0",
  euid: 501,
  bootstrapDomain: "gui/501",
  evidenceLeaf:
    "/Users/dsteele/CapsuleEvidence/c6b1c-profile-dsteele-shrimp-mbp18-4-01",
  evidenceLeafOwner: 501,
  evidenceLeafMode: "0700",
  evidenceLeafEntriesAtStop: 0,
});
assert.equal(receipt.appleDevelopmentIdentity.teamIdentifier, "3DDR84M4JS");
assert.equal(receipt.appleDevelopmentIdentity.portalCertificateRecord, "3SAN55Q9AW");
assert.equal(
  receipt.appleDevelopmentIdentity.sha1,
  "80A4969BCD1B3926020888094B9D812A283D3793",
);
assert.equal(
  receipt.appleDevelopmentIdentity.sha256,
  "D3E9FBDDBC342F747C3649B5A6FFB307A575827404E02D638C11B6B795A09629",
);
assert.equal(receipt.appleDevelopmentIdentity.developerIdSelected, false);
assert.deepEqual(receipt.portalResources.appId, {
  bundleIdentifier: "com.capsulecorp.capsule.broker.c6b1",
  applicationIdentifier: "3DDR84M4JS.com.capsulecorp.capsule.broker.c6b1",
  description: "Capsule C6b1 Broker Evidence epoch 7",
  createdByThisRun: true,
  optionalCapabilitiesSelected: [],
});
assert.equal(
  receipt.portalResources.profile.name,
  "Capsule C6b1 Broker Evidence macOS Development epoch 7",
);
assert.equal(receipt.portalResources.profile.portalRecord, "XT8MS38HWV");
assert.equal(receipt.portalResources.profile.type, "macOS App Development");
assert.deepEqual(receipt.portalResources.profile.certificateRecords, ["3SAN55Q9AW"]);
assert.equal(receipt.portalResources.profile.registeredDeviceCount, 1);
assert.equal(receipt.portalResources.profile.expirationDate, "2027-08-11");
assert.equal(receipt.portalResources.profile.leftIntact, true);
assert.deepEqual(receipt.requestedSignedProjection.keychainAccessGroups, [
  "3DDR84M4JS.com.capsulecorp.capsule.broker.approval.epoch-7",
]);
assert.equal(receipt.requestedSignedProjection.observedInLocalProfile, false);
assert.equal(receipt.requestedSignedProjection.observedInSignedArtifact, false);
for (const value of Object.values(receipt.zeroActivation)) assert.equal(value, false);
for (const value of Object.values(receipt.privacy)) assert.equal(value, false);
assert.equal(receipt.stop.promptObserved, false);
assert.equal(receipt.stop.profileBytesRetained, false);
assert.equal(receipt.stop.codeSigningPerformed, false);
assert.equal(receipt.stop.installPerformed, false);
assert.equal(receipt.stop.launchPerformed, false);

for (const document of ["README.md", "RESULTS.md", "HANDOFF.md"]) {
  const text = await readFile(resolve(root, document), "utf8");
  assert.match(text, /`BLOCKED`/);
  assert.match(text, /XT8MS38HWV/);
  assert.match(text, /do not|Do not|must not|Must not/);
}

process.stdout.write("C6b1c privacy-minimized blocked receipt: PASS\n");
