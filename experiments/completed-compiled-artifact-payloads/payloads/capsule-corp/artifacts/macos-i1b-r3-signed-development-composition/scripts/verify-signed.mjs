#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { readExactProfile } from "./profile-metadata.mjs";

const TEAM = "3DDR84M4JS";
const CERTIFICATE_SHA1 = "80A4969BCD1B3926020888094B9D812A283D3793";
const prohibitedEntitlements = [
  "com.apple.security.get-task-allow",
  "com.apple.security.application-groups",
  "com.apple.security.network.client",
  "com.apple.security.network.server",
  "com.apple.security.files.user-selected.read-only",
  "com.apple.security.files.user-selected.read-write",
  "com.apple.security.hypervisor",
  "com.apple.security.cs.disable-library-validation",
  "com.apple.security.cs.allow-jit",
  "com.apple.security.cs.allow-unsigned-executable-memory",
  "com.apple.security.automation.apple-events",
  "com.apple.security.temporary-exception.mach-lookup.global-name",
];

function usage() {
  throw new Error(
    "usage: verify-signed.mjs <Capsule.app> [--enrollment <json>] [--write-enrollment <json>]",
  );
}

if (process.argv.length < 3) usage();
const bundle = resolve(process.argv[2]);
let enrollmentPath;
let writeEnrollmentPath;
for (let index = 3; index < process.argv.length; index += 2) {
  const option = process.argv[index];
  const value = process.argv[index + 1];
  if (!value) usage();
  if (option === "--enrollment") enrollmentPath = resolve(value);
  else if (option === "--write-enrollment") writeEnrollmentPath = resolve(value);
  else usage();
}

assert.equal(basename(bundle), "Capsule.app", "bundle must be named Capsule.app");
assert.equal((await lstat(bundle)).isDirectory(), true, "bundle must be a directory");

function run(command, arguments_, options = {}) {
  try {
    return execFileSync(command, arguments_, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
  } catch (error) {
    const detail = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
    throw new Error(`${command} ${arguments_.join(" ")} refused${detail ? `: ${detail}` : ""}`);
  }
}

function display(path, ...arguments_) {
  const result = spawnSync("codesign", ["-d", ...arguments_, path], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`codesign display refused: ${result.stderr.trim()}`);
  }
  return `${result.stdout}${result.stderr}`;
}

