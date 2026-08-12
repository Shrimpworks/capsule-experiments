#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDirectory, "..");
const write = process.argv.includes("--write");

const capsuleCorpCommit = "88f3a2c1f968b1aa604ce14a2db4389822e5b193";
const planBase64 =
  "uBgBdmNhcHN1bGUuZXhlY3V0aW9uLXBsYW4CAANQEREREREREREREREREREREQQHBVggIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIGWCDDh8gAlAJ/+8rLVz9E9fa03sTSQ7tDayTdZEQ0/qodFAdobWFpbi5tanMIGDIJbHByaW1hcnktZGF0YQpYIL2ZaMcsNKZ3nf4yWZN6HZqeVYA2x81Ile9jT792GB5yCxh2DHBmaXh0dXJlLWFjdGl2ZUAxDVggVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUOglggZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZYIGdnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnD1ggd3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3cQWCCIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiBFYIJmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZElggqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqoTWCC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7uxQZE4gVaXJlcXVlc3RlZBZwdHJhbnNmb3JtZWQtanNvbhcaAAEAABgYGmpr5qw=";
const sourceManifestBase64 =
  "pQF3Y2Fwc3VsZS5zb3VyY2UtbWFuaWZlc3QCAANobWFpbi5tanMEgYNobWFpbi5tanNYIGgfOTZd4Tae5Ib6NOiLmTxg31qDUAa2Xg2JFt9xfDHMGDIFGDI=";
const sourceBase64 = "ZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gKHZhbHVlKSB7IHJldHVybiB2YWx1ZTsgfQo=";

// SEC 2 P-256 generator point. The corresponding scalar 1 is a public test
// value used only to create the retained known-answer signature. No private
// value or credential is present in this experiment or its runtime harness.
const publicX = Buffer.from("6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296", "hex");
const publicY = Buffer.from("4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5", "hex");
const knownSignature = Buffer.from(
  "ccdc90b735d410333155eb5f907afd8971a68e003254dfcdc8b557ac41fba786f67dc6ce15f3251bdc85fe9119a45d4586882bdd11e6804e28cbddc541832780",
  "hex",
);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest();
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function encodeLength(major, length) {
  if (!Number.isSafeInteger(length) || length < 0) throw new Error("invalid CBOR length");
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length <= 0xff) return Buffer.from([(major << 5) | 24, length]);
  if (length <= 0xffff) {
    const result = Buffer.alloc(3);
    result[0] = (major << 5) | 25;
    result.writeUInt16BE(length, 1);
    return result;
  }
  if (length <= 0xffffffff) {
    const result = Buffer.alloc(5);
    result[0] = (major << 5) | 26;
    result.writeUInt32BE(length, 1);
    return result;
  }
  const result = Buffer.alloc(9);
  result[0] = (major << 5) | 27;
  result.writeBigUInt64BE(BigInt(length), 1);
  return result;
}

function unsigned(value) {
  return encodeLength(0, value);
}

function negative(value) {
  if (!Number.isSafeInteger(value) || value >= 0) throw new Error("invalid negative integer");
  return encodeLength(1, -1 - value);
}

function bytes(value) {
  const data = Buffer.from(value);
  return Buffer.concat([encodeLength(2, data.length), data]);
}

function text(value) {
  const data = Buffer.from(value, "utf8");
  return Buffer.concat([encodeLength(3, data.length), data]);
}

function array(values) {
  return Buffer.concat([encodeLength(4, values.length), ...values]);
}

function map(entries) {
  return Buffer.concat([encodeLength(5, entries.length), ...entries.flatMap(([key, value]) => [key, value])]);
}

function tag(value, encoded) {
  return Buffer.concat([encodeLength(6, value), encoded]);
}

function repeat(value, count) {
  return Buffer.alloc(count, value);
}

function artifact(path, value) {
  return { path, bytes: Buffer.from(value) };
}

const plan = Buffer.from(planBase64, "base64");
const sourceManifest = Buffer.from(sourceManifestBase64, "base64");
const source = Buffer.from(sourceBase64, "base64");
const planDigest = sha256(plan);
const sourceManifestDigest = sha256(sourceManifest);
const sourceDigest = sha256(source);
const coseKey = map([
  [unsigned(1), unsigned(2)],
  [unsigned(3), negative(-7)],
  [negative(-1), unsigned(1)],
  [negative(-2), bytes(publicX)],
  [negative(-3), bytes(publicY)],
]);
const kid = sha256(coseKey);
const protectedHeader = map([
  [unsigned(1), negative(-7)],
  [unsigned(3), text("application/capsule.approval-grant+cbor;v=0")],
  [unsigned(4), bytes(kid)],
]);
const payload = map([
  [unsigned(1), text("capsule.approval-grant")],
  [unsigned(2), unsigned(0)],
  [unsigned(3), bytes(repeat(0x11, 16))],
  [unsigned(4), bytes(repeat(0x22, 32))],
  [unsigned(5), bytes(repeat(0x77, 16))],
  [unsigned(6), bytes(planDigest)],
  [unsigned(7), bytes(repeat(0x55, 16))],
  [unsigned(8), bytes(repeat(0x66, 16))],
  [unsigned(9), text("capsule.plan.approve")],
  [unsigned(10), text("capsule.execution-supervisor")],
  [unsigned(11), unsigned(1_785_456_000)],
  [unsigned(12), unsigned(1_785_456_300)],
]);
const sigStructure = array([text("Signature1"), bytes(protectedHeader), bytes(Buffer.alloc(0)), bytes(payload)]);
const envelope = tag(18, array([bytes(protectedHeader), map([]), bytes(payload), bytes(knownSignature)]));
const display = "export default function (value) { return value; }\\n";

