import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedCapsuleCommit = "88f3a2c1f968b1aa604ce14a2db4389822e5b193";
const expectedArchiveBase = "8ae2cd1cbebdff403fe354da15eac4e27b461765";
const jsonCap = 65_536;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactKeys(value, expected, label) {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} keys changed`);
}

async function readJson(rel, cap = jsonCap) {
  const bytes = await readFile(resolve(root, rel));
  assert.ok(bytes.length <= cap, `${rel} raw cap exceeded`);
  return JSON.parse(bytes);
}

async function inventory(directory) {
  const entries = [];
  for (const name of (await readdir(directory)).sort()) {
    const path = resolve(directory, name);
    const rel = relative(root, path);
    if (rel === "manifest.json") continue;
    const stat = await lstat(path);
    assert.equal(stat.isSymbolicLink(), false, `symbolic link refused: ${rel}`);
    if (stat.isDirectory()) {
      entries.push(...(await inventory(path)));
      continue;
    }
    assert.equal(stat.isFile(), true, `non-regular entry refused: ${rel}`);
    const bytes = await readFile(path);
    entries.push({
      path: rel,
      bytes: bytes.length,
      mode: (stat.mode & 0o777).toString(8).padStart(4, "0"),
      sha256: sha256(bytes),
    });
  }
  return entries;
}

function assertNoHostPath(value, label = "descriptor") {
  if (typeof value === "string") {
    assert.equal(value.startsWith("/"), false, `${label} contains absolute path`);
    assert.equal(value.startsWith("~/"), false, `${label} contains home path`);
    assert.equal(value.includes(".."), false, `${label} contains parent traversal`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoHostPath(item, `${label}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      assertNoHostPath(item, `${label}.${key}`);
    }
  }
}

function plistJson(rel) {
  return JSON.parse(
    execFileSync("plutil", ["-convert", "json", "-o", "-", resolve(root, rel)], {
      encoding: "utf8",
    }),
  );
}

function assertRequestedEntitlements(rel, expectedGroups, expectedKeychain) {
  const value = plistJson(rel);
  exactKeys(
    value,
    ["com.apple.security.app-sandbox", "com.apple.security.application-groups", "keychain-access-groups"],
    rel,
  );
  assert.equal(value["com.apple.security.app-sandbox"], true);
  assert.deepEqual(value["com.apple.security.application-groups"], expectedGroups);
  assert.deepEqual(value["keychain-access-groups"], expectedKeychain);
  for (const prohibited of [
    "com.apple.security.network.client",
    "com.apple.security.network.server",
    "com.apple.security.get-task-allow",
    "com.apple.security.cs.allow-jit",
    "com.apple.security.cs.allow-unsigned-executable-memory",
    "com.apple.security.cs.disable-library-validation",
  ]) {
    assert.equal(Object.hasOwn(value, prohibited), false, `${rel} contains ${prohibited}`);
  }
}

const manifest = await readJson("manifest.json", 262_144);
exactKeys(
  manifest,
  [
    "schema",
    "capsuleInputCommit",
    "archiveBaseCommit",
    "scope",
    "excludedFromFileInventory",
    "maximumFiles",
    "fileCount",
    "files",
  ],
  "manifest",
);
assert.equal(manifest.schema, "capsule.experiment.supervisor-authority-epoch-e0-manifest/v0");
assert.equal(manifest.capsuleInputCommit, expectedCapsuleCommit);
assert.equal(manifest.archiveBaseCommit, expectedArchiveBase);
assert.equal(manifest.scope, "deterministic-unsigned-no-launch-e0-construction");
assert.deepEqual(manifest.excludedFromFileInventory, ["manifest.json"]);
assert.equal(manifest.maximumFiles, 64);
assert.ok(manifest.fileCount <= manifest.maximumFiles);
const observedFiles = await inventory(root);
assert.equal(observedFiles.length, manifest.fileCount, "closed file count changed");
assert.deepEqual(observedFiles, manifest.files, "closed file inventory changed");

