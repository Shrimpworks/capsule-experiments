#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const artifactRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(artifactRoot, "../..");
const bundleRoot = resolve(process.argv[2] ?? "");
if (basename(bundleRoot) !== "Capsule.app") {
  throw new Error("usage: generate-unsigned-manifest.mjs <Capsule.app>");
}

const manifestRelative = "Contents/Resources/CapsuleI1BR3/unsigned-manifest.json";
const excluded = new Set([manifestRelative]);

async function sha256File(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

async function walk(root, prefix = "") {
  const entries = [];
  const names = await readdir(join(root, prefix));
  names.sort();
  for (const name of names) {
    const item = prefix ? `${prefix}/${name}` : name;
    const status = await lstat(join(root, item));
    assert.equal(status.isSymbolicLink(), false, `${item}: symlink refused`);
    if (status.isDirectory()) {
      entries.push(...(await walk(root, item)));
    } else {
      assert.equal(status.isFile(), true, `${item}: non-file refused`);
      if (!excluded.has(item)) {
        entries.push({
          path: item,
          bytes: status.size,
          mode: (status.mode & 0o7777).toString(8).padStart(4, "0"),
          sha256: await sha256File(join(root, item)),
        });
      }
    }
  }
  return entries;
}

const r2 = JSON.parse(
  await readFile(
    join(repositoryRoot, "artifacts/mjs-source-validator-r2/evidence/construction.json"),
  ),
);
assert.equal(r2.status, "PASSED");
assert.equal(r2.signing.appleIdentityUsed, false);

const manifest = {
  schema: "capsule.macos-installation.i1b-r3-unsigned-manifest/v1",
  status: "unsigned-source-identity-before-credentialed-signing",
  teamIdentifier: "3DDR84M4JS",
  preferredCertificateSha1: "80A4969BCD1B3926020888094B9D812A283D3793",
  executionState: "disabled",
  runtimePresent: false,
  backendPresent: false,
  guestPresent: false,
  i1aSourceManifestSha256: "5bd80097775908031b1a4c90680e8c7656cc5e9f97df2cc187592f75ee67a56f",
  r2UnsignedIdentities: r2.roles.map((role) => ({
    role: role.role,
    infoPlistSha256: role.infoPlist.sha256,
    launcherSha256: role.launcher.sha256,
    parserSha256: role.parser.sha256,
    resourcePolicySha256: role.resourcePolicy.sha256,
  })),
  files: await walk(bundleRoot),
};
const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
await writeFile(join(bundleRoot, manifestRelative), bytes, { mode: 0o644 });
if (process.argv[3]) {
  await writeFile(resolve(process.argv[3]), bytes, { mode: 0o644 });
}
process.stdout.write(
  `${JSON.stringify({
    path: relative(repositoryRoot, join(bundleRoot, manifestRelative)),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    files: manifest.files.length,
  })}\n`,
);
