import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, copyFile, lstat, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const artifactRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(artifactRoot, "../..");
const placeholderRoot = join(artifactRoot, "placeholders");
const r2Root = join(repositoryRoot, "artifacts/mjs-source-validator-r2");
const profilePath = join(repositoryRoot, "internal/installation/macosplan/testdata/profile.json");

export const bundleManifestRelativePath =
  "Contents/Resources/CapsuleConstruction/bundle-manifest.json";

const fixedCopies = [
  ["templates/broker-Info.plist", "Contents/Info.plist", 0o644],
  [
    "templates/daemon-Info.plist",
    "Contents/Library/Helpers/CapsuleDaemon.app/Contents/Info.plist",
    0o644,
  ],
  [
    "placeholders/CapsuleDaemon",
    "Contents/Library/Helpers/CapsuleDaemon.app/Contents/MacOS/CapsuleDaemon",
    0o644,
  ],
  [
    "templates/supervisor-Info.plist",
    "Contents/Library/Helpers/CapsuleSupervisor.app/Contents/Info.plist",
    0o644,
  ],
  [
    "placeholders/CapsuleSupervisor",
    "Contents/Library/Helpers/CapsuleSupervisor.app/Contents/MacOS/CapsuleSupervisor",
    0o644,
  ],
  [
    "templates/daemon-LaunchAgent.plist",
    "Contents/Library/LaunchAgents/com.capsulecorp.capsule.daemon.plist",
    0o644,
  ],
  [
    "templates/supervisor-LaunchAgent.plist",
    "Contents/Library/LaunchAgents/com.capsulecorp.capsule.supervisor.plist",
    0o644,
  ],
];

const metadataRelativePaths = [
  "Contents/Resources/CapsuleConstruction/construction-status.json",
  "Contents/Resources/CapsuleConstruction/entitlement-projections.json",
  "Contents/Resources/CapsuleConstruction/installation-profile.json",
  "Contents/Resources/CapsuleConstruction/nested-code-order.json",
  "Contents/Resources/CapsuleConstruction/role-inventory.json",
  "Contents/Resources/CapsuleConstruction/service-inventory.json",
];

