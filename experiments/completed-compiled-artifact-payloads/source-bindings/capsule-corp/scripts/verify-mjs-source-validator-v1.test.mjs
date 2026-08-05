import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const corpusRoot = new URL("../schemas/conformance/v0/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", corpusRoot), "utf8"));
const cases = manifest.cases.filter(
  (candidate) =>
    candidate.expected.owner === "source-validator-passive-v1-contract" &&
    candidate.implementations.typescript === "verified",
);

test("independently decodes every passive Source Validator v1 fixture", async () => {
  assert.equal(cases.length, 46);
  for (const candidate of cases) {
    const role = candidate.id.includes(".approval-broker.") ? 2 : 1;
    const fixture = await readFile(new URL(candidate.fixture.path, corpusRoot));
    let classification = null;
    try {
      const decoded = decode(candidate.object, role, fixture);
      if (candidate.object === "SourceValidatorV1Request") {
        await requireCurrentRequestContext(role, decoded);
      }
      if (candidate.object === "SourceValidatorV1Result") {
        assert.ok(candidate.context.request);
        const request = decode(
          "SourceValidatorV1Request",
          role,
          await readFile(new URL(candidate.context.request.path, corpusRoot)),
        );
        requireResultBinding(request, decoded);
      }
    } catch (error) {
      classification = error.classification;
    }
    if (candidate.expected.decision === "accept") {
      assert.equal(classification, null, `${candidate.id} unexpectedly refused`);
    } else {
      assert.equal(
        classification,
        candidate.expected.classification,
        `${candidate.id} rejection classification`,
      );
      assert.deepEqual(candidate.expected.effects, {
        state: false,
        approval: false,
        key: false,
        ipcEndpoint: false,
        process: false,
        runtime: false,
        backend: false,
        guest: false,
      });
    }
  }
});

function decode(object, expectedRole, frame) {
  switch (object) {
    case "SourceValidatorV1Request":
      return decodeRequest(expectedRole, frame);
    case "SourceValidatorV1Result":
      return decodeResult(expectedRole, frame);
    case "SourceValidatorV1ResourcePolicy":
      return decodePolicy(expectedRole, frame);
    case "SourceValidatorV1ProcessProfile":
      return decodeProfile(expectedRole, frame, "CSV1PRC0", 4);
    case "SourceValidatorV1ArtifactProfile":
      return decodeProfile(expectedRole, frame, "CSV1ART0", 5);
    case "SourceValidatorV1ConsumerProjection":
      return decodeConsumer(expectedRole, frame);
    default:
      throw new Error(`unknown object ${object}`);
  }
}

function decodeRequest(role, frame) {
  validateFrame(frame, "CSV1REQ0", 1, 216, 262_360);
  validateRole(frame, role, 11);
  const sourceLength = frame.readUInt32BE(116);
  if (sourceLength !== frame.length - 216) refuse("BINDING");
  if (!sha256(frame.subarray(216)).equals(frame.subarray(120, 152))) refuse("BINDING");
  requireBindings(frame);
  return bindings(frame);
}

function decodeResult(role, frame) {
  validateFrame(frame, "CSV1RES0", 2, 248, 248);
  validateRole(frame, role, 11);
  requireBindings(frame);
  if (!allZero(frame.subarray(222, 224)) || !allZero(frame.subarray(244, 248))) refuse("SCHEMA");
  if (frame[216] !== 1 || frame[217] !== 1 || frame[218] !== 0 || frame[219] !== 1) {
    refuse("SCHEMA");
  }
  if (frame.readUInt16BE(220) !== 0 || !allZero(frame.subarray(224, 244))) refuse("SCHEMA");
  return bindings(frame);
}

function decodePolicy(role, frame) {
  validateFrame(frame, "CSV1POL0", 3, 256, 256);
  requireRole(frame, role);
  if (frame.readUInt16BE(18) !== 0) refuse("UNSUPPORTED");
  if (frame.readUInt16BE(20) !== 1 || !allZero(frame.subarray(22, 128))) refuse("SCHEMA");
  if (
    frame.readUInt16BE(128) !== 1 ||
    frame.readUInt16BE(130) !== 0 ||
    frame.readUInt16BE(132) !== 1 ||
    frame.readUInt16BE(134) !== 2 ||
    frame.readUInt32BE(136) !== 262_360 ||
    frame.readUInt32BE(140) !== 248 ||
    frame.readUInt32BE(144) !== 0 ||
    frame.readUInt16BE(148) !== 1 ||
    frame.readUInt16BE(150) !== 0 ||
    frame.readUInt32BE(152) !== 262_608 ||
    frame.readUInt16BE(168) !== 1
  ) {
    refuse("BINDING");
  }
  if (!allZero(frame.subarray(156, 168)) || !allZero(frame.subarray(170))) refuse("SCHEMA");
  return { role };
}

