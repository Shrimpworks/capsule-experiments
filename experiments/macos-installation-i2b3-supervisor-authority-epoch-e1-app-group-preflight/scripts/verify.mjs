import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = JSON.parse(fs.readFileSync(path.join(root, "evidence/result.json"), "utf8"));

assert.equal(result.status, "PASSED");
assert.equal(result.portalRegistrationPathDisposition, "NO_GO");
assert.equal(result.identityCandidateStatus, "BLOCKED");
assert.equal(result.e1MatrixStatus, "BLOCKED");
assert.equal(result.adr0045Lifecycle, "Proposed");
assert.equal(result.portalObservation.formSubmitted, false);
assert.equal(result.portalObservation.renderedIdentifier,
  `group.${result.portalObservation.frozenIdentifier}`);
assert.equal(result.portalObservation.correctedInterpretation,
  "macos-style-identifier-does-not-require-developer-website-registration");
assert.equal(result.inputs.legacyProfile.rawProfileRetained, false);
assert.deepEqual(result.effects, {
  appGroupCreated: false,
  appIdCreated: false,
  profileCreated: false,
  profileDeleted: false,
  signingPerformed: false,
  bundleInstalled: false,
  processLaunched: false,
  coordinatorLaunched: false,
  containerAccessed: false,
  sentinelCreated: false,
  serviceRegistered: false,
  keychainAccessed: false,
  localAuthenticationInvoked: false,
  protectedRootCreated: false,
  storeOpened: false,
  runtimeStarted: false,
  guestStarted: false,
  productAdmission: false,
});

console.log(JSON.stringify({
  status: "PASSED",
  portalRegistrationPathDisposition: "NO_GO",
  identityCandidateStatus: "BLOCKED",
}));