function canonicalJSON(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function sha256File(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

async function readJSON(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeCanonicalJSON(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, canonicalJSON(value), { mode: 0o644 });
  await chmod(path, 0o644);
}

async function copyClosed(source, destination, mode) {
  await mkdir(dirname(destination), { recursive: true });
  const status = await lstat(source);
  assert.equal(status.isFile(), true, `${source}: expected a regular file`);
  assert.equal(status.isSymbolicLink(), false, `${source}: symlink is not accepted`);
  await copyFile(source, destination);
  await chmod(destination, mode);
}

async function r2Construction() {
  const construction = await readJSON(join(r2Root, "evidence/construction.json"));
  assert.equal(construction.schema, "capsule.source-validator.unsigned-construction/v1");
  assert.equal(construction.status, "PASSED");
  assert.equal(construction.signing.appleIdentityUsed, false);
  assert.equal(construction.roles.length, 2);
  return construction;
}

function r2Destination(role, itemPath) {
  const relativeItem = relative(role.bundlePath, itemPath);
  assert.equal(relativeItem.startsWith(`..${sep}`), false, `${itemPath}: escaped R2 bundle`);
  const base =
    role.role === "daemon"
      ? "Contents/Library/Helpers/CapsuleDaemon.app/Contents/XPCServices/CapsuleSourceValidatorDaemon.xpc"
      : "Contents/XPCServices/CapsuleSourceValidatorBroker.xpc";
  return join(base, relativeItem).split(sep).join("/");
}

function r2Files(construction) {
  const files = [];
  for (const role of construction.roles) {
    assert.ok(["daemon", "approval-broker"].includes(role.role), `unexpected R2 role ${role.role}`);
    for (const [kind, mode] of [
      ["infoPlist", 0o644],
      ["launcher", 0o755],
      ["parser", 0o755],
      ["resourcePolicy", 0o644],
    ]) {
      const item = role[kind];
      files.push({
        role: role.role,
        kind,
        source: join(r2Root, item.path),
        destination: r2Destination(role, item.path),
        bytes: item.bytes,
        sha256: item.sha256,
        mode,
      });
    }
  }
  return files;
}

function expectedStaticFiles(construction) {
  return new Set([
    "Contents/MacOS/Capsule",
    ...fixedCopies.map((entry) => entry[1]),
    ...r2Files(construction).map((entry) => entry.destination),
    ...metadataRelativePaths,
    bundleManifestRelativePath,
  ]);
}

async function walkBundle(root, prefix = "") {
  const entries = [];
  const names = await readdir(join(root, prefix));
  names.sort();
  for (const name of names) {
    const path = prefix ? `${prefix}/${name}` : name;
    const status = await lstat(join(root, path));
    if (status.isSymbolicLink()) {
      throw new Error(`${path}: symlink present in I1A bundle`);
    }
    if (status.isDirectory()) {
      entries.push({ path, type: "directory", mode: status.mode & 0o7777 });
      entries.push(...(await walkBundle(root, path)));
    } else if (status.isFile()) {
      entries.push({
        path,
        type: "file",
        mode: status.mode & 0o7777,
        bytes: status.size,
      });
    } else {
      throw new Error(`${path}: unsupported filesystem entry type`);
    }
  }
  return entries;
}

function constructionMetadata(profile) {
  return new Map([
    [
      "construction-status.json",
      {
        schema: "capsule.macos-installation.i1a-construction-status/v1",
        checkpoint: "I1A",
        profileId: profile.profileId,
        intendedDevelopmentTeamId: "3DDR84M4JS",
        intendedTeamState: "inactive-metadata-only",
        appleIdentityUsed: false,
        provisioningProfilePresent: false,
        codeSigningMutationUsed: false,
        serviceRegistrationState: "inactive-not-registered",
        bootstrapState: "inactive-not-created",
        approvalState: "absent",
        attemptsEnabled: false,
        runtimePresent: false,
        backendPresent: false,
        guestPresent: false,
        executionState: "permanently-disabled-in-i1a",
        activationDecision: "refuse",
        activationReason: "signing-profile-inactive",
        credentialedNextSlice: "I1B-and-Source-Validator-R3-separate-authorization-required",
      },
    ],
    ["installation-profile.json", profile],
    [
      "role-inventory.json",
      {
        schema: "capsule.macos-installation.i1a-role-inventory/v1",
        profileId: profile.profileId,
        roles: profile.roles,
      },
    ],
    [
      "service-inventory.json",
      {
        schema: "capsule.macos-installation.i1a-service-inventory/v1",
        profileId: profile.profileId,
        services: profile.services,
      },
    ],
    [
      "entitlement-projections.json",
      {
        schema: "capsule.macos-installation.i1a-entitlement-projections/v1",
        profileId: profile.profileId,
        projectionState: "expected-only-signing-inactive",
        entitlements: profile.entitlements,
      },
    ],
    [
      "nested-code-order.json",
      {
        schema: "capsule.macos-installation.i1a-nested-code-order/v1",
        state: "ordering-only-no-signing-invoked",
        deepestFirst: [
          "Capsule.app/Contents/Library/Helpers/CapsuleDaemon.app/Contents/XPCServices/CapsuleSourceValidatorDaemon.xpc/Contents/Resources/capsule-mjs-source-validator-daemon",
          "Capsule.app/Contents/XPCServices/CapsuleSourceValidatorBroker.xpc/Contents/Resources/capsule-mjs-source-validator-approval-broker",
          "Capsule.app/Contents/Library/Helpers/CapsuleDaemon.app/Contents/XPCServices/CapsuleSourceValidatorDaemon.xpc",
          "Capsule.app/Contents/XPCServices/CapsuleSourceValidatorBroker.xpc",
          "Capsule.app/Contents/Library/Helpers/CapsuleDaemon.app",
          "Capsule.app/Contents/Library/Helpers/CapsuleSupervisor.app",
          "Capsule.app",
        ],
      },
    ],
  ]);
}

export async function assembleBundle({ brokerExecutable, bundleRoot }) {
  const target = resolve(bundleRoot);
  if (basename(target) !== "Capsule.app" || target === resolve("/")) {
    throw new Error(`refusing unsafe I1A output path: ${target}`);
  }
  const compilerOutput = await lstat(brokerExecutable);
  assert.equal(compilerOutput.isFile(), true, "Swift compiler output must be a regular file");
  assert.equal(
    compilerOutput.isSymbolicLink(),
    false,
    "Swift compiler output must not be a symlink",
  );

  const construction = await r2Construction();
  const profile = await readJSON(profilePath);
  assert.equal(profile.profileId, "capsule.macos-installation.no-guest/i0");
  assert.equal(profile.roles.length, 7);
  assert.equal(profile.signing.state, "inactive-refusing");
  assert.equal(profile.bootstrap.state, "inactive-refusing");

  await rm(target, { recursive: true, force: true });
  await mkdir(join(target, "Contents/MacOS"), { recursive: true });
  await copyClosed(brokerExecutable, join(target, "Contents/MacOS/Capsule"), 0o755);

  for (const [sourceRelative, destinationRelative, mode] of fixedCopies) {
    await copyClosed(join(artifactRoot, sourceRelative), join(target, destinationRelative), mode);
  }

  for (const file of r2Files(construction)) {
    const sourceStatus = await lstat(file.source);
    assert.equal(sourceStatus.size, file.bytes, `${file.source}: R2 byte length changed`);
    assert.equal(await sha256File(file.source), file.sha256, `${file.source}: R2 digest changed`);
    await copyClosed(file.source, join(target, file.destination), file.mode);
  }

  const metadataRoot = join(target, "Contents/Resources/CapsuleConstruction");
  for (const [name, value] of constructionMetadata(profile)) {
    await writeCanonicalJSON(join(metadataRoot, name), value);
  }

  const files = [];
  for (const entry of await walkBundle(target)) {
    if (entry.type !== "file") continue;
    files.push({
      path: entry.path,
      bytes: entry.bytes,
      sha256: await sha256File(join(target, entry.path)),
      mode: entry.mode.toString(8).padStart(4, "0"),
    });
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  const manifest = {
    schema: "capsule.macos-installation.i1a-bundle-manifest/v1",
    profileId: profile.profileId,
    intendedDevelopmentTeamId: "3DDR84M4JS",
    signingState: "unsigned-no-apple-identity",
    activationState: "inactive-refusing",
    executionState: "disabled",
    files,
  };
  const manifestPath = join(target, bundleManifestRelativePath);
  await writeCanonicalJSON(manifestPath, manifest);

  const expected = expectedStaticFiles(construction);
  assert.equal(expected.size, files.length + 1, "closed I1A file count changed during assembly");
  for (const path of expected) {
    assert.ok(
      path === bundleManifestRelativePath || files.some((item) => item.path === path),
      path,
    );
  }

  return {
    manifest,
    manifestSha256: await sha256File(manifestPath),
    bundleFileCount: expected.size,
  };
}

export async function verifyBundle({ bundleRoot, expectedManifestSha256 }) {
  const target = resolve(bundleRoot);
  assert.equal(basename(target), "Capsule.app", "I1A bundle must be named Capsule.app");
  const construction = await r2Construction();
  const profile = await readJSON(profilePath);
  const expectedPaths = expectedStaticFiles(construction);

  const entries = await walkBundle(target);
  const observedFiles = entries.filter((entry) => entry.type === "file");
  assert.equal(observedFiles.length, expectedPaths.size, "I1A closed file count changed");
  const observedPathSet = new Set(observedFiles.map((entry) => entry.path));
  for (const path of expectedPaths) {
    assert.ok(observedPathSet.has(path), `${path}: required I1A file missing`);
  }
  for (const path of observedPathSet) {
    assert.ok(expectedPaths.has(path), `${path}: unexpected I1A file`);
  }

  const manifestPath = join(target, bundleManifestRelativePath);
  const manifestDigest = await sha256File(manifestPath);
  if (expectedManifestSha256) {
    assert.equal(manifestDigest, expectedManifestSha256, "bundle manifest identity changed");
  }
  const manifest = await readJSON(manifestPath);
  assert.equal(manifest.schema, "capsule.macos-installation.i1a-bundle-manifest/v1");
  assert.equal(manifest.profileId, profile.profileId);
  assert.equal(manifest.intendedDevelopmentTeamId, "3DDR84M4JS");
  assert.equal(manifest.signingState, "unsigned-no-apple-identity");
  assert.equal(manifest.activationState, "inactive-refusing");
  assert.equal(manifest.executionState, "disabled");
  assert.equal(manifest.files.length, expectedPaths.size - 1);

  const manifestFiles = new Map(manifest.files.map((item) => [item.path, item]));
  assert.equal(manifestFiles.size, manifest.files.length, "duplicate path in bundle manifest");
  for (const entry of observedFiles) {
    if (entry.path === bundleManifestRelativePath) continue;
    const expected = manifestFiles.get(entry.path);
    assert.ok(expected, `${entry.path}: not bound by bundle manifest`);
    assert.equal(entry.bytes, expected.bytes, `${entry.path}: byte length changed`);
    assert.equal(
      await sha256File(join(target, entry.path)),
      expected.sha256,
      `${entry.path}: bytes substituted`,
    );
    assert.equal(
      entry.mode.toString(8).padStart(4, "0"),
      expected.mode,
      `${entry.path}: mode changed`,
    );
  }

  for (const [sourceRelative, destinationRelative, mode] of fixedCopies) {
    assert.deepEqual(
      await readFile(join(target, destinationRelative)),
      await readFile(join(artifactRoot, sourceRelative)),
      `${destinationRelative}: closed template or placeholder changed`,
    );
    const status = await lstat(join(target, destinationRelative));
    assert.equal(status.mode & 0o7777, mode, `${destinationRelative}: fixed mode changed`);
  }

  for (const file of r2Files(construction)) {
    const path = join(target, file.destination);
    assert.equal((await lstat(path)).size, file.bytes, `${file.destination}: R2 size changed`);
    assert.equal(await sha256File(path), file.sha256, `${file.destination}: R2 identity changed`);
    assert.equal(
      (await lstat(path)).mode & 0o7777,
      file.mode,
      `${file.destination}: R2 mode changed`,
    );
  }

  const metadata = constructionMetadata(profile);
  for (const [name, value] of metadata) {
    const path = join(target, "Contents/Resources/CapsuleConstruction", name);
    assert.deepEqual(await readJSON(path), value, `${name}: canonical projection changed`);
  }

  const daemonPlaceholder = await lstat(
    join(target, "Contents/Library/Helpers/CapsuleDaemon.app/Contents/MacOS/CapsuleDaemon"),
  );
  const supervisorPlaceholder = await lstat(
    join(target, "Contents/Library/Helpers/CapsuleSupervisor.app/Contents/MacOS/CapsuleSupervisor"),
  );
  assert.equal(daemonPlaceholder.mode & 0o111, 0, "daemon placeholder became executable");
  assert.equal(supervisorPlaceholder.mode & 0o111, 0, "Supervisor placeholder became executable");

  const broker = await readFile(join(target, "Contents/MacOS/Capsule"));
  assert.ok(broker.length > 4, "Swift Broker output is empty");
  assert.equal(
    broker.subarray(0, 4).toString("hex"),
    "cffaedfe",
    "Swift Broker is not an arm64 Mach-O",
  );
  assert.notDeepEqual(
    createHash("sha256").update(broker).digest(),
    createHash("sha256")
      .update(await readFile(join(placeholderRoot, "CapsuleDaemon")))
      .digest(),
    "Swift Broker cannot be a role placeholder",
  );

  return {
    manifestSha256: manifestDigest,
    bundleFileCount: observedFiles.length,
    roleCount: profile.roles.length,
    activationDecision: "refuse",
    activationReason: "signing-profile-inactive",
  };
}
