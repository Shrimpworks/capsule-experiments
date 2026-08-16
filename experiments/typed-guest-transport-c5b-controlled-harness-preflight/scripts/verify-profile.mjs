import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const exactKeys = (value, expected, label) => {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} key set`);
};

export function validatePreflight(profile) {
  exactKeys(profile, [
    "objectType", "objectVersion", "identity", "status", "components", "authorization",
    "exactCandidate", "observedBindings", "requiredSuccessor", "effects",
  ], "preflight");
  assert.equal(profile.objectType, "capsule.c5b.controlled-harness-preflight");
  assert.equal(profile.objectVersion, 1);
  assert.equal(profile.identity, "capsule.c5b.controlled-harness-preflight/2026-08-16");
  assert.equal(profile.status, "build-only-no-run");

  const expectedComponents = {
    c5b9Profile: ["experiments/typed-guest-transport-c5b9-immutable-no-run-composite/contracts/composite-profile.json", 4845, "b241ff429696aa71e412b6889065b50cb941ba893baebbb78c55e5c8dbc520f0"],
    c5b9Plan: ["experiments/typed-guest-transport-c5b9-immutable-no-run-composite/contracts/no-run-composite.json", 1696, "be39567707323e91be0a5c5d56c51d9af9db5f2a13c4ed22a3183cd8ab46d502"],
    hostRunnerSource: ["experiments/typed-guest-transport-c5b2-governed-input-closure/inputs/c2b-v4/capsule-host-runner.c", 7917, "5a5560fa667390253bf504d7c045fcbcc304fa5829b22a8acf1fff00a8e37eb9"],
    hostRunner: ["experiments/typed-guest-transport-c5b2-governed-input-closure/inputs/c2b-v4/capsule-host-runner", 100488, "a30e3f7cba5f480b6e164536854749b5e1ba3349f20af6c9c8e5d2590bffe1ad"],
    rootBoundEffects: ["experiments/typed-guest-transport-c5b8-c5b7-root-binding-successor/dist/controlled-effects-root-bound-a.o", 15255, "2eaaef8a5480e0e6f9d416afef7bc9d467f25c0c4f6122d8e365e90ab3e40d94"],
    effectAdapter: ["experiments/typed-guest-transport-c5b8-c5b7-root-binding-successor/generated/historical_adapter_local.c", 10835, "1619ba985e46f476189439155606484c4a1a462d31f0cf2eec7085ea88b10404"],
    operationHeader: ["experiments/typed-guest-transport-c5b8-c5b7-root-binding-successor/inputs/c5b8/source/controlled_effects_internal.h", 2659, "f028a5cec6a6470e1b2aec170fbb7bd379f48d6f79e32d1e017a73b51e01bc74"],
  };
  exactKeys(profile.components, Object.keys(expectedComponents), "components");
  for (const [name, [path, bytes, sha256]] of Object.entries(expectedComponents)) {
    assert.deepEqual(profile.components[name], { path, bytes, sha256 }, `${name} component`);
  }

  exactKeys(profile.authorization, [
    "ownerConfirmedHost", "ownedDisposableGuest", "preparationAuthorized",
    "executionAuthorized", "finalManifestAuthorizationRequired",
  ], "authorization");
  assert.deepEqual(profile.authorization.ownerConfirmedHost, {
    hostname: "Dylans-MacBook-Pro.local",
    architecture: "Apple silicon",
    operatingSystem: "macOS 26.5.2 (25F84)",
  }, "owner-confirmed host");
  assert.deepEqual(profile.authorization.ownedDisposableGuest, {
    platform: "Linux/arm64",
    freshPerAttempt: true,
    builtSolelyFromMerge: "3965e6b5cc87d476da7f431d7ed8a5758011a1b8",
  }, "owned disposable guest");
  assert.equal(profile.authorization.preparationAuthorized, true, "preparation authorization");
  assert.equal(profile.authorization.executionAuthorized, false, "execution authorization");
  assert.equal(profile.authorization.finalManifestAuthorizationRequired, true,
    "final manifest authorization");

  assert.equal(profile.exactCandidate.disposition, "NO_GO", "candidate disposition");
  assert.equal(profile.exactCandidate.operationProviderSymbol,
    "_c5b8_controlled_test_operation", "operation provider symbol");
  assert.deepEqual(profile.exactCandidate.contradictions, [
    "root-identity-mismatch",
    "execution-order-mismatch",
    "operation-protocol-mismatch",
    "duplicate-libkrun-ownership",
  ], "closed contradiction set");

  assert.equal(profile.observedBindings.c5b9Merge,
    "3965e6b5cc87d476da7f431d7ed8a5758011a1b8", "C5b9 merge");
  assert.equal(profile.observedBindings.c5b9RootBytes, 100663296, "C5b9 root bytes");
  assert.equal(profile.observedBindings.c5b9RootSha256,
    "5ad18f20cbc97c7a70ead3e795fd3649672513323041e913b0eb55b7acc88775",
    "C5b9 root digest");
  assert.equal(profile.observedBindings.hostRunnerRootBytes, 134217728,
    "host runner root bytes");
  assert.equal(profile.observedBindings.hostRunnerRootSha256,
    "390a4786a20d45f1c691ec8c203f84f5e9d372a30e98f867cc8309a144ca6798",
    "host runner root digest");
  assert.notEqual(profile.observedBindings.hostRunnerRootBytes,
    profile.observedBindings.c5b9RootBytes, "host runner root mismatch must remain visible");
  assert.notEqual(profile.observedBindings.hostRunnerRootSha256,
    profile.observedBindings.c5b9RootSha256, "host runner root digest mismatch must remain visible");
  assert.equal(profile.observedBindings.startEnterWithinStartRunnerOrdinal, 17,
    "start-enter operation ordinal");
  assert.equal(profile.observedBindings.startEnterNominalOrdinal, 19, "start-enter nominal ordinal");
  assert.equal(profile.observedBindings.sourceWriteNominalOrdinal, 20, "source-write nominal ordinal");
  assert.equal(profile.observedBindings.inputWriteNominalOrdinal, 21, "input-write nominal ordinal");
  assert.equal(profile.observedBindings.startEnterNominalOrdinal <
    profile.observedBindings.sourceWriteNominalOrdinal, true, "effect ordering");
  assert.equal(profile.observedBindings.startEnterNominalOrdinal <
    profile.observedBindings.inputWriteNominalOrdinal, true, "effect ordering");

  assert.equal(profile.requiredSuccessor.singleLibkrunOwner, "fixed-host-runner-process");
  assert.deepEqual(profile.requiredSuccessor.operationSurface, [
    "create-fixed-endpoints",
    "spawn-fixed-runner",
    "verify-ready-byte",
    "write-source-frame",
    "write-input-frame",
    "close-input-writers",
    "send-start-byte",
    "drain-and-validate-completion",
    "join-terminal-state",
    "prove-absence",
    "remove-fixed-root",
    "commit-before-delivery",
  ], "successor operation surface");
  assert.equal(profile.requiredSuccessor.callerSelectedAuthority, false, "caller authority");
  assert.equal(Object.values(profile.effects).every((value) => value === false), true,
    "effects boundary");
}

export async function verifyArchiveInventory(experimentRoot) {
  const manifestPath = join(experimentRoot, "manifests/archive-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const files = [];
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (child !== manifestPath) files.push(child);
    }
  }
  await walk(experimentRoot);
  const actual = [];
  for (const absolute of files.sort()) {
    const bytes = await readFile(absolute);
    actual.push({
      path: relative(experimentRoot, absolute),
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  assert.deepEqual(manifest.files, actual, "closed archive inventory");
  assert.equal(manifest.manifestSelfExcluded, true, "manifest self exclusion");
}