const packet = await readJson("fixtures/e0-packet.json");
exactKeys(
  packet,
  [
    "schema",
    "capsuleInput",
    "authority",
    "legacy",
    "sentinels",
    "bundleInventory",
    "e1Cases",
    "excludedE1Cases",
    "constructionBoundary",
  ],
  "packet",
);
assert.equal(packet.schema, "capsule.experiment.supervisor-authority-epoch-e0-packet/v0");
assert.deepEqual(packet.capsuleInput, {
  repository: "Shrimpworks/capsule-corp",
  commit: expectedCapsuleCommit,
  packetPath: "docs/MACOS_INSTALLATION_I2B3_SUPERVISOR_AUTHORITY_EPOCH_EXPERIMENT.md",
  packetSha256: "5fa48de7f83c7dcc68cdf393bbff2d08ebef8badfc0e0975788e51c4de6ddc0d",
  adrPath: "docs/adr/0045-select-versioned-supervisor-authority-epochs.md",
  adrSha256: "43cd022cf8d44c1ebf8f606d58f9da89ffbf561bfcfddc43ad56aa542402ef1a",
  adrLifecycle: "Proposed",
});
assert.deepEqual(packet.authority, {
  sequence: 1,
  teamIdentifier: "3DDR84M4JS",
  channel: "apple-development-experiment-candidate",
  supervisorSigningIdentifier: "com.capsulecorp.capsule.supervisor.authority-e1",
  coordinatorSigningIdentifier: "com.capsulecorp.capsule.trust-bootstrap.authority-e1",
  launchAgentLabel: "com.capsulecorp.capsule.supervisor.authority-e1",
  bootstrapApplicationGroup: "3DDR84M4JS.com.capsulecorp.capsule.bootstrap.authority-e1",
  bootstrapMachService: "3DDR84M4JS.com.capsulecorp.capsule.bootstrap.authority-e1.supervisor",
  coordinatorInstallationRootGroup:
    "3DDR84M4JS.com.capsulecorp.capsule.trust-bootstrap.installation-root.authority-e1",
  supervisorBootstrapAnchorGroup:
    "3DDR84M4JS.com.capsulecorp.capsule.supervisor.bootstrap-anchor.authority-e1",
  supervisorEvidenceGroup:
    "3DDR84M4JS.com.capsulecorp.capsule.supervisor.evidence.authority-e1",
});
assert.deepEqual(packet.legacy, {
  supervisorSigningIdentifier: "com.capsulecorp.capsule.supervisor",
  coordinatorSigningIdentifier: "com.capsulecorp.capsule.trust-bootstrap.v1",
  selectedNegativeProfile: {
    name: "Capsule I2B3 Supervisor Bootstrap Development 3DDR",
    uuid: "c45a058b-ffdd-4a6b-bd8c-d746772a2702",
    cmsSha256: "964f79980edf22a7280fe19e52893a1e40b0a8639d5bbe3d5dc8fdfada9c6c76",
    rawProfileRetained: false,
  },
  classification: "legacy-residue-not-authority-epoch-zero",
});
assert.equal(Buffer.byteLength(packet.sentinels.current.contentUtf8), 20);
assert.equal(sha256(Buffer.from(packet.sentinels.current.contentUtf8)), packet.sentinels.current.sha256);
assert.equal(Buffer.byteLength(packet.sentinels.legacy.contentUtf8), 13);
assert.equal(sha256(Buffer.from(packet.sentinels.legacy.contentUtf8)), packet.sentinels.legacy.sha256);
assert.deepEqual(packet.e1Cases, [
  "E1-01", "E1-02", "E1-03", "E1-04", "E1-05", "E1-06", "E1-07",
  "E1-08", "E1-09", "E1-10", "E1-11", "E1-12", "E1-14", "E1-15",
]);
assert.deepEqual(packet.excludedE1Cases, ["E1-13"]);
assert.equal(packet.bundleInventory.length, 3);
assert.deepEqual(packet.bundleInventory.map((item) => item.role), [
  "current-supervisor-probe",
  "legacy-supervisor-probe",
  "current-coordinator-no-launch",
]);
assert.ok(packet.bundleInventory.every((item) => item.launchAllowedInE0 === false));
exactKeys(
  packet.constructionBoundary,
  [
    "portalAccessed",
    "signingIdentityEnumerated",
    "signingPerformed",
    "profileProvisioned",
    "processLaunched",
    "containerAccessed",
    "keychainAccessed",
    "serviceRegistered",
    "runtimeStarted",
    "guestStarted",
    "productAdmission",
  ],
  "construction boundary",
);
assert.ok(Object.values(packet.constructionBoundary).every((value) => value === false));

