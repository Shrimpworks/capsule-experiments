import assert from "node:assert/strict";
import { chmod, copyFile, cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertBundleRelativePath,
  bundleManifestRelativePath,
  bundlePathUtf8BytesCap,
  profileRelativePath,
  verifyBundle,
  verifyProfileBytes,
} from "../artifacts/macos-i2b2-unsigned-installation-bundle/scripts/i2b2-lib.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const artifactRoot = join(repositoryRoot, "artifacts/macos-i2b2-unsigned-installation-bundle");
const bundleRoot = join(artifactRoot, "dist/Capsule.app");
const evidence = JSON.parse(
  await readFile(join(artifactRoot, "evidence/construction.json"), "utf8"),
);
const expectedManifestSha256 = evidence.bundleManifest.sha256;
const canonicalProfile = await readFile(
  join(repositoryRoot, "schemas/conformance/macos-i2b2-unsigned-installation/profile.json"),
);

async function withBundleCopy(mutate, expectedDigest = expectedManifestSha256) {
  const root = await mkdtemp(join(tmpdir(), "capsule-i2b2-test-"));
  const copy = join(root, "Capsule.app");
  try {
    await cp(bundleRoot, copy, { recursive: true });
    await mutate(copy);
    return await verifyBundle({ bundleRoot: copy, expectedManifestSha256: expectedDigest });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function mutatedProfile(mutator) {
  const value = JSON.parse(canonicalProfile);
  mutator(value);
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

test("retains exact unsigned I2B2 eight-role bundle and refuses activation", async () => {
  const readback = await verifyBundle({ bundleRoot, expectedManifestSha256 });
  assert.deepEqual(readback, evidence.readback);
  assert.equal(readback.bundleFileCount, 31);
  assert.equal(readback.roleCount, 8);
  assert.equal(readback.fieldCount, 252);
  assert.equal(readback.activationDecision, "refuse");
  assert.equal(evidence.appleIdentityUsed, false);
  assert.equal(evidence.keychainAccessed, false);
  assert.equal(evidence.serviceRegistered, false);
  assert.equal(evidence.processLaunched, false);
  assert.equal(evidence.filesystemStateCreated, false);
  assert.equal(evidence.bootstrapRequestCreated, false);
  assert.equal(evidence.bootstrapRecordCreated, false);
  assert.equal(evidence.supervisorStoreCreated, false);
});

test("profile and bundle known answers retain exact cross-links and inactive inputs", async () => {
  const profile = await verifyProfileBytes(canonicalProfile);
  assert.equal(
    profile.containingRelease.i1aBundleManifest.sha256,
    "5bd80097775908031b1a4c90680e8c7656cc5e9f97df2cc187592f75ee67a56f",
  );
  assert.equal(
    profile.containingRelease.i1bSignedDevelopmentEnrollment.sha256,
    "afc7002032fc1ff4ead29269e7a370d94524aff42ca9181827a03233a31fbc94",
  );
  assert.equal(
    profile.bootstrapObjects.fixtureManifest.sha256,
    "9f1b8a86be9ada8e6afa4b913aef027dfe031d9ab69b0d0913c4f63132163203",
  );
  assert.equal(
    profile.services[1].serviceName,
    "3DDR84M4JS.com.capsulecorp.capsule.bootstrap.v0.supervisor",
  );
  assert.equal(profile.roles[7].signingIdentifier, "com.capsulecorp.capsule.trust-bootstrap.v1");
  assert.equal(
    profile.entitlements[1].valueIdentity,
    "3DDR84M4JS.com.capsulecorp.capsule.bootstrap.v0",
  );
  assert.equal(
    profile.constraints.activeCodeDirectoryHashSetState,
    "unavailable-no-signing-performed",
  );
});

test("profile raw cap plus one refuses before parse", async () => {
  await assert.rejects(verifyProfileBytes(Buffer.alloc(65537, 0x20)), /profile raw cap exceeded/);
});

test("bundle path UTF-8 cap is inclusive and cap plus one refuses", () => {
  assert.doesNotThrow(() => assertBundleRelativePath("a".repeat(bundlePathUtf8BytesCap)));
  assert.throws(
    () => assertBundleRelativePath("a".repeat(bundlePathUtf8BytesCap + 1)),
    /bundle path UTF-8 cap exceeded/,
  );
});

for (const [name, mutate] of [
  ["missing role", (value) => value.roles.pop()],
  [
    "extra role",
    (value) => value.roles.push({ ...value.roles[7], roleId: "capsule.role.unexpected" }),
  ],
  [
    "duplicate role",
    (value) => {
      value.roles[7].roleId = value.roles[6].roleId;
    },
  ],
  [
    "mixed role",
    (value) => {
      value.roles[7].signingIdentifier = value.roles[2].signingIdentifier;
    },
  ],
  [
    "wrong profile",
    (value) => {
      value.profileId = "capsule.macos-installation.wrong/i2b2";
    },
  ],
  [
    "wrong containing release",
    (value) => {
      value.containingRelease.i1aBundleManifest.sha256 = "00".repeat(32);
    },
  ],
  [
    "wrong service",
    (value) => {
      value.services[1].serviceName = "wrong.service";
    },
  ],
  [
    "unsafe entitlement",
    (value) =>
      value.entitlements.push({
        ...value.entitlements[0],
        key: "com.apple.security.network.client",
      }),
  ],
  [
    "active signing",
    (value) => {
      value.stateProjection.signingState = "active";
    },
  ],
  [
    "bootstrap created",
    (value) => {
      value.stateProjection.protectedRootState = "created";
    },
  ],
  [
    "store created",
    (value) => {
      value.stateProjection.storeState = "created";
    },
  ],
]) {
  test(`profile refuses ${name}`, async () => {
    await assert.rejects(
      verifyProfileBytes(mutatedProfile(mutate)),
      /profile known answer changed/,
    );
  });
}

test("bundle refuses missing, extra, and substituted role bytes", async () => {
  await assert.rejects(
    withBundleCopy((copy) =>
      rm(
        join(
          copy,
          "Contents/XPCServices/CapsuleTrustBootstrap.xpc/Contents/MacOS/CapsuleTrustBootstrap",
        ),
      ),
    ),
    /closed file count changed|required I2B2 file missing/,
  );
  await assert.rejects(
    withBundleCopy((copy) => writeFile(join(copy, "Contents/Resources/unexpected"), "extra")),
    /closed file count changed/,
  );
  await assert.rejects(
    withBundleCopy((copy) =>
      copyFile(
        join(
          copy,
          "Contents/Library/Helpers/CapsuleSupervisor.app/Contents/MacOS/CapsuleSupervisor",
        ),
        join(
          copy,
          "Contents/XPCServices/CapsuleTrustBootstrap.xpc/Contents/MacOS/CapsuleTrustBootstrap",
        ),
      ),
    ),
    /manifest metadata\/digest mismatch/,
  );
});

test("bundle refuses wrong service, unsafe entitlement, and executable Coordinator", async () => {
  await assert.rejects(
    withBundleCopy(async (copy) => {
      const path = join(
        copy,
        "Contents/Resources/CapsuleI2B2/DeclaredInputs/ServiceManagement/supervisor-bootstrap-LaunchAgent.plist",
      );
      const bytes = await readFile(path, "utf8");
      await writeFile(
        path,
        bytes.replace(
          "3DDR84M4JS.com.capsulecorp.capsule.bootstrap.v0.supervisor",
          "wrong.service",
        ),
      );
    }),
    /manifest metadata\/digest mismatch|declared input changed/,
  );
  await assert.rejects(
    withBundleCopy(async (copy) => {
      const path = join(
        copy,
        "Contents/Resources/CapsuleI2B2/DeclaredInputs/Entitlements/coordinator.plist",
      );
      const bytes = await readFile(path, "utf8");
      await writeFile(
        path,
        bytes.replace("</dict>", "<key>com.apple.security.network.client</key><true/></dict>"),
      );
    }),
    /manifest metadata\/digest mismatch|declared input changed/,
  );
  await assert.rejects(
    withBundleCopy((copy) =>
      chmod(
        join(
          copy,
          "Contents/XPCServices/CapsuleTrustBootstrap.xpc/Contents/MacOS/CapsuleTrustBootstrap",
        ),
        0o755,
      ),
    ),
    /manifest metadata\/digest mismatch|placeholder became executable/,
  );
});

test("bundle refuses active signing and bootstrap/store creation projections", async () => {
  await assert.rejects(
    withBundleCopy((copy) =>
      writeFile(
        join(
          copy,
          "Contents/XPCServices/CapsuleTrustBootstrap.xpc/Contents/embedded.provisionprofile",
        ),
        "forbidden",
      ),
    ),
    /closed file count changed|provisioning profile present/,
  );
  await assert.rejects(
    withBundleCopy((copy) =>
      writeFile(join(copy, "Contents/Resources/CapsuleI2B2/supervisor.state"), "forbidden"),
    ),
    /closed file count changed/,
  );
  await assert.rejects(
    withBundleCopy((copy) =>
      writeFile(join(copy, "Contents/Resources/CapsuleI2B2/supervisor.store"), "forbidden"),
    ),
    /closed file count changed/,
  );
});

test("bundle manifest refuses duplicate path and raw cap plus one", async () => {
  await assert.rejects(
    withBundleCopy(async (copy) => {
      const path = join(copy, bundleManifestRelativePath);
      const value = JSON.parse(await readFile(path, "utf8"));
      value.files.push(value.files[0]);
      await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
    }, ""),
    /manifest.*length|duplicate I2B2 manifest path/,
  );
  await assert.rejects(
    withBundleCopy(
      (copy) => writeFile(join(copy, bundleManifestRelativePath), Buffer.alloc(262145, 0x20)),
      "",
    ),
    /manifest raw cap exceeded/,
  );
});

test("bundle refuses profile substitution before remaining readback", async () => {
  await assert.rejects(
    withBundleCopy((copy) =>
      writeFile(
        join(copy, profileRelativePath),
        mutatedProfile((value) => {
          value.stateProjection.signingState = "active";
        }),
      ),
    ),
    /profile known answer changed/,
  );
});
