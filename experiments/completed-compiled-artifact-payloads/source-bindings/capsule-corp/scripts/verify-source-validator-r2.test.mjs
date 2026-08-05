import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  cp,
  lstat,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const artifactRoot = new URL("../artifacts/mjs-source-validator-r2/", import.meta.url);
const artifactDir = fileURLToPath(artifactRoot);

const EXECUTABLE_MODE_MASK = 0o111;
const SETID_MODE_MASK = 0o6000;

async function sha256(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

// Enumerates every entry (files, directories, symlinks) under a retained
// `.xpc` bundle. Unlike checking only the four named evidence paths, this
// walk also catches an extra file or a symlink planted anywhere else in the
// bundle tree.
async function collectBundleEntries(bundleRoot, relPrefix = "") {
  const entries = [];
  for (const name of await readdir(join(bundleRoot, relPrefix))) {
    const rel = relPrefix ? `${relPrefix}/${name}` : name;
    const stat = await lstat(join(bundleRoot, rel));
    if (stat.isSymbolicLink()) {
      throw new Error(`${rel}: symlink present inside retained bundle`);
    }
    if (stat.isDirectory()) {
      entries.push({ rel, isDir: true });
      entries.push(...(await collectBundleEntries(bundleRoot, rel)));
    } else if (stat.isFile()) {
      entries.push({ rel, isDir: false });
    } else {
      throw new Error(`${rel}: unsupported filesystem entry type inside retained bundle`);
    }
  }
  return entries;
}

/**
 * Re-checks retained-bundle byte identity, mode, and closed directory shape
 * against `root`, evaluated from `evidence/construction.json` found under
 * that same root. Used both against the real repository artifact and
 * against temporary, deliberately mutated copies for refusal testing.
 *
 * This intentionally re-implements (rather than imports and calls) the
 * checks in `artifacts/mjs-source-validator-r2/scripts/verify-evidence.mjs`:
 * that script is itself one of the pinned `source-manifest.json` inputs for
 * the retained R2 evidence, so it must not be edited or exec'd against a
 * mutated copy without invalidating its own recorded hash.
 */
async function verifyRetainedRoles(root) {
  const construction = JSON.parse(await readFile(join(root, "evidence/construction.json"), "utf8"));
  assert.equal(construction.schema, "capsule.source-validator.unsigned-construction/v1");
  assert.equal(construction.status, "PASSED");
  assert.equal(construction.roles.length, 2);

  const digests = new Set();
  for (const role of construction.roles) {
    const executableItems = [role.launcher, role.parser];
    const dataItems = [role.infoPlist, role.resourcePolicy];
    for (const item of [...executableItems, ...dataItems]) {
      const path = join(root, item.path);
      const stat = await lstat(path);
      assert.equal(stat.isFile(), true, `${item.path}: must be a regular file`);
      assert.equal(stat.isSymbolicLink(), false, `${item.path}: must not be a symlink`);
      assert.equal(stat.size, item.bytes, `${item.path}: retained byte length changed`);
      assert.equal(await sha256(path), item.sha256, `${item.path}: retained byte content changed`);
      assert.equal(
        (stat.mode & SETID_MODE_MASK) === 0,
        true,
        `${item.path}: must not carry setuid/setgid bits`,
      );
      const isExecutable = (stat.mode & EXECUTABLE_MODE_MASK) !== 0;
      const shouldBeExecutable = executableItems.includes(item);
      assert.equal(
        isExecutable,
        shouldBeExecutable,
        `${item.path}: expected ${shouldBeExecutable ? "executable" : "non-executable"} mode`,
      );
    }
    assert.equal(role.resourcePolicy.activation, "inactive");
    assert.equal(role.resourcePolicy.activeMeasurements, false);
    digests.add(role.launcher.sha256);
    digests.add(role.parser.sha256);

    const bundleRoot = join(root, role.bundlePath);
    const expectedFiles = new Set(
      [role.infoPlist.path, role.launcher.path, role.parser.path, role.resourcePolicy.path].map(
        (path) => path.slice(role.bundlePath.length + 1),
      ),
    );
    const expectedDirs = new Set(["Contents", "Contents/MacOS", "Contents/Resources"]);
    const entries = await collectBundleEntries(bundleRoot);
    for (const entry of entries) {
      if (entry.isDir) {
        assert.ok(expectedDirs.has(entry.rel), `${role.role}: unexpected directory ${entry.rel}`);
      } else {
        assert.ok(expectedFiles.has(entry.rel), `${role.role}: unexpected file ${entry.rel}`);
      }
    }
    assert.equal(
      entries.length,
      expectedFiles.size + expectedDirs.size,
      `${role.role}: retained bundle entry count changed`,
    );
  }
  assert.equal(digests.size, 4, "both launchers and parser children must be role-distinct bytes");
  return construction;
}

// Copies the retained R2 artifact tree to a scratch temp directory, applies
// `mutate` (if given) to that copy only, then runs the verifier checks
// against the copy. The original repository artifact bytes are never
// touched. Always cleans up the temp directory.
async function withTemporaryArtifactCopy(mutate) {
  const dir = await mkdtemp(join(tmpdir(), "capsule-r2-verifier-"));
  try {
    await cp(artifactDir, dir, { recursive: true });
    if (mutate) await mutate(dir);
    return await verifyRetainedRoles(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("retains two closed unsigned role-specific Source Validator bundles", async () => {
  const construction = JSON.parse(
    await readFile(new URL("evidence/construction.json", artifactRoot), "utf8"),
  );

  assert.equal(construction.enrollment, "not-enrolled");
  assert.equal(construction.signing.appleIdentityUsed, false);
  assert.equal(construction.build.network, "offline");

  const expected = new Map([
    [
      "daemon",
      {
        service: "com.capsulecorp.capsule.source-validator.daemon.v1",
        bundle: "dist/CapsuleSourceValidatorDaemon.xpc",
        launcher: "Contents/MacOS/CapsuleSourceValidatorDaemonLauncher",
        parser: "Contents/Resources/capsule-mjs-source-validator-daemon",
      },
    ],
    [
      "approval-broker",
      {
        service: "com.capsulecorp.capsule.source-validator.approval-broker.v1",
        bundle: "dist/CapsuleSourceValidatorBroker.xpc",
        launcher: "Contents/MacOS/CapsuleSourceValidatorBrokerLauncher",
        parser: "Contents/Resources/capsule-mjs-source-validator-approval-broker",
      },
    ],
  ]);

  for (const role of construction.roles) {
    const wanted = expected.get(role.role);
    assert.ok(wanted, `unexpected role ${role.role}`);
    assert.equal(role.serviceIdentifier, wanted.service);
    assert.equal(role.bundlePath, wanted.bundle);
    assert.equal(role.launcher.path, `${wanted.bundle}/${wanted.launcher}`);
    assert.equal(role.parser.path, `${wanted.bundle}/${wanted.parser}`);
    assert.equal(role.launcher.appleIdentity, null);
    assert.equal(role.parser.appleIdentity, null);
  }

  await verifyRetainedRoles(artifactDir);
});

test("binds exact source, dependency, notice, SBOM, and unsigned provenance evidence", async () => {
  for (const path of [
    "evidence/build-manifest.json",
    "evidence/source-manifest.json",
    "evidence/license-report.json",
    "evidence/sbom.cdx.json",
    "evidence/provenance.intoto.json",
    "evidence/reproduction.json",
  ]) {
    const bytes = await readFile(new URL(path, artifactRoot));
    assert.ok(bytes.length > 0, `${path} is empty`);
  }

  const reproduction = JSON.parse(
    await readFile(new URL("evidence/reproduction.json", artifactRoot), "utf8"),
  );
  assert.equal(reproduction.byteIdentical, true);
  assert.equal(reproduction.sameHost, true);
  assert.equal(reproduction.independentBuilder, false);
  assert.equal(reproduction.roles.length, 2);
});

test("verifies cleanly against an unmutated temporary copy (mutation-test baseline control)", async () => {
  const construction = await withTemporaryArtifactCopy();
  assert.equal(construction.roles.length, 2);
});

test("refuses a mutated Info.plist service identifier", async () => {
  const identifier = "com.capsulecorp.capsule.source-validator.daemon.v1";
  await assert.rejects(
    withTemporaryArtifactCopy(async (dir) => {
      const plistPath = join(dir, "dist/CapsuleSourceValidatorDaemon.xpc/Contents/Info.plist");
      const original = await readFile(plistPath, "utf8");
      assert.ok(
        original.includes(identifier),
        "fixture must contain the expected daemon service identifier",
      );
      await writeFile(plistPath, original.replace(identifier, `${identifier}.mutated`));
    }),
    /retained byte (length|content) changed/,
  );
});

test("refuses a daemon/approval-broker executable swap", async () => {
  await assert.rejects(
    withTemporaryArtifactCopy(async (dir) => {
      const brokerParser = join(
        dir,
        "dist/CapsuleSourceValidatorBroker.xpc/Contents/Resources/capsule-mjs-source-validator-approval-broker",
      );
      const daemonParser = join(
        dir,
        "dist/CapsuleSourceValidatorDaemon.xpc/Contents/Resources/capsule-mjs-source-validator-daemon",
      );
      await copyFile(brokerParser, daemonParser);
    }),
    /retained byte content changed/,
  );
});

test("refuses a changed inactive resource policy", async () => {
  await assert.rejects(
    withTemporaryArtifactCopy(async (dir) => {
      const policyPath = join(
        dir,
        "dist/CapsuleSourceValidatorDaemon.xpc/Contents/Resources/resource-policy-inactive.bin",
      );
      const bytes = await readFile(policyPath);
      const mutated = Buffer.from(bytes);
      mutated[0] ^= 0xff;
      await writeFile(policyPath, mutated);
    }),
    /retained byte content changed/,
  );
});

test("refuses an unexpected file planted inside a retained bundle", async () => {
  await assert.rejects(
    withTemporaryArtifactCopy(async (dir) => {
      const extraPath = join(
        dir,
        "dist/CapsuleSourceValidatorDaemon.xpc/Contents/Resources/unexpected-payload.bin",
      );
      await writeFile(extraPath, "unexpected");
    }),
    /unexpected file/,
  );
});

test("refuses a symlink planted inside a retained bundle", async () => {
  await assert.rejects(
    withTemporaryArtifactCopy(async (dir) => {
      const linkPath = join(
        dir,
        "dist/CapsuleSourceValidatorDaemon.xpc/Contents/Resources/evil-symlink",
      );
      await symlink("/etc/passwd", linkPath);
    }),
    /symlink present inside retained bundle/,
  );
});

test("refuses a changed executable mode on a retained launcher", async () => {
  await assert.rejects(
    withTemporaryArtifactCopy(async (dir) => {
      const launcherPath = join(
        dir,
        "dist/CapsuleSourceValidatorDaemon.xpc/Contents/MacOS/CapsuleSourceValidatorDaemonLauncher",
      );
      await chmod(launcherPath, 0o644);
    }),
    /expected executable mode/,
  );
});