const descriptor = await readJson("descriptors/supervisor-authority-descriptor-v0.input.json");
exactKeys(
  descriptor,
  [
    "schema", "state", "activationDecision", "objectType", "objectVersion",
    "authoritySequence", "transitionReason", "predecessor", "installation", "supervisor",
    "coordinator", "launchAgent", "groups", "protocolBindings", "unresolvedUntilAuthorizedE1",
  ],
  "descriptor",
);
assert.equal(descriptor.schema, "capsule.experiment.supervisor-authority-descriptor-v0-input/v0");
assert.equal(descriptor.state, "inactive-construction-input");
assert.equal(descriptor.activationDecision, "refuse-unresolved-e1-inputs");
assert.equal(descriptor.objectVersion, 0);
assert.equal(descriptor.authoritySequence, 1);
assert.deepEqual(descriptor.predecessor, {
  state: "initial-install-absence-value-not-selected",
  digest: null,
});
assert.deepEqual(descriptor.installation, {
  installationId: null,
  installationTrustEpochDigest: null,
  releaseManifestDigest: null,
});
exactKeys(
  descriptor.supervisor,
  [
    "appId", "bundleIdentifier", "signingIdentifier", "teamIdentifier", "channel",
    "allowedCdHashes", "effectiveEntitlementDigest", "provisioningProfile", "privateContainer",
  ],
  "descriptor supervisor",
);
assert.equal(descriptor.supervisor.teamIdentifier, packet.authority.teamIdentifier);
assert.equal(descriptor.supervisor.appId, packet.authority.supervisorSigningIdentifier);
assert.equal(descriptor.supervisor.signingIdentifier, packet.authority.supervisorSigningIdentifier);
assert.deepEqual(descriptor.supervisor.allowedCdHashes, []);
assert.equal(descriptor.supervisor.effectiveEntitlementDigest, null);
assert.deepEqual(descriptor.supervisor.provisioningProfile, { uuid: null, cmsSha256: null });
assert.deepEqual(descriptor.supervisor.privateContainer, {
  selection: "platform-api-only",
  urlDigest: null,
  pathStored: false,
});
assert.equal(descriptor.coordinator.appId, packet.authority.coordinatorSigningIdentifier);
assert.equal(descriptor.coordinator.signingIdentifier, packet.authority.coordinatorSigningIdentifier);
assert.deepEqual(descriptor.coordinator.provisioningProfile, { uuid: null, cmsSha256: null });
assert.equal(descriptor.coordinator.peerRequirementDigest, null);
assert.deepEqual(descriptor.launchAgent, {
  label: packet.authority.launchAgentLabel,
  plistRelativePath:
    "Contents/Library/LaunchAgents/com.capsulecorp.capsule.supervisor.authority-e1.plist",
  bundleProgram:
    "Contents/Library/Helpers/CapsuleSupervisorAuthorityE1Probe.app/Contents/MacOS/CapsuleSupervisorAuthorityE1Probe",
  machService: packet.authority.bootstrapMachService,
  registered: false,
});
assert.deepEqual(descriptor.groups, {
  bootstrapApplicationGroup: packet.authority.bootstrapApplicationGroup,
  coordinatorInstallationRoot: packet.authority.coordinatorInstallationRootGroup,
  supervisorBootstrapAnchor: packet.authority.supervisorBootstrapAnchorGroup,
  supervisorEvidence: packet.authority.supervisorEvidenceGroup,
});
assert.equal(descriptor.protocolBindings.createOpenMigrationDisposition, "unselected-blocked");
for (const [key, value] of Object.entries(descriptor.protocolBindings)) {
  if (key !== "createOpenMigrationDisposition") assert.equal(value, null, `${key} must be unresolved`);
}
assertNoHostPath(descriptor);

