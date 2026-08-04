import assert from "node:assert/strict";
import test from "node:test";
import { signEnvelope, verifyEnvelope } from "../src/profile.js";

test("both object profiles sign and verify", () => {
  for (const kind of ["approval-grant", "enforcement-transcript"] as const)
    verifyEnvelope(kind, signEnvelope(kind));
});

test("object profiles are mutually exclusive", () => {
  assert.throws(() => verifyEnvelope("approval-grant", signEnvelope("enforcement-transcript")));
  assert.throws(() => verifyEnvelope("enforcement-transcript", signEnvelope("approval-grant")));
});
