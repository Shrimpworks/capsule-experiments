import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  decodeBase64URL,
  encodeBase64URL,
  payloadBytes,
  protectedBytes,
  signEnvelope,
  verifyEnvelope,
} from "../src/profile.js";

type GoVectors = {
  payloadHex: string;
  protectedHex: string;
  valid: string;
  validComplementaryS: string;
  negative: Record<string, string>;
};

const fixturePath = resolve(process.cwd(), "../fixtures/go-vectors.json");
const fixtures = JSON.parse(readFileSync(fixturePath, "utf8")) as GoVectors;

test("TypeScript emits the same protected and payload bytes as Go", () => {
  assert.equal(Buffer.from(payloadBytes()).toString("hex"), fixtures.payloadHex);
  assert.equal(Buffer.from(protectedBytes()).toString("hex"), fixtures.protectedHex);
});

test("TypeScript verifies its own and the Go-produced COSE_Sign1", () => {
  const own = signEnvelope();
  verifyEnvelope(own);
  verifyEnvelope(decodeBase64URL(fixtures.valid));
  verifyEnvelope(decodeBase64URL(fixtures.validComplementaryS));
  assert.match(encodeBase64URL(own), /^[A-Za-z0-9_-]+$/u);
});

for (const [name, encoded] of Object.entries(fixtures.negative)) {
  test(`TypeScript rejects Go negative vector: ${name}`, () => {
    assert.throws(() => verifyEnvelope(decodeBase64URL(encoded)));
  });
}