for (const [rel, component, bundleIdentifier] of [
  ["profile-requests/current-supervisor.json", "current-supervisor-authority-e1", packet.authority.supervisorSigningIdentifier],
  ["profile-requests/current-coordinator.json", "current-coordinator-authority-e1", packet.authority.coordinatorSigningIdentifier],
]) {
  const profile = await readJson(rel);
  exactKeys(
    profile,
    [
      "schema", "component", "teamIdentifier", "appId", "bundleIdentifier", "profileType",
      "entitlementsPath", "deviceBinding", "certificateFingerprint", "profileName", "profileUuid",
      "profileCmsSha256", "state",
    ],
    rel,
  );
  assert.equal(profile.component, component);
  assert.equal(profile.teamIdentifier, packet.authority.teamIdentifier);
  assert.equal(profile.appId, bundleIdentifier);
  assert.equal(profile.bundleIdentifier, bundleIdentifier);
  assert.equal(profile.state, "unprovisioned-no-portal-access");
  for (const key of [
    "deviceBinding", "certificateFingerprint", "profileName", "profileUuid", "profileCmsSha256",
  ]) assert.equal(profile[key], null, `${rel} ${key} must remain unresolved`);
  assertNoHostPath(profile, rel);
}
const legacyProfile = await readJson("profile-requests/legacy-supervisor.json");
assert.equal(legacyProfile.profileUuid, packet.legacy.selectedNegativeProfile.uuid);
assert.equal(legacyProfile.profileCmsSha256, packet.legacy.selectedNegativeProfile.cmsSha256);
assert.equal(legacyProfile.rawProfilePresent, false);

assertRequestedEntitlements(
  "entitlements/current-supervisor.plist",
  [packet.authority.bootstrapApplicationGroup],
  [packet.authority.supervisorBootstrapAnchorGroup, packet.authority.supervisorEvidenceGroup],
);
assertRequestedEntitlements(
  "entitlements/coordinator.plist",
  [packet.authority.bootstrapApplicationGroup],
  [packet.authority.coordinatorInstallationRootGroup],
);
assertRequestedEntitlements(
  "entitlements/legacy-supervisor.plist",
  ["3DDR84M4JS.com.capsulecorp.capsule.bootstrap.v0"],
  ["3DDR84M4JS.com.capsulecorp.capsule.supervisor.bootstrap-anchor.epoch-1"],
);

const launchAgent = plistJson("service-management/current-supervisor-LaunchAgent.plist");
exactKeys(
  launchAgent,
  ["Label", "BundleProgram", "Disabled", "KeepAlive", "RunAtLoad", "LimitLoadToSessionType", "MachServices"],
  "LaunchAgent",
);
assert.equal(launchAgent.Label, packet.authority.launchAgentLabel);
assert.equal(launchAgent.BundleProgram, descriptor.launchAgent.bundleProgram);
assert.equal(launchAgent.Disabled, true);
assert.equal(launchAgent.KeepAlive, false);
assert.equal(launchAgent.RunAtLoad, false);
assert.equal(launchAgent.LimitLoadToSessionType, "Aqua");
assert.deepEqual(launchAgent.MachServices, { [packet.authority.bootstrapMachService]: false });

