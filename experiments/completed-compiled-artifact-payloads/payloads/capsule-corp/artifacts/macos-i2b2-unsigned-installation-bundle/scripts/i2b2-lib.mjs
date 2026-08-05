import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const artifactRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(artifactRoot, "../..");
const i1aRoot = join(repositoryRoot, "artifacts/macos-i1a-unsigned-app-shell/dist/Capsule.app");
const fixtureRoot = join(repositoryRoot, "schemas/conformance/macos-i2b2-unsigned-installation");

export const bundleManifestRelativePath = "Contents/Resources/CapsuleI2B2/bundle-manifest.json";
export const profileRelativePath = "Contents/Resources/CapsuleI2B2/profile.json";
export const bundlePathUtf8BytesCap = 1024;

const addedCopies = [
  [
    "templates/coordinator-Info.plist",
    "Contents/XPCServices/CapsuleTrustBootstrap.xpc/Contents/Info.plist",
    0o644,
  ],
  [
    "placeholders/CapsuleTrustBootstrap",
    "Contents/XPCServices/CapsuleTrustBootstrap.xpc/Contents/MacOS/CapsuleTrustBootstrap",
    0o644,
  ],
  [
    "Entitlements/coordinator.plist",
    "Contents/Resources/CapsuleI2B2/DeclaredInputs/Entitlements/coordinator.plist",
    0o644,
  ],
  [
    "Entitlements/supervisor.plist",
    "Contents/Resources/CapsuleI2B2/DeclaredInputs/Entitlements/supervisor.plist",
    0o644,
  ],
  [
    "Constraints/coordinator-supervisor-bootstrap.json",
    "Contents/Resources/CapsuleI2B2/DeclaredInputs/Constraints/coordinator-supervisor-bootstrap.json",
    0o644,
  ],
  [
    "templates/supervisor-LaunchAgent.plist",
    "Contents/Resources/CapsuleI2B2/DeclaredInputs/ServiceManagement/supervisor-bootstrap-LaunchAgent.plist",
    0o644,
  ],
];

