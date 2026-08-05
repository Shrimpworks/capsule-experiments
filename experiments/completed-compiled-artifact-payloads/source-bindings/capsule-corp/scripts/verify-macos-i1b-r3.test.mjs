import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = join(repositoryRoot, "artifacts/macos-i1b-r3-signed-development-composition");

test("I1B/R3 constructs only the exact execution-disabled unsigned source topology", {
  skip: process.platform !== "darwin",
}, async () => {
  const temporaryRoot = await mkdtemp("/private/tmp/capsule-i1b-r3-test-");
  const bundle = join(temporaryRoot, "Capsule.app");
  try {
    execFileSync(join(artifactRoot, "scripts/build-unsigned.sh"), [bundle], {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    execFileSync(
      process.execPath,
      [join(artifactRoot, "scripts/generate-unsigned-manifest.mjs"), bundle],
      {
        cwd: repositoryRoot,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const manifest = JSON.parse(
      await readFile(
        join(bundle, "Contents/Resources/CapsuleI1BR3/unsigned-manifest.json"),
        "utf8",
      ),
    );
    assert.equal(manifest.executionState, "disabled");
    assert.equal(manifest.runtimePresent, false);
    assert.equal(manifest.backendPresent, false);
    assert.equal(manifest.guestPresent, false);
    assert.equal(manifest.teamIdentifier, "3DDR84M4JS");
    assert.equal(manifest.preferredCertificateSha1, "80A4969BCD1B3926020888094B9D812A283D3793");
    assert.deepEqual(
      manifest.r2UnsignedIdentities.map((role) => [
        role.role,
        role.launcherSha256,
        role.parserSha256,
      ]),
      [
        [
          "daemon",
          "4bc270c84f166dfb077d84458940411073f3c70a7f70db2e4af48601500b36cc",
          "f54c349e3a61b06e0b4d482bc1ed28924ffe712a7ff2531f504e7b57917defc7",
        ],
        [
          "approval-broker",
          "81284de5ba54e2288602bee4e9aca4e4513211b560bacfd1286b7ab57c922613",
          "7abac7da99f4b9edef77bb5ecfff135e8b752e5ed656664632272079b5408577",
        ],
      ],
    );

    const sourceText = await Promise.all(
      [
        "CapsuleStatusApp.swift",
        "CapsuleDaemon.c",
        "CapsuleSupervisor.c",
        "CapsuleProbe.c",
        "CapsuleContainerInventory.c",
      ].map((name) => readFile(join(artifactRoot, "Sources", name), "utf8")),
    );
    const combined = sourceText.join("\n");
    assert.match(combined, /execution.*disabled/is);
    assert.doesNotMatch(combined, /Developer ID Application/);
    assert.doesNotMatch(combined, /com\.apple\.security\.application-groups/);
    assert.doesNotMatch(combined, /com\.apple\.security\.temporary-exception/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("I1B/R3 retained signed, refusal, installed, and cleanup evidence remains closed", async () => {
  const evidenceRoot = join(artifactRoot, "evidence");
  const evidencePromises = [
    "signed-enrollment.json",
    "refusal-matrix.json",
    "installed-composition.json",
    "cleanup-platform-observation.json",
  ].map(async (name) => JSON.parse(await readFile(join(evidenceRoot, name), "utf8")));
  const [signed, refusal, installed, cleanup, profileMetadataSource] = await Promise.all([
    ...evidencePromises,
    readFile(join(artifactRoot, "scripts/profile-metadata.mjs"), "utf8"),
  ]);
  assert.equal(signed.status, "PASSED");
  assert.equal(signed.certificateSha1, "80A4969BCD1B3926020888094B9D812A283D3793");
  assert.equal(signed.developerIdUsed, false);
  assert.equal(refusal.status, "PASSED");
  assert.equal(refusal.cases.length, 8);
  assert.equal(installed.status, "PASSED");
  assert.equal(installed.executionState, "disabled");
  assert.equal(installed.cleanup.status, "PASSED");
  assert.equal(installed.cleanup.nonPlatformPrivateScratch, "removed");
  assert.equal(cleanup.status, "PASSED");
  assert.equal(cleanup.fullDiskAccessUsed, false);
  assert.equal(cleanup.fixedPrivateScratchSelfTest.residualNonPlatformScratch, false);
  assert.match(profileMetadataSource, /createHash\("sha256"\)/);
  assert.doesNotMatch(profileMetadataSource, /createHash\("sha1"\)/);
  assert.match(
    profileMetadataSource,
    /D3E9FBDDBC342F747C3649B5A6FFB307A575827404E02D638C11B6B795A09629/,
  );
});

test("I1B/R3 constraint and entitlement inputs remain exact and parseable", {
  skip: process.platform !== "darwin",
}, async () => {
  const constraintNames = [
    "broker-launcher-self.coderequirement",
    "broker-parser-self.coderequirement",
    "broker-self.coderequirement",
    "daemon-launcher-self.coderequirement",
    "daemon-parser-self.coderequirement",
    "daemon-self.coderequirement",
    "launchd-parent.coderequirement",
    "no-nonplatform-libraries.coderequirement",
    "supervisor-self.coderequirement",
  ];
  for (const name of constraintNames) {
    execFileSync("codesign", ["--validate-constraint", join(artifactRoot, "Constraints", name)], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
  for (const name of [
    "broker.plist",
    "daemon.plist",
    "supervisor.plist",
    "validator-launcher.plist",
    "parser-child.plist",
  ]) {
    execFileSync("plutil", ["-lint", join(artifactRoot, "Entitlements", name)], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const text = await readFile(join(artifactRoot, "Entitlements", name), "utf8");
    assert.match(text, /com\.apple\.security\.app-sandbox/);
    assert.doesNotMatch(text, /get-task-allow|network\.client|application-groups|hypervisor/);
  }
});