const bundleChecks = [
  {
    root: "dist/CapsuleSupervisorAuthorityE1Probe.app",
    info: "templates/current-supervisor-Info.plist",
    entitlements: "entitlements/current-supervisor.plist",
    executable: "CapsuleSupervisorAuthorityE1Probe",
    strings: [packet.authority.supervisorSigningIdentifier, "current-supervisor-authority-e1", "current-authority-e1"],
  },
  {
    root: "dist/CapsuleSupervisorLegacyProbe.app",
    info: "templates/legacy-supervisor-Info.plist",
    entitlements: "entitlements/legacy-supervisor.plist",
    executable: "CapsuleSupervisorLegacyProbe",
    strings: [packet.legacy.supervisorSigningIdentifier, "legacy-stable-supervisor", "legacy-stable"],
  },
  {
    root: "dist/CapsuleTrustBootstrapAuthorityE1.xpc",
    info: "templates/coordinator-Info.plist",
    entitlements: "entitlements/coordinator.plist",
    executable: "CapsuleTrustBootstrapAuthorityE1",
    strings: ["Capsule E0 Coordinator fixture is no-launch; execution refused."],
  },
];

for (const check of bundleChecks) {
  assert.deepEqual(
    await readFile(resolve(root, check.root, "Contents/Info.plist")),
    await readFile(resolve(root, check.info)),
    `${check.root} Info.plist changed`,
  );
  assert.deepEqual(
    await readFile(resolve(root, check.root, "Contents/Resources/RequestedEntitlements.plist")),
    await readFile(resolve(root, check.entitlements)),
    `${check.root} entitlement request changed`,
  );
  const executablePath = resolve(root, check.root, "Contents/MacOS", check.executable);
  const executable = await readFile(executablePath);
  const stat = await lstat(executablePath);
  assert.equal((stat.mode & 0o777).toString(8), "755", `${check.executable} mode changed`);
  assert.deepEqual([...executable.subarray(0, 4)], [0xcf, 0xfa, 0xed, 0xfe]);
  for (const value of check.strings) {
    assert.equal(executable.includes(Buffer.from(value)), true, `${check.executable} lacks ${value}`);
  }
  assert.equal(executable.includes(Buffer.from(root)), false, `${check.executable} embeds build root`);
  const loadCommands = execFileSync("otool", ["-l", executablePath], { encoding: "utf8" });
  assert.equal(loadCommands.includes("LC_UUID"), false, `${check.executable} has UUID`);
  assert.equal(loadCommands.includes("LC_CODE_SIGNATURE"), false, `${check.executable} is signed`);
}
assert.notEqual(
  manifest.files.find((entry) => entry.path.endsWith("CapsuleSupervisorAuthorityE1Probe")).sha256,
  manifest.files.find((entry) => entry.path.endsWith("CapsuleSupervisorLegacyProbe")).sha256,
  "current and legacy probes collapsed to one artifact",
);

for (const prohibited of ["embedded.provisionprofile", "/_CodeSignature/", ".p12", ".cer", ".mobileprovision"]) {
  assert.equal(manifest.files.some((entry) => entry.path.includes(prohibited)), false, `prohibited payload ${prohibited}`);
}

const evidence = await readJson("evidence/construction.json");
assert.equal(evidence.capsuleInputCommit, expectedCapsuleCommit);
assert.equal(evidence.archiveBaseCommit, expectedArchiveBase);
assert.equal(evidence.construction.reproducedInTwoCleanDirectories, true);
assert.equal(evidence.construction.bundleTreesByteAndModeEqual, true);
assert.equal(evidence.construction.builtArtifactsExecuted, false);
assert.ok(Object.values(evidence.authorityBoundary).every((value) => value === false));
assert.deepEqual(evidence.result, {
  e0Construction: "PASSED",
  e1IdentitySeparation: "BLOCKED",
  adr0045: "Proposed",
  installedOwnerLock: "BLOCKED",
  productAdmission: "BLOCKED",
});

console.log(JSON.stringify({
  status: "PASSED",
  fileCount: manifest.fileCount,
  manifestSha256: sha256(await readFile(resolve(root, "manifest.json"))),
  artifacts: bundleChecks.map((check) => ({
    path: `${check.root}/Contents/MacOS/${check.executable}`,
    sha256: manifest.files.find((entry) => entry.path.endsWith(`/${check.executable}`)).sha256,
  })),
  e1IdentitySeparation: "BLOCKED",
  adr0045: "Proposed",
  productAdmission: "BLOCKED",
}, null, 2));