function canonicalJSON(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function sha256File(path) {
  return sha256(await readFile(path));
}

async function copyClosed(source, destination, mode) {
  const status = await lstat(source);
  assert.equal(status.isFile(), true, `${source}: regular file required`);
  assert.equal(status.isSymbolicLink(), false, `${source}: symlink refused`);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  await chmod(destination, mode);
}

async function walk(root, prefix = "") {
  const entries = [];
  const names = await readdir(join(root, prefix));
  names.sort();
  for (const name of names) {
    const path = prefix ? `${prefix}/${name}` : name;
    assertBundleRelativePath(path);
    const status = await lstat(join(root, path));
    assert.equal(status.isSymbolicLink(), false, `${path}: symlink refused`);
    if (status.isDirectory()) {
      entries.push(...(await walk(root, path)));
    } else {
      assert.equal(status.isFile(), true, `${path}: unsupported entry type`);
      entries.push({
        path,
        bytes: status.size,
        mode: (status.mode & 0o7777).toString(8).padStart(4, "0"),
        sha256: await sha256File(join(root, path)),
      });
    }
  }
  return entries;
}

export function assertBundleRelativePath(path) {
  assert.ok(
    Buffer.byteLength(path, "utf8") <= bundlePathUtf8BytesCap,
    "I2B2 bundle path UTF-8 cap exceeded",
  );
}

async function canonicalProfileBytes() {
  return readFile(join(fixtureRoot, "profile.json"));
}

export async function verifyProfileBytes(bytes) {
  const canonical = await canonicalProfileBytes();
  const cap = 65536;
  assert.ok(bytes.length <= cap, "I2B2 profile raw cap exceeded");
  assert.deepEqual(bytes, canonical, "I2B2 profile known answer changed");
  const value = JSON.parse(bytes);
  const schema = JSON.parse(await readFile(join(fixtureRoot, "profile.schema.json"), "utf8"));
  assert.equal(
    schema.$id,
    "https://capsule.local/schemas/macos-i2b2-unsigned-installation-profile:v0",
  );
  assertSchemaShape(value, schema, "profile");
  assert.equal(value.roles.length, 8);
  assert.equal(new Set(value.roles.map((role) => role.roleId)).size, 8, "duplicate role identity");
  assert.equal(value.services.length, 2);
  assert.equal(value.stateProjection.signingState, "unsigned-no-apple-identity");
  assert.equal(value.stateProjection.serviceRegistrationState, "inactive-not-registered");
  assert.equal(value.stateProjection.serviceLaunchState, "inactive-not-launched");
  assert.equal(value.stateProjection.protectedRootState, "absent-no-create");
  assert.equal(value.stateProjection.storeState, "absent-no-create");
  assert.equal(value.stateProjection.attemptsEnabled, false);
  assert.equal(value.stateProjection.runtimePresent, false);
  assert.equal(value.stateProjection.backendPresent, false);
  assert.equal(value.stateProjection.guestPresent, false);
  assert.equal(value.constraints.activationDecision, "refuse");
  return value;
}

function assertSchemaShape(value, schema, path) {
  if (schema.type === "object") {
    assert.equal(
      value !== null && typeof value === "object" && !Array.isArray(value),
      true,
      `${path}: object required`,
    );
    assert.deepEqual(
      Object.keys(value).sort(),
      [...schema.required].sort(),
      `${path}: closed keys changed`,
    );
    for (const key of schema.required)
      assertSchemaShape(value[key], schema.properties[key], `${path}.${key}`);
    return;
  }
  if (schema.type === "array") {
    assert.equal(Array.isArray(value), true, `${path}: array required`);
    assert.equal(value.length, schema.minItems, `${path}: exact array length changed`);
    for (let index = 0; index < value.length; index += 1)
      assertSchemaShape(value[index], schema.items, `${path}[${index}]`);
    return;
  }
  assert.equal(
    typeof value,
    schema.type === "integer" ? "number" : schema.type,
    `${path}: type changed`,
  );
}

async function verifyI1AProjection(target) {
  const manifestPath = "Contents/Resources/CapsuleConstruction/bundle-manifest.json";
  const expectedDigest = "5bd80097775908031b1a4c90680e8c7656cc5e9f97df2cc187592f75ee67a56f";
  assert.equal(
    await sha256File(join(target, manifestPath)),
    expectedDigest,
    "I1A manifest changed",
  );
  const manifest = JSON.parse(await readFile(join(target, manifestPath), "utf8"));
  assert.equal(manifest.files.length, 22);
  const paths = new Set();
  for (const file of manifest.files) {
    assert.equal(paths.has(file.path), false, `duplicate I1A path: ${file.path}`);
    paths.add(file.path);
    const status = await lstat(join(target, file.path));
    assert.equal(status.size, file.bytes, `${file.path}: I1A bytes changed`);
    assert.equal(
      (status.mode & 0o7777).toString(8).padStart(4, "0"),
      file.mode,
      `${file.path}: I1A mode changed`,
    );
    assert.equal(
      await sha256File(join(target, file.path)),
      file.sha256,
      `${file.path}: I1A digest changed`,
    );
  }
}

function expectedAddedPaths() {
  return new Set([
    ...addedCopies.map((entry) => entry[1]),
    profileRelativePath,
    bundleManifestRelativePath,
  ]);
}

export async function assembleBundle({ bundleRoot }) {
  const target = resolve(bundleRoot);
  assert.equal(basename(target), "Capsule.app", "I2B2 output must be named Capsule.app");
  assert.notEqual(target, resolve("/"), "unsafe I2B2 output path");
  await verifyI1AProjection(i1aRoot);
  const profileBytes = await canonicalProfileBytes();
  const profile = await verifyProfileBytes(profileBytes);

  await rm(target, { recursive: true, force: true });
  await cp(i1aRoot, target, { recursive: true, preserveTimestamps: false });
  for (const [source, destination, mode] of addedCopies) {
    await copyClosed(join(artifactRoot, source), join(target, destination), mode);
  }
  await mkdir(dirname(join(target, profileRelativePath)), { recursive: true });
  await writeFile(join(target, profileRelativePath), profileBytes, { mode: 0o644 });
  await chmod(join(target, profileRelativePath), 0o644);

  const files = (await walk(target)).filter((entry) => entry.path !== bundleManifestRelativePath);
  const manifest = {
    schema: "capsule.macos-installation.i2b2-bundle-manifest/v0",
    status: "unsigned-installation-only-inactive",
    profileId: profile.profileId,
    baseI1AManifestSha256: "5bd80097775908031b1a4c90680e8c7656cc5e9f97df2cc187592f75ee67a56f",
    signingState: "unsigned-no-apple-identity",
    bootstrapState: "absent-no-create",
    serviceState: "inactive-not-registered-not-launched",
    attemptsEnabled: false,
    runtimePresent: false,
    backendPresent: false,
    guestPresent: false,
    files,
  };
  await writeFile(join(target, bundleManifestRelativePath), canonicalJSON(manifest), {
    mode: 0o644,
  });
  await chmod(join(target, bundleManifestRelativePath), 0o644);
  assert.equal((await walk(target)).length, profile.readbackCaps.bundleFileCount);
  return {
    manifest,
    manifestSha256: await sha256File(join(target, bundleManifestRelativePath)),
    bundleFileCount: profile.readbackCaps.bundleFileCount,
  };
}

export async function verifyBundle({ bundleRoot, expectedManifestSha256 = "" }) {
  const target = resolve(bundleRoot);
  assert.equal(basename(target), "Capsule.app", "I2B2 bundle must be named Capsule.app");
  const profileBytes = await readFile(join(target, profileRelativePath));
  const profile = await verifyProfileBytes(profileBytes);
  await verifyI1AProjection(target);

  const entries = await walk(target);
  assert.equal(
    entries.length,
    profile.readbackCaps.bundleFileCount,
    "I2B2 closed file count changed",
  );
  const paths = new Set(entries.map((entry) => entry.path));
  assert.equal(paths.size, entries.length, "duplicate bundle path");
  for (const path of expectedAddedPaths())
    assert.ok(paths.has(path), `${path}: required I2B2 file missing`);

  const manifestPath = join(target, bundleManifestRelativePath);
  const manifestBytes = await readFile(manifestPath);
  assert.ok(
    manifestBytes.length <= profile.readbackCaps.bundleManifestRawBytes,
    "I2B2 manifest raw cap exceeded",
  );
  const manifestDigest = sha256(manifestBytes);
  if (expectedManifestSha256)
    assert.equal(manifestDigest, expectedManifestSha256, "I2B2 manifest identity changed");
  const manifest = JSON.parse(manifestBytes);
  const manifestFiles = new Map(manifest.files.map((file) => [file.path, file]));
  assert.equal(manifestFiles.size, manifest.files.length, "duplicate I2B2 manifest path");
  assert.equal(manifest.files.length, entries.length - 1, "I2B2 manifest file count changed");
  assert.equal(manifest.signingState, "unsigned-no-apple-identity");
  assert.equal(manifest.bootstrapState, "absent-no-create");
  assert.equal(manifest.serviceState, "inactive-not-registered-not-launched");
  assert.equal(manifest.attemptsEnabled, false);
  assert.equal(manifest.runtimePresent, false);
  assert.equal(manifest.backendPresent, false);
  assert.equal(manifest.guestPresent, false);
  for (const entry of entries) {
    if (entry.path === bundleManifestRelativePath) continue;
    assert.deepEqual(
      entry,
      manifestFiles.get(entry.path),
      `${entry.path}: manifest metadata/digest mismatch`,
    );
  }

  for (const [source, destination, mode] of addedCopies) {
    assert.deepEqual(
      await readFile(join(target, destination)),
      await readFile(join(artifactRoot, source)),
      `${destination}: declared input changed`,
    );
    assert.equal(
      (await lstat(join(target, destination))).mode & 0o7777,
      mode,
      `${destination}: mode changed`,
    );
  }
  const coordinator = await lstat(
    join(
      target,
      "Contents/XPCServices/CapsuleTrustBootstrap.xpc/Contents/MacOS/CapsuleTrustBootstrap",
    ),
  );
  assert.equal(coordinator.mode & 0o111, 0, "Coordinator placeholder became executable");
  for (const entry of entries) {
    assert.equal(entry.path.includes("_CodeSignature"), false, "active signing material present");
    assert.equal(
      entry.path.endsWith("embedded.provisionprofile"),
      false,
      "provisioning profile present",
    );
  }
  return {
    manifestSha256: manifestDigest,
    bundleFileCount: entries.length,
    roleCount: profile.roles.length,
    fieldCount: countFields(profile),
    activationDecision: "refuse",
    activationReason: "unsigned-profile-inactive",
  };
}

function countFields(value) {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countFields(item), 0);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).reduce((sum, [, child]) => sum + 1 + countFields(child), 0);
  }
  return 0;
}