function decodeProfile(role, frame, magic, kind) {
  validateFrame(frame, magic, kind, 256, 256);
  validateRole(frame, role, 6);
  if (!allZero(frame.subarray(30, 32))) refuse("SCHEMA");
  for (let offset = 32; offset < 256; offset += 32) {
    if (allZero(frame.subarray(offset, offset + 32))) refuse("SCHEMA");
  }
  return { role };
}

function decodeConsumer(role, frame) {
  validateFrame(frame, "CSV1CON0", 6, 192, 192);
  validateRole(frame, role, 6);
  if (!allZero(frame.subarray(30, 32)) || !allZero(frame.subarray(184))) refuse("SCHEMA");
  if (allZero(frame.subarray(32, 48)) || frame.readBigUInt64BE(48) === 0n) refuse("SCHEMA");
  for (const [start, end] of [
    [56, 88],
    [88, 120],
    [120, 152],
    [152, 184],
  ]) {
    if (allZero(frame.subarray(start, end))) refuse("SCHEMA");
  }
  return { role };
}

function validateFrame(frame, magic, kind, minimum, maximum) {
  if (
    frame.length >= 12 &&
    ["CAPMJSRQ", "CAPMJSRS"].includes(frame.subarray(4, 12).toString("ascii"))
  ) {
    refuse("UNSUPPORTED");
  }
  if (frame.length < minimum || frame.length > maximum) refuse("MALFORMED");
  if (frame.subarray(4, 12).toString("ascii") !== magic) refuse("MALFORMED");
  if (frame.readUInt32BE(0) !== frame.length - 4) refuse("MALFORMED");
  if (frame.readUInt16BE(12) !== 1) refuse("UNSUPPORTED");
  if (frame.readUInt16BE(14) !== kind) refuse("DOMAIN");
}

function validateRole(frame, expectedRole, count) {
  requireRole(frame, expectedRole);
  for (let index = 0; index < count; index += 1) {
    if (frame.readUInt16BE(18 + index * 2) !== expectedRole * 0x100 + index + 1) {
      refuse("DOMAIN");
    }
  }
}

function requireRole(frame, expectedRole) {
  if (![1, 2].includes(expectedRole) || frame.readUInt16BE(16) !== expectedRole) refuse("DOMAIN");
}

function requireBindings(frame) {
  if (
    allZero(frame.subarray(44, 60)) ||
    allZero(frame.subarray(60, 76)) ||
    frame.readBigUInt64BE(76) === 0n ||
    allZero(frame.subarray(84, 116)) ||
    allZero(frame.subarray(120, 152)) ||
    allZero(frame.subarray(152, 184)) ||
    allZero(frame.subarray(184, 216))
  ) {
    refuse("SCHEMA");
  }
}

function bindings(frame) {
  return {
    correlation: frame.subarray(44, 60),
    installation: frame.subarray(60, 76),
    epochSequence: frame.readBigUInt64BE(76),
    epochDigest: frame.subarray(84, 116),
    sourceLength: frame.readUInt32BE(116),
    sourceDigest: frame.subarray(120, 152),
    artifactDigest: frame.subarray(152, 184),
    policyDigest: frame.subarray(184, 216),
  };
}

function requireResultBinding(request, result) {
  for (const key of [
    "correlation",
    "installation",
    "epochDigest",
    "sourceDigest",
    "artifactDigest",
    "policyDigest",
  ]) {
    if (!request[key].equals(result[key])) refuse("BINDING");
  }
  if (
    request.epochSequence !== result.epochSequence ||
    request.sourceLength !== result.sourceLength
  ) {
    refuse("BINDING");
  }
}

async function requireCurrentRequestContext(role, request) {
  const name = role === 1 ? "daemon" : "approval-broker";
  const artifact = await readFile(
    new URL(`mjs-source-validator-v1/${name}/artifact-profile.bin`, corpusRoot),
  );
  const policy = await readFile(
    new URL(`mjs-source-validator-v1/${name}/resource-policy-inactive.bin`, corpusRoot),
  );
  const correlation = Buffer.alloc(16);
  correlation[0] = 0x50 + role;
  const installation = Buffer.alloc(16);
  installation[0] = 0x11;
  const epochDigest = Buffer.alloc(32, 0x22);
  if (
    !request.correlation.equals(correlation) ||
    !request.installation.equals(installation) ||
    request.epochSequence !== 7n ||
    !request.epochDigest.equals(epochDigest) ||
    !request.artifactDigest.equals(sha256(artifact)) ||
    !request.policyDigest.equals(sha256(policy))
  ) {
    refuse("BINDING");
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest();
}

function allZero(value) {
  return value.every((byte) => byte === 0);
}

function refuse(classification) {
  throw Object.assign(new Error(classification), { classification });
}