const projection = {
  objectType: "capsule.c6b1.broker-projection-fixture",
  objectVersion: 0,
  registrationId: "77".repeat(16),
  registrationSequence: 1,
  planDigest: planDigest.toString("hex"),
  installationId: "11".repeat(16),
  epochSequence: 7,
  epochDigest: "22".repeat(32),
  supervisorId: "55".repeat(16),
  source: {
    profile: "capsule.mjs-single-file/v0",
    memberMediaType: "application/javascript;profile=module;charset=utf-8",
    manifestMediaType: "application/capsule.source-manifest+cbor;v=0",
    entrypoint: "main.mjs",
    fileCount: 1,
    byteLength: source.length,
    contentDigest: sourceDigest.toString("hex"),
    manifestDigest: sourceManifestDigest.toString("hex"),
    contentPolicy: "exact strict-utf8 main.mjs; no BOM, normalization, rewrite, transform, or second member",
    displayEncoding: "capsule.bytewise-ascii-escape/v0",
    escapedExactContent: display,
  },
  inlineJson: {
    slot: "primary-data",
    digest: "bd9968c72c34a6779dfe3259937a1d9a9e558036c7cd4895ef634fbf76181e72",
    byteLength: 118,
    contentPolicy: "current Supervisor projection contains canonical JSON digest and length only; content bytes are not shown",
    contentBytesShown: false,
  },
  runtimeProfile: {
    alias: "fixture-active@1",
    runtimeBundleDigest: "55".repeat(32),
    profileReviewDigests: ["66".repeat(32), "67".repeat(32)],
    profileRegistryDigest: "77".repeat(32),
    backendValidationDigest: "88".repeat(32),
    backendConfigurationDigest: "99".repeat(32),
    trustSnapshotDigest: "aa".repeat(32),
    policyDecisionDigest: "bb".repeat(32),
  },
  limits: {
    sourceBytes: 50,
    inlineInputBytes: 118,
    wallTimeMs: 5000,
    wallTimeOrigin: "requested",
    outputSlot: "transformed-json",
    outputMaxJsonBytes: 65536,
  },
  expiry: { planExpiresAt: 1_785_456_300, registrationExpiresAt: 1_785_456_300, effectiveNow: 1_785_456_000 },
  warnings: [
    "Generated code may encode approved input through allowed output, metadata, state, or timing.",
    "User presence attributes one key operation; it does not prove source comprehension or correct UI logic.",
    "Focus, UI activation, and synthetic input are not approval evidence.",
    "Current Supervisor readback does not contain inline JSON content bytes; this projection shows only their exact digest and length.",
    "Host source validation is not an internal-alpha admission claim; runtime syntax and loader refusal remain separate blocked evidence.",
    "Runtime/profile identifiers and review digests do not admit a runtime, backend, or product path.",
  ],
  interaction: {
    evidenceState: "unsigned-no-credential-test-double",
    approvalEligible: false,
    keyOperationRequired: true,
    freshContextPerOperation: true,
    contextReusePermitted: false,
    focusIsApprovalEvidence: false,
    syntheticInputIsApprovalEvidence: false,
  },
};

const authorization = {
  objectType: "capsule.c6b1.test-key-authorization",
  objectVersion: 0,
  authorityClass: "public-test-vector-only-not-installed-authority",
  teamId: "3DDR84M4JS",
  brokerRole: "capsule.role.approval-broker/v0",
  requestedAccessGroup: "3DDR84M4JS.com.capsulecorp.capsule.broker.approval.epoch-7",
  installationId: "11".repeat(16),
  epochSequence: 7,
  epochDigest: "22".repeat(32),
  purpose: "capsule.plan.approve",
  audience: "capsule.execution-supervisor",
  validFrom: 1_785_455_700,
  validUntil: 1_785_456_600,
  protectionCandidate: "secure-enclave-p256",
  accessControlRequired: ["userPresence", "privateKeyUsage"],
  contextPolicy: "fresh-nonreused-one-sign-budget",
  active: true,
  noFallback: true,
  publicKeyEncoding: "cose-key-ec2-p256-canonical-77-bytes",
  publicKeyX: publicX.toString("hex"),
  publicKeyY: publicY.toString("hex"),
  coseKeySha256: sha256(coseKey).toString("hex"),
  kid: kid.toString("hex"),
  privateKeyPresent: false,
  credentialPresent: false,
};