async function sha256(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

function field(output, name) {
  const match = output.match(new RegExp(`^${name}=(.+)$`, "m"));
  assert.ok(match, `${name} missing from codesign readback`);
  return match[1].trim();
}

function entitlementKeys(output) {
  return [...output.matchAll(/^\s*\[Key\]\s+(.+)$/gm)].map((match) => match[1].trim()).sort();
}

const containing = [
  {
    role: "approval-broker",
    path: bundle,
    executable: join(bundle, "Contents/MacOS/Capsule"),
    identifier: "com.capsulecorp.capsule.broker",
    profile: join(bundle, "Contents/embedded.provisionprofile"),
    entitlementKeys: [
      "com.apple.application-identifier",
      "com.apple.developer.team-identifier",
      "com.apple.security.app-sandbox",
    ],
    constraints: ["Self", "Library"],
  },
  {
    role: "daemon",
    path: join(bundle, "Contents/Library/Helpers/CapsuleDaemon.app"),
    executable: join(
      bundle,
      "Contents/Library/Helpers/CapsuleDaemon.app/Contents/MacOS/CapsuleDaemon",
    ),
    identifier: "com.capsulecorp.capsule.daemon",
    profile: join(
      bundle,
      "Contents/Library/Helpers/CapsuleDaemon.app/Contents/embedded.provisionprofile",
    ),
    entitlementKeys: [
      "com.apple.application-identifier",
      "com.apple.developer.team-identifier",
      "com.apple.security.app-sandbox",
    ],
    constraints: ["Self", "Parent", "Library"],
  },
  {
    role: "supervisor",
    path: join(bundle, "Contents/Library/Helpers/CapsuleSupervisor.app"),
    executable: join(
      bundle,
      "Contents/Library/Helpers/CapsuleSupervisor.app/Contents/MacOS/CapsuleSupervisor",
    ),
    identifier: "com.capsulecorp.capsule.supervisor",
    profile: join(
      bundle,
      "Contents/Library/Helpers/CapsuleSupervisor.app/Contents/embedded.provisionprofile",
    ),
    entitlementKeys: [
      "com.apple.application-identifier",
      "com.apple.developer.team-identifier",
      "com.apple.security.app-sandbox",
    ],
    constraints: ["Self", "Parent", "Library"],
  },
];

const nested = [
  {
    role: "daemon-validator-launcher",
    path: join(
      bundle,
      "Contents/Library/Helpers/CapsuleDaemon.app/Contents/XPCServices/CapsuleSourceValidatorDaemon.xpc",
    ),
    executable: join(
      bundle,
      "Contents/Library/Helpers/CapsuleDaemon.app/Contents/XPCServices/CapsuleSourceValidatorDaemon.xpc/Contents/MacOS/CapsuleSourceValidatorDaemonLauncher",
    ),
    identifier: "com.capsulecorp.capsule.source-validator.daemon.v1",
    entitlementKeys: ["com.apple.security.app-sandbox"],
    constraints: ["Self", "Parent", "Responsible", "Library"],
  },
  {
    role: "broker-validator-launcher",
    path: join(bundle, "Contents/XPCServices/CapsuleSourceValidatorBroker.xpc"),
    executable: join(
      bundle,
      "Contents/XPCServices/CapsuleSourceValidatorBroker.xpc/Contents/MacOS/CapsuleSourceValidatorBrokerLauncher",
    ),
    identifier: "com.capsulecorp.capsule.source-validator.approval-broker.v1",
    entitlementKeys: ["com.apple.security.app-sandbox"],
    constraints: ["Self", "Parent", "Responsible", "Library"],
  },
  {
    role: "daemon-parser-child",
    path: join(
      bundle,
      "Contents/Library/Helpers/CapsuleDaemon.app/Contents/XPCServices/CapsuleSourceValidatorDaemon.xpc/Contents/Resources/capsule-mjs-source-validator-daemon",
    ),
    identifier: "com.capsulecorp.capsule.source-validator-parser.daemon.v1",
    entitlementKeys: ["com.apple.security.app-sandbox", "com.apple.security.inherit"],
    constraints: ["Self", "Parent", "Responsible", "Library"],
  },
  {
    role: "broker-parser-child",
    path: join(
      bundle,
      "Contents/XPCServices/CapsuleSourceValidatorBroker.xpc/Contents/Resources/capsule-mjs-source-validator-approval-broker",
    ),
    identifier: "com.capsulecorp.capsule.source-validator-parser.approval-broker.v1",
    entitlementKeys: ["com.apple.security.app-sandbox", "com.apple.security.inherit"],
    constraints: ["Self", "Parent", "Responsible", "Library"],
  },
];

for (const component of nested) {
  component.executable ??= component.path;
}
const components = [...containing, ...nested];

run("codesign", ["--verify", "--deep", "--strict", "--verbose=4", bundle]);

const profileMetadata = [];
for (const component of containing) {
  profileMetadata.push({
    role: component.role,
    ...(await readExactProfile(component.profile, component.identifier)).publicMetadata,
  });
}

async function findProfiles(root, prefix = "") {
  const found = [];
  for (const name of (await readdir(join(root, prefix))).sort()) {
    const item = prefix ? `${prefix}/${name}` : name;
    const status = await lstat(join(root, item));
    assert.equal(status.isSymbolicLink(), false, `${item}: symlink refused`);
    if (status.isDirectory()) found.push(...(await findProfiles(root, item)));
    else if (name === "embedded.provisionprofile") found.push(item);
  }
  return found;
}

assert.deepEqual(await findProfiles(bundle), [
  "Contents/Library/Helpers/CapsuleDaemon.app/Contents/embedded.provisionprofile",
  "Contents/Library/Helpers/CapsuleSupervisor.app/Contents/embedded.provisionprofile",
  "Contents/embedded.provisionprofile",
]);

const signedComponents = [];
for (const component of components) {
  run("codesign", ["--verify", "--strict", "--verbose=4", component.path]);
  const verbose = display(component.path, "--verbose=7");
  assert.equal(field(verbose, "Identifier"), component.identifier, `${component.role}: identifier`);
  assert.equal(field(verbose, "TeamIdentifier"), TEAM, `${component.role}: TeamIdentifier`);
  assert.match(
    verbose,
    /^CodeDirectory v=.*flags=0x[0-9a-f]*10000\(runtime\).*$/im,
    `${component.role}: Hardened Runtime flag missing`,
  );
  assert.match(verbose, /^Runtime Version=/m, `${component.role}: Hardened Runtime missing`);
  assert.match(verbose, /^Authority=Apple Development: Dylan Steele \(W4QUR9FUL4\)$/m);

  const requirement = display(component.path, "-r-");
  assert.ok(
    requirement.includes(`identifier "${component.identifier}"`),
    `${component.role}: designated requirement identifier`,
  );
  assert.match(requirement, /anchor apple generic/);

  const entitlements = display(component.path, "--entitlements", "-");
  const keys = entitlementKeys(entitlements);
  assert.deepEqual(keys, [...component.entitlementKeys].sort(), `${component.role}: entitlements`);
  assert.match(
    entitlements,
    /\[Key\] com\.apple\.security\.app-sandbox\s+\[Value\]\s+\[Bool\] true/m,
  );
  if (component.profile) {
    assert.match(
      entitlements,
      new RegExp(
        `\\[Key\\] com\\.apple\\.application-identifier\\s+\\[Value\\]\\s+\\[String\\] ${TEAM}\\.${component.identifier.replaceAll(".", "\\.")}`,
        "m",
      ),
    );
    assert.match(
      entitlements,
      new RegExp(
        `\\[Key\\] com\\.apple\\.developer\\.team-identifier\\s+\\[Value\\]\\s+\\[String\\] ${TEAM}`,
        "m",
      ),
    );
  }
  for (const prohibited of prohibitedEntitlements) {
    assert.equal(keys.includes(prohibited), false, `${component.role}: prohibited ${prohibited}`);
  }

  const constraints = [];
  for (const kind of ["Self", "Parent", "Responsible", "Library"]) {
    const pattern =
      kind === "Library"
        ? /Has Library Load Constraints/
        : new RegExp(`Has ${kind} Launch Constraints`);
    if (pattern.test(verbose)) constraints.push(kind);
  }
  assert.deepEqual(constraints, component.constraints, `${component.role}: constraint slots`);

  const libraries = run("otool", ["-L", component.executable])
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(" ")[0])
    .filter(Boolean);
  assert.ok(libraries.length > 0, `${component.role}: empty library closure`);
  for (const library of libraries) {
    assert.ok(
      library.startsWith("/System/Library/") || library.startsWith("/usr/lib/"),
      `${component.role}: non-platform library ${library}`,
    );
  }

  run("codesign", [
    "--verify",
    "--strict",
    `-R=certificate leaf = H"${CERTIFICATE_SHA1}"`,
    component.path,
  ]);

  signedComponents.push({
    role: component.role,
    relativePath: relative(bundle, component.path) || ".",
    executableRelativePath: relative(bundle, component.executable),
    identifier: component.identifier,
    teamIdentifier: TEAM,
    certificateSha1: CERTIFICATE_SHA1,
    cdHash: field(verbose, "CDHash"),
    signedExecutableSha256: await sha256(component.executable),
    effectiveEntitlementKeys: keys,
    constraints,
    platformLibraries: libraries,
  });
}

