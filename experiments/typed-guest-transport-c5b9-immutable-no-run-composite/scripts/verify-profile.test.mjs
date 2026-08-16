#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import { validateProfile } from "./verify-profile.mjs";

function validProfile() {
  const component = (path, bytes, sha256) => ({ path, bytes, sha256 });
  return {
    objectType: "capsule.c5b9.immutable-no-run-composite",
    objectVersion: 1,
    identity: "capsule.c5b9.immutable-no-run-composite/2026-08-16",
    status: "construction-only-not-authorized",
    predecessors: {
      c5b2: "5a2f835e8c9df8279237f940f5af757e119593bd",
      c5b4: "068e221dafa7cf3e9a945cee7e8bf077eeed1c6b",
      c5b7: "78485fb91a31733c568fe43e5fa295474e5956e1",
      c5b8RootBinding: "b0819d76883eb86cbbc03b2b7033fe55bedbf713",
    },
    components: {
      hostRunner: component("runner", 1, "a".repeat(64)),
      libkrun: component("libkrun", 1, "b".repeat(64)),
      libkrunfw: component("libkrunfw", 1, "c".repeat(64)),
      runtimeRoot: component("root", 100663296, "d".repeat(64)),
      controller: component("controller", 1, "e".repeat(64)),
      rootBoundEffects: component("effects", 1, "f".repeat(64)),
    },
    abi: {
      controllerDefined: ["_c5b3_controller_reset", "_c5b3_controller_step"],
      effectUndefinedController: ["_c5b3_controller_reset", "_c5b3_controller_step"],
      libkrunSymbols: ["_krun_create_ctx"],
      runnerLibkrunImports: ["_krun_create_ctx"],
      effectLibkrunImports: ["_krun_create_ctx"],
      libkrunExportsCoverImports: true,
      fixedOperationPort: { symbol: "_c5b8_controlled_test_operation", provider: null, bindingStatus: "BLOCKED" },
      libkrunfwRole: "sole-runtime-boot-kernel-carrier",
      separateFirmware: "INAPPLICABLE",
    },
    transport: {
      payloadMaximumBytes: 262144,
      sourcePhysicalMaximum: 262296,
      inputPhysicalMaximum: 262296,
      completionPhysicalMaximum: 262368,
      completionRetentionBytes: 262369,
      completionLast: true,
      teardownOrder: ["child-tree-terminated", "runner-absent", "root-unlinked", "durable-commit", "delivery"],
    },
    authorization: {
      ownerConfirmedHost: null,
      ownedDisposableGuest: null,
      authorizationId: null,
      executionAuthorized: false,
      callerSelectedAuthority: false,
    },
    historicalV19V27: { rawBytesRecovered: false, identityReused: false },
    effects: {
      libkrunLoaded: false,
      artifactLoaded: false,
      runnerStarted: false,
      hvfCalled: false,
      vmStarted: false,
      guestStarted: false,
      networkAccessed: false,
      credentialsAccessed: false,
      productStateMutated: false,
      admissionChanged: false,
    },
  };
}

test("accepts the closed no-run C5b9 authority shape", () => {
  assert.doesNotThrow(() => validateProfile(validProfile()));
});

for (const [name, mutate, message] of [
  ["missing component", (value) => delete value.components.libkrunfw, /component set/],
  ["caller authority", (value) => { value.authorization.callerSelectedAuthority = true; }, /authorization/],
  ["execution authorization", (value) => { value.authorization.executionAuthorized = true; }, /authorization/],
  ["guest effect", (value) => { value.effects.guestStarted = true; }, /effects/],
  ["incomplete ABI coverage", (value) => { value.abi.libkrunExportsCoverImports = false; }, /ABI/],
  ["invented operation provider", (value) => { value.abi.fixedOperationPort.provider = "test-double"; }, /operation port/],
  ["non-terminal delivery", (value) => { value.transport.teardownOrder.reverse(); }, /teardown/],
  ["historical identity reuse", (value) => { value.historicalV19V27.identityReused = true; }, /historical/],
]) {
  test(`rejects ${name}`, () => {
    const profile = validProfile();
    mutate(profile);
    assert.throws(() => validateProfile(profile), message);
  });
}
