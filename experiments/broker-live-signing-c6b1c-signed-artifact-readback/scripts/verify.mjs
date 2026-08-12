import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = JSON.parse(fs.readFileSync(path.join(root, "evidence/result.json"), "utf8"));
const sha256 = (relative) => crypto.createHash("sha256")
  .update(fs.readFileSync(path.join(root, relative))).digest("hex");

assert.equal(result.status, "PASSED");
assert.equal(result.profile.portalId, "XT8MS38HWV");
assert.deepEqual(result.profile.keychainAllowlist, ["3DDR84M4JS.*"]);
assert.equal(result.profile.rawProfileRetained, false);
assert.equal(result.profile.embeddedInArtifact, false);
assert.equal(result.signingIdentity.sha1, "80A4969BCD1B3926020888094B9D812A283D3793");
assert.deepEqual(result.artifact.signedEntitlements, {
  "com.apple.security.app-sandbox": true,
  "keychain-access-groups": [
    "3DDR84M4JS.com.capsulecorp.capsule.broker.approval.epoch-7",
  ],
});
assert.equal(sha256("artifacts/CapsuleC6b1BrokerEvidence.app/Contents/Info.plist"),
  result.artifact.infoPlistSha256);
assert.equal(sha256("artifacts/CapsuleC6b1BrokerEvidence.app/Contents/MacOS/CapsuleC6b1BrokerEvidence"),
  result.artifact.signedExecutableSha256);
assert.equal(sha256("artifacts/CapsuleC6b1BrokerEvidence.app/Contents/_CodeSignature/CodeResources"),
  result.artifact.codeResourcesSha256);
assert.deepEqual(result.effects, {
  portalResourceCreated: false,
  portalResourceDeleted: false,
  profileBroadened: false,
  artifactSigned: true,
  profileEmbedded: false,
  appInstalled: false,
  appLaunched: false,
  keychainItemAccessed: false,
  localAuthenticationInvoked: false,
  serviceRegistered: false,
  supervisorConsumerActivated: false,
  runtimeStarted: false,
  guestStarted: false,
  productAdmission: false,
});

console.log(JSON.stringify({ status: "PASSED", signedExecutableSha256: result.artifact.signedExecutableSha256 }));
