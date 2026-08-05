import assert from "node:assert/strict";
import { chmod, copyFile, cp, lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { verifyBundle } from "../artifacts/macos-i1a-unsigned-app-shell/scripts/i1a-lib.mjs";

const artifactRoot = fileURLToPath(
  new URL("../artifacts/macos-i1a-unsigned-app-shell/", import.meta.url),
);
const bundleRoot = join(artifactRoot, "dist/Capsule.app");
const evidence = JSON.parse(
  await readFile(join(artifactRoot, "evidence/construction.json"), "utf8"),
);
const expectedManifestSha256 = evidence.bundleManifest.sha256;

async function withBundleCopy(mutate) {
  const root = await mkdtemp(join(tmpdir(), "capsule-i1a-test-"));
  const copy = join(root, "Capsule.app");
  try {
    await cp(bundleRoot, copy, { recursive: true });
    if (mutate) await mutate(copy);
    return await verifyBundle({ bundleRoot: copy, expectedManifestSha256 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("retains the exact unsigned I1A seven-role tree and refuses activation", async () => {
  const readback = await verifyBundle({ bundleRoot, expectedManifestSha256 });
  assert.equal(readback.roleCount, 7);
  assert.equal(readback.bundleFileCount, 23);
  assert.equal(readback.activationDecision, "refuse");
  assert.equal(readback.activationReason, "signing-profile-inactive");

  assert.equal(evidence.status, "PASSED");
  assert.equal(evidence.scope, "unsigned-bytes-and-layout-only");
  assert.equal(evidence.intendedDevelopmentTeamId, "3DDR84M4JS");
  assert.equal(evidence.intendedTeamState, "inactive-metadata-only");
  assert.equal(evidence.appleIdentityUsed, false);
  assert.equal(evidence.provisioningProfilePresent, false);
  assert.equal(evidence.keychainAccessed, false);
  assert.equal(evidence.serviceRegistered, false);
  assert.equal(evidence.processLaunched, false);
  assert.equal(evidence.networkUsed, false);
  assert.equal(evidence.executionState, "disabled");
});

test("Swift UI is a closed typed status surface with no activation or runtime API", async () => {
  const source = await readFile(join(artifactRoot, "Sources/CapsuleStatusApp.swift"), "utf8");
  for (const required of [
    "UNSIGNED CONSTRUCTION CHECKPOINT",
    "I1A unsigned construction",
    "3DDR84M4JS (inactive)",
    "execution remains permanently disabled in I1A",
  ]) {
    assert.ok(source.includes(required), `missing visible status text: ${required}`);
  }
  for (const prohibited of [
    "SMAppService",
    "NSXPC",
    "WKWebView",
    "WebKit",
    "LocalAuthentication",
    "Security.framework",
    "Hypervisor",
    "Process(",
    "NSTask",
    "URLSession",
  ]) {
    assert.equal(source.includes(prohibited), false, `prohibited Swift surface: ${prohibited}`);
  }
});

test("daemon and Supervisor placeholders are role-distinct inert non-executable bytes", async () => {
  const paths = [
    "Contents/Library/Helpers/CapsuleDaemon.app/Contents/MacOS/CapsuleDaemon",
    "Contents/Library/Helpers/CapsuleSupervisor.app/Contents/MacOS/CapsuleSupervisor",
  ];
  const contents = [];
  for (const path of paths) {
    const status = await lstat(join(bundleRoot, path));
    assert.equal(status.mode & 0o111, 0, `${path}: placeholder must not be executable`);
    const bytes = await readFile(join(bundleRoot, path), "utf8");
    assert.ok(bytes.includes("TEST-ONLY PLACEHOLDER"));
    assert.ok(bytes.includes("activation=refuse"));
    assert.ok(bytes.includes("guest-creation=impossible-no-program-bytes"));
    contents.push(bytes);
  }
  assert.notEqual(contents[0], contents[1], "role placeholders must be substitution-distinct");
});

test("readback refuses a missing required role byte", async () => {
  await assert.rejects(
    withBundleCopy(async (copy) => {
      await rm(
        join(
          copy,
          "Contents/Library/Helpers/CapsuleDaemon.app/Contents/XPCServices/CapsuleSourceValidatorDaemon.xpc/Contents/Resources/capsule-mjs-source-validator-daemon",
        ),
      );
    }),
    /closed file count changed|required I1A file missing/,
  );
});

test("readback refuses mixed role-private R2 parser bytes", async () => {
  await assert.rejects(
    withBundleCopy(async (copy) => {
      await copyFile(
        join(
          copy,
          "Contents/XPCServices/CapsuleSourceValidatorBroker.xpc/Contents/Resources/capsule-mjs-source-validator-approval-broker",
        ),
        join(
          copy,
          "Contents/Library/Helpers/CapsuleDaemon.app/Contents/XPCServices/CapsuleSourceValidatorDaemon.xpc/Contents/Resources/capsule-mjs-source-validator-daemon",
        ),
      );
    }),
    /bytes substituted|R2 (size|identity) changed/,
  );
});

test("readback refuses an extra file anywhere in the closed bundle", async () => {
  await assert.rejects(
    withBundleCopy(async (copy) => {
      await writeFile(join(copy, "Contents/Resources/unexpected-runtime"), "forbidden");
    }),
    /closed file count changed|unexpected I1A file/,
  );
});

test("readback refuses substituted placeholder bytes", async () => {
  await assert.rejects(
    withBundleCopy(async (copy) => {
      const daemon = join(
        copy,
        "Contents/Library/Helpers/CapsuleDaemon.app/Contents/MacOS/CapsuleDaemon",
      );
      const supervisor = join(
        copy,
        "Contents/Library/Helpers/CapsuleSupervisor.app/Contents/MacOS/CapsuleSupervisor",
      );
      await copyFile(daemon, supervisor);
    }),
    /byte length changed|bytes substituted|closed template or placeholder changed/,
  );
});

test("readback refuses an executable mode added to an inert placeholder", async () => {
  await assert.rejects(
    withBundleCopy(async (copy) => {
      const path = join(
        copy,
        "Contents/Library/Helpers/CapsuleDaemon.app/Contents/MacOS/CapsuleDaemon",
      );
      await chmod(path, 0o755);
    }),
    /mode changed/,
  );
});

test("readback refuses replacement of the bundle manifest", async () => {
  await assert.rejects(
    withBundleCopy(async (copy) => {
      const path = join(copy, "Contents/Resources/CapsuleConstruction/bundle-manifest.json");
      const manifest = JSON.parse(await readFile(path, "utf8"));
      manifest.executionState = "enabled";
      await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
    }),
    /bundle manifest identity changed/,
  );
});