const seam = {
  objectType: "capsule.c6b1.supervisor-evidence-seam",
  objectVersion: 0,
  protocol: "capsule.c6b1.supervisor-evidence-seam/v0",
  productConsumer: false,
  installedListener: false,
  authorityOwner: "execution-supervisor",
  brokerAuthority: "bounded-process-memory-only",
  operations: [
    {
      name: "FetchRegisteredPlanV0",
      requestIdentity: "registration-id",
      responseIdentity: "exact-supervisor-retained-plan-projection",
      durableMutation: false,
    },
    {
      name: "SubmitApprovalV0",
      requestIdentity: "canonical-payload+resolved-signer-authorization-identity",
      linearizationPoint: "supervisor-durable-approval-commit",
      responseLoss: ["no-record", "same-approval-id-and-current-state"],
      brokerJournalPermitted: false,
    },
    {
      name: "RequestAttemptV0",
      requestIdentity: "approval-id+attempt-nonce",
      linearizationPoint: "supervisor-atomic-consume-and-attempt-create",
      responseLoss: ["no-effect", "same-attempt-id-and-current-state"],
      secondAttemptPermitted: false,
    },
  ],
};

const artifacts = [
  artifact("fixtures/execution-plan.cbor", plan),
  artifact("fixtures/source-manifest.cbor", sourceManifest),
  artifact("fixtures/main.mjs", source),
  artifact("fixtures/projection.json", jsonBytes(projection)),
  artifact("fixtures/source-display.txt", Buffer.from(`${display}\n`)),
  artifact("fixtures/cose-key.cbor", coseKey),
  artifact("fixtures/key-authorization.json", jsonBytes(authorization)),
  artifact("fixtures/protected-header.cbor", protectedHeader),
  artifact("fixtures/approval-payload.cbor", payload),
  artifact("fixtures/sig-structure.cbor", sigStructure),
  artifact("fixtures/signature.raw", knownSignature),
  artifact("fixtures/approval-envelope.cose", envelope),
  artifact("interfaces/supervisor-seam-v0.json", jsonBytes(seam)),
];

function manifestEntry(item) {
  return { path: item.path, bytes: item.bytes.length, sha256: sha256(item.bytes).toString("hex") };
}

function compositeDigest(entries) {
  return sha256(Buffer.from(entries.map((entry) => `${entry.path}\0${entry.bytes}\0${entry.sha256}\n`).join(""))).toString("hex");
}

const entries = artifacts.map(manifestEntry).sort((a, b) => a.path.localeCompare(b.path));
const fixtureManifest = {
  objectType: "capsule.c6b1.fixture-manifest",
  objectVersion: 0,
  scope: "unsigned-no-credential-no-install-no-product-consumer",
  capsuleCorpCommit,
  fixtureClock: { issuedAt: 1_785_456_000, expiresAt: 1_785_456_300, liveUsePermitted: false },
  replayIdentity: "canonical-payload+resolved-signer-authorization-identity",
  approvalLinearizationPoint: "supervisor-durable-submit-approval-commit",
  brokerDurableAuthority: false,
  candidateValuesOnly: [
    "kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly",
    "kSecKeyAlgorithmECDSASignatureMessageRFC4754SHA256",
  ],
  fallbackPermitted: false,
  artifacts: entries,
  compositeSha256: compositeDigest(entries),
};
artifacts.push(artifact("fixtures/manifest.json", jsonBytes(fixtureManifest)));

for (const item of artifacts) {
  const destination = join(root, item.path);
  if (write) {
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, item.bytes);
    continue;
  }
  const current = readFileSync(destination);
  if (!current.equals(item.bytes)) throw new Error(`${item.path} is not generated exactly`);
}

function walk(directory) {
  const result = [];
  for (const name of readdirSync(directory).sort()) {
    if (name === ".build" || name === ".swiftpm" || name === "experiment-manifest.json") continue;
    const path = join(directory, name);
    const status = statSync(path);
    if (status.isDirectory()) result.push(...walk(path));
    else if (status.isFile()) result.push(path);
  }
  return result;
}

if (write) {
  const experimentEntries = walk(root).map((path) => {
    const content = readFileSync(path);
    return { path: relative(root, path), bytes: content.length, sha256: sha256(content).toString("hex") };
  });
  const experimentManifest = {
    objectType: "capsule.c6b1.experiment-manifest",
    objectVersion: 0,
    capsuleCorpCommit,
    files: experimentEntries,
    compositeSha256: compositeDigest(experimentEntries),
  };
  writeFileSync(join(root, "experiment-manifest.json"), jsonBytes(experimentManifest));
}

console.log(JSON.stringify({ fixtureCompositeSha256: fixtureManifest.compositeSha256, artifacts: entries.length }));