const signingInputs = JSON.parse(
  await readFile(join(bundle, "Contents/Resources/CapsuleI1BR3/signing-inputs.json"), "utf8"),
);
assert.equal(signingInputs.teamIdentifier, TEAM);
assert.equal(signingInputs.certificateSha1, CERTIFICATE_SHA1);
assert.equal(signingInputs.developerIdUsed, false);
assert.equal(signingInputs.notarizationUsed, false);
assert.equal(signingInputs.executionState, "disabled");

const unsignedManifestPath = join(bundle, "Contents/Resources/CapsuleI1BR3/unsigned-manifest.json");
const unsignedManifest = JSON.parse(await readFile(unsignedManifestPath, "utf8"));
assert.equal(unsignedManifest.executionState, "disabled");
assert.equal(unsignedManifest.runtimePresent, false);
assert.equal(unsignedManifest.backendPresent, false);
assert.equal(unsignedManifest.guestPresent, false);

const enrollment = {
  schema: "capsule.macos-installation.i1b-r3-signed-enrollment/v1",
  status: "PASSED",
  teamIdentifier: TEAM,
  certificateSha1: CERTIFICATE_SHA1,
  distribution: "Apple Development",
  notarizationUsed: false,
  developerIdUsed: false,
  executionState: "disabled",
  attemptState: "disabled",
  runtimePresent: false,
  backendPresent: false,
  guestPresent: false,
  unsignedManifestSha256: await sha256(unsignedManifestPath),
  profiles: profileMetadata,
  signedComponents,
};

if (enrollmentPath) {
  const expected = JSON.parse(await readFile(enrollmentPath, "utf8"));
  assert.deepEqual(enrollment, expected, "signed bundle differs from enrolled signed bytes");
}
if (writeEnrollmentPath) {
  await writeFile(writeEnrollmentPath, `${JSON.stringify(enrollment, null, 2)}\n`, { mode: 0o644 });
}
process.stdout.write(`${JSON.stringify(enrollment, null, 2)}\n`);
