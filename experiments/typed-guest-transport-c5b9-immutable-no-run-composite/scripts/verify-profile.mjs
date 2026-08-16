import assert from "node:assert/strict";

const exactKeys = (value, expected, label) => {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} key set`);
};

export function validateProfile(profile) {
  assert.equal(profile.objectType, "capsule.c5b9.immutable-no-run-composite");
  assert.equal(profile.objectVersion, 1);
  assert.equal(profile.status, "construction-only-not-authorized");
  exactKeys(profile.components, [
    "hostRunner", "libkrun", "libkrunfw", "runtimeRoot", "controller", "rootBoundEffects",
  ], "component set");
  for (const [name, reference] of Object.entries(profile.components)) {
    assert.equal(typeof reference.path, "string", `${name} component path`);
    assert.equal(Number.isSafeInteger(reference.bytes) && reference.bytes > 0, true, `${name} component bytes`);
    assert.match(reference.sha256, /^[0-9a-f]{64}$/u, `${name} component digest`);
  }
  assert.equal(profile.components.runtimeRoot.bytes, 100663296, "runtime root size");
  assert.deepEqual(profile.abi.controllerDefined, profile.abi.effectUndefinedController, "controller ABI closure");
  assert.deepEqual(profile.abi.runnerLibkrunImports, profile.abi.effectLibkrunImports, "libkrun import closure");
  assert.equal(profile.abi.libkrunExportsCoverImports, true, "ABI export coverage");
  assert.deepEqual(profile.abi.fixedOperationPort, {
    symbol: "_c5b8_controlled_test_operation", provider: null, bindingStatus: "BLOCKED",
  }, "operation port boundary");
  assert.equal(profile.abi.libkrunfwRole, "sole-runtime-boot-kernel-carrier", "libkrunfw role");
  assert.equal(profile.abi.separateFirmware, "INAPPLICABLE", "firmware role");
  assert.deepEqual(profile.transport.teardownOrder, [
    "child-tree-terminated", "runner-absent", "root-unlinked", "durable-commit", "delivery",
  ], "teardown ordering");
  assert.equal(profile.transport.completionLast, true, "completion-last");
  assert.equal(profile.transport.payloadMaximumBytes, 262144, "payload cap");
  assert.equal(profile.transport.sourcePhysicalMaximum, 262296, "source physical cap");
  assert.equal(profile.transport.inputPhysicalMaximum, 262296, "input physical cap");
  assert.equal(profile.transport.completionPhysicalMaximum, 262368, "completion physical cap");
  assert.equal(profile.transport.completionRetentionBytes, 262369, "completion retention cap");
  assert.deepEqual(profile.authorization, {
    ownerConfirmedHost: null,
    ownedDisposableGuest: null,
    authorizationId: null,
    executionAuthorized: false,
    callerSelectedAuthority: false,
  }, "authorization boundary");
  assert.deepEqual(profile.historicalV19V27, {
    rawBytesRecovered: false,
    identityReused: false,
  }, "historical identity boundary");
  assert.equal(Object.values(profile.effects).every((value) => value === false), true, "effects boundary");
}
