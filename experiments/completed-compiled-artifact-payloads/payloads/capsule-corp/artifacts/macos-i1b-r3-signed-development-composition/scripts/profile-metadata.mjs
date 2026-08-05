#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const TEAM = "3DDR84M4JS";
const CERTIFICATE_SHA1 = "80A4969BCD1B3926020888094B9D812A283D3793";
const CERTIFICATE_SHA256 = "D3E9FBDDBC342F747C3649B5A6FFB307A575827404E02D638C11B6B795A09629";
const ALLOWED_PROFILE_ENTITLEMENTS = [
  "com.apple.application-identifier",
  "com.apple.developer.team-identifier",
  "keychain-access-groups",
];
const PROHIBITED = [
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

function decodeProfile(path) {
  const directory = mkdtempSync(join(tmpdir(), "capsule-i1b-profile-"));
  const plistPath = join(directory, "profile.plist");
  try {
    const xml = execFileSync("security", ["cms", "-D", "-i", path], {
      encoding: "buffer",
      stdio: ["ignore", "pipe", "pipe"],
    });
    writeFileSync(plistPath, xml, { mode: 0o600 });
    const raw = (key) =>
      execFileSync("plutil", ["-extract", key, "raw", "-o", "-", plistPath], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    const buddy = (key) =>
      execFileSync("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, plistPath], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    const present = (key) => {
      try {
        buddy(`Entitlements:${key}`);
        return true;
      } catch {
        return false;
      }
    };
    const certificateCount = Number(raw("DeveloperCertificates"));
    const developerCertificates = [];
    for (let index = 0; index < certificateCount; index += 1) {
      developerCertificates.push(raw(`DeveloperCertificates.${index}`));
    }
    const deviceCount = Number(raw("ProvisionedDevices"));
    const provisionedDevices = [];
    for (let index = 0; index < deviceCount; index += 1) {
      provisionedDevices.push(raw(`ProvisionedDevices.${index}`));
    }
    const entitlementsXML = execFileSync(
      "plutil",
      ["-extract", "Entitlements", "xml1", "-o", "-", plistPath],
      { encoding: "buffer", stdio: ["ignore", "pipe", "pipe"] },
    );
    const entitlementKeys = [...entitlementsXML.toString("utf8").matchAll(/<key>([^<]+)<\/key>/g)]
      .map((match) => match[1])
      .sort();
    return {
      UUID: raw("UUID"),
      Name: raw("Name"),
      CreationDate: raw("CreationDate"),
      ExpirationDate: raw("ExpirationDate"),
      TeamIdentifier: raw("TeamIdentifier.0"),
      applicationIdentifier: buddy("Entitlements:com.apple.application-identifier"),
      entitlementTeamIdentifier: buddy("Entitlements:com.apple.developer.team-identifier"),
      developerCertificates,
      provisionedDevices,
      entitlementsXML,
      entitlementKeys,
      prohibitedPresent: PROHIBITED.filter(present),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function provisioningUDID() {
  const hardware = execFileSync("system_profiler", ["SPHardwareDataType"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const match = hardware.match(/^\s*Provisioning UDID:\s*(\S+)\s*$/m);
  assert.ok(match, "current Mac Provisioning UDID unavailable");
  return match[1];
}

export async function readExactProfile(pathValue, bundleIdentifier) {
  const path = resolve(pathValue);
  const status = await lstat(path);
  assert.equal(status.isFile(), true, `${path}: profile must be a regular file`);
  assert.equal(status.isSymbolicLink(), false, `${path}: profile symlink refused`);
  const bytes = await readFile(path);
  const profile = decodeProfile(path);
  assert.equal(profile.TeamIdentifier, TEAM, "profile TeamIdentifier mismatch");
  assert.equal(profile.entitlementTeamIdentifier, TEAM, "profile entitlement Team mismatch");
  assert.equal(
    profile.applicationIdentifier,
    `${TEAM}.${bundleIdentifier}`,
    "profile application identifier mismatch",
  );
  assert.equal(profile.developerCertificates.length, 1, "profile must select one certificate");
  const certificateSha256 = createHash("sha256")
    .update(Buffer.from(profile.developerCertificates[0], "base64"))
    .digest("hex")
    .toUpperCase();
  assert.equal(certificateSha256, CERTIFICATE_SHA256, "profile certificate fingerprint mismatch");
  const certificateSha1 = CERTIFICATE_SHA1;
  assert.ok(
    profile.provisionedDevices.includes(provisioningUDID()),
    "profile does not contain this Mac",
  );
  assert.ok(new Date(profile.ExpirationDate).getTime() > Date.now(), "profile is expired");
  assert.deepEqual(
    profile.entitlementKeys,
    ALLOWED_PROFILE_ENTITLEMENTS,
    "profile entitlement allowlist mismatch",
  );
  assert.deepEqual(profile.prohibitedPresent, [], "profile contains a prohibited entitlement");
  return {
    path,
    publicMetadata: {
      uuid: profile.UUID,
      name: profile.Name,
      teamIdentifier: TEAM,
      applicationIdentifier: `${TEAM}.${bundleIdentifier}`,
      creationDate: profile.CreationDate,
      expirationDate: profile.ExpirationDate,
      certificateSha1,
      profileSha256: createHash("sha256").update(bytes).digest("hex"),
      entitlementsSha256: createHash("sha256").update(profile.entitlementsXML).digest("hex"),
      profileEntitlementKeys: profile.entitlementKeys,
      implicitUnusedKeychainAllowlist: `${TEAM}.*`,
      provisionedDeviceMatch: true,
      provisionedDeviceCount: profile.provisionedDevices.length,
      source: "Apple Developer portal/Xcode cache; raw profile not retained in repository",
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.length !== 4) {
    throw new Error("usage: profile-metadata.mjs <profile> <bundle-identifier>");
  }
  const { publicMetadata } = await readExactProfile(process.argv[2], process.argv[3]);
  process.stdout.write(`${JSON.stringify(publicMetadata, null, 2)}\n`);
}
