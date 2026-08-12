#!/usr/bin/env node

import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hex64 = /^[0-9a-f]{64}$/;

function fail(message) {
  throw new Error(message);
}

function read(path) {
  return readFileSync(join(root, path));
}

function json(path) {
  return JSON.parse(read(path).toString("utf8"));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function compositeDigest(entries) {
  return sha256(Buffer.from(entries.map((entry) => `${entry.path}\0${entry.bytes}\0${entry.sha256}\n`).join("")));
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

function verifyExperimentManifest() {
  const manifest = json("experiment-manifest.json");
  assert(manifest.objectType === "capsule.c6b1.experiment-manifest", "experiment manifest type");
  assert(manifest.objectVersion === 0, "experiment manifest version");
  assert(manifest.capsuleCorpCommit === "88f3a2c1f968b1aa604ce14a2db4389822e5b193", "source commit");
  const actual = walk(root).map((path) => {
    const content = readFileSync(path);
    return { path: relative(root, path), bytes: content.length, sha256: sha256(content) };
  });
  assert(JSON.stringify(actual) === JSON.stringify(manifest.files), "closed experiment file inventory");
  assert(compositeDigest(actual) === manifest.compositeSha256, "experiment composite digest");
}

function verifyFixtureManifest() {
  const manifest = json("fixtures/manifest.json");
  assert(manifest.objectType === "capsule.c6b1.fixture-manifest", "fixture manifest type");
  assert(manifest.scope === "unsigned-no-credential-no-install-no-product-consumer", "fixture scope");
  assert(manifest.capsuleCorpCommit === "88f3a2c1f968b1aa604ce14a2db4389822e5b193", "fixture source commit");
  assert(manifest.fixtureClock.liveUsePermitted === false, "fixture clock live use");
  assert(manifest.fixtureClock.expiresAt - manifest.fixtureClock.issuedAt === 300, "fixture lifetime");
  assert(manifest.replayIdentity === "canonical-payload+resolved-signer-authorization-identity", "replay identity");
  assert(manifest.approvalLinearizationPoint === "supervisor-durable-submit-approval-commit", "linearization");
  assert(manifest.brokerDurableAuthority === false && manifest.fallbackPermitted === false, "authority/fallback");
  assert(
    JSON.stringify(manifest.candidateValuesOnly) ===
      JSON.stringify([
        "kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly",
        "kSecKeyAlgorithmECDSASignatureMessageRFC4754SHA256",
      ]),
    "candidate-only values",
  );
  const paths = manifest.artifacts.map((entry) => entry.path);
  assert(paths.length === 13 && new Set(paths).size === paths.length, "closed fixture paths");
  for (const entry of manifest.artifacts) {
    const content = read(entry.path);
    assert(content.length === entry.bytes, `fixture size ${entry.path}`);
    assert(sha256(content) === entry.sha256, `fixture sha256 ${entry.path}`);
  }
  assert(compositeDigest(manifest.artifacts) === manifest.compositeSha256, "fixture composite digest");
  return manifest;
}

function readLength(bytes, offset) {
  const first = bytes[offset];
  if (first === undefined) fail("truncated CBOR");
  const additional = first & 0x1f;
  if (additional < 24) return { major: first >> 5, value: additional, offset: offset + 1 };
  if (additional === 24) {
    const value = bytes[offset + 1];
    if (value < 24) fail("nonpreferred CBOR uint8");
    return { major: first >> 5, value, offset: offset + 2 };
  }
  if (additional === 25) {
    const value = bytes.readUInt16BE(offset + 1);
    if (value <= 0xff) fail("nonpreferred CBOR uint16");
    return { major: first >> 5, value, offset: offset + 3 };
  }
  if (additional === 26) {
    const value = bytes.readUInt32BE(offset + 1);
    if (value <= 0xffff) fail("nonpreferred CBOR uint32");
    return { major: first >> 5, value, offset: offset + 5 };
  }
  fail("unsupported or indefinite CBOR length");
}

function decode(bytes, offset = 0) {
  const header = readLength(bytes, offset);
  let cursor = header.offset;
  if (header.major === 0) return { value: header.value, offset: cursor };
  if (header.major === 1) return { value: -1 - header.value, offset: cursor };
  if (header.major === 2 || header.major === 3) {
    const end = cursor + header.value;
    if (end > bytes.length) fail("truncated CBOR bytes");
    const raw = bytes.subarray(cursor, end);
    return { value: header.major === 2 ? Buffer.from(raw) : raw.toString("utf8"), offset: end };
  }
  if (header.major === 4) {
    const values = [];
    for (let index = 0; index < header.value; index += 1) {
      const item = decode(bytes, cursor);
      values.push(item.value);
      cursor = item.offset;
    }
    return { value: values, offset: cursor };
  }
  if (header.major === 5) {
    const values = new Map();
    const encodedKeys = [];
    for (let index = 0; index < header.value; index += 1) {
      const start = cursor;
      const key = decode(bytes, cursor);
      cursor = key.offset;
      const encoded = bytes.subarray(start, cursor);
      if (encodedKeys.some((candidate) => candidate.equals(encoded))) fail("duplicate CBOR map key");
      if (encodedKeys.length > 0 && Buffer.compare(encodedKeys.at(-1), encoded) >= 0) fail("unordered CBOR map key");
      encodedKeys.push(Buffer.from(encoded));
      const value = decode(bytes, cursor);
      cursor = value.offset;
      values.set(key.value, value.value);
    }
    return { value: values, offset: cursor };
  }
  if (header.major === 6) {
    const nested = decode(bytes, cursor);
    return { value: { tag: header.value, value: nested.value }, offset: nested.offset };
  }
  fail(`unsupported CBOR major ${header.major}`);
}

function complete(path) {
  const content = read(path);
  const decoded = decode(content);
  assert(decoded.offset === content.length, `trailing CBOR ${path}`);
  return decoded.value;
}

function exactKeys(object, expected, label) {
  assert(JSON.stringify(Object.keys(object)) === JSON.stringify(expected), `${label} closed keys`);
}

function verifySemantics() {
  const plan = read("fixtures/execution-plan.cbor");
  assert(plan.length === 527 && sha256(plan) === "ef268a0b829adc1ce1307203f4b805f63379954ccf41e8e20a7487b6e5acf241", "plan identity");
  const source = read("fixtures/main.mjs");
  assert(source.equals(Buffer.from("export default function (value) { return value; }\n")), "source bytes");
  assert(sha256(source) === "681f39365de1369ee486fa34e88b993c60df5a835006b65e0d8916df717c31cc", "source digest");
  assert(sha256(read("fixtures/source-manifest.cbor")) === "c387c80094027ffbcacb573f44f5f6b4dec4d243bb436b24dd644434feaa1d14", "source manifest");

  const projection = json("fixtures/projection.json");
  exactKeys(
    projection,
    [
      "objectType", "objectVersion", "registrationId", "registrationSequence", "planDigest", "installationId",
      "epochSequence", "epochDigest", "supervisorId", "source", "inlineJson", "runtimeProfile", "limits", "expiry",
      "warnings", "interaction",
    ],
    "projection",
  );
  assert(projection.planDigest === sha256(plan), "projection plan binding");
  assert(projection.registrationId === "77".repeat(16), "projection registration");
  assert(projection.source.contentDigest === sha256(source), "projection source binding");
  assert(projection.source.manifestDigest === sha256(read("fixtures/source-manifest.cbor")), "projection manifest binding");
  assert(projection.source.escapedExactContent === read("fixtures/source-display.txt").toString().trimEnd(), "display binding");
  assert(projection.inlineJson.contentBytesShown === false, "inline bytes hidden");
  assert(projection.interaction.approvalEligible === false, "unsigned fixture eligibility");
  assert(projection.interaction.focusIsApprovalEvidence === false, "focus claim");
  assert(projection.interaction.syntheticInputIsApprovalEvidence === false, "synthetic input claim");
  assert(projection.warnings.length === 6, "warning completeness");

  const authorization = json("fixtures/key-authorization.json");
  assert(authorization.authorityClass === "public-test-vector-only-not-installed-authority", "test-key class");
  assert(authorization.teamId === "3DDR84M4JS", "team");
  assert(authorization.brokerRole === "capsule.role.approval-broker/v0", "role");
  assert(authorization.requestedAccessGroup === "3DDR84M4JS.com.capsulecorp.capsule.broker.approval.epoch-7", "group");
  assert(authorization.purpose === "capsule.plan.approve", "purpose");
  assert(authorization.audience === "capsule.execution-supervisor", "audience");
  assert(JSON.stringify(authorization.accessControlRequired) === JSON.stringify(["userPresence", "privateKeyUsage"]), "access control");
  assert(authorization.contextPolicy === "fresh-nonreused-one-sign-budget", "context policy");
  assert(authorization.active && authorization.noFallback, "active/no fallback");
  assert(!authorization.privateKeyPresent && !authorization.credentialPresent, "no private/credential");

  const coseKeyBytes = read("fixtures/cose-key.cbor");
  const coseKey = complete("fixtures/cose-key.cbor");
  assert(coseKeyBytes.length === 77 && coseKey instanceof Map && coseKey.size === 5, "COSE key shape");
  assert(coseKey.get(1) === 2 && coseKey.get(3) === -7 && coseKey.get(-1) === 1, "COSE key parameters");
  assert(coseKey.get(-2).toString("hex") === authorization.publicKeyX, "COSE x");
  assert(coseKey.get(-3).toString("hex") === authorization.publicKeyY, "COSE y");
  assert(sha256(coseKeyBytes) === authorization.kid && authorization.kid === authorization.coseKeySha256, "kid derivation");
  assert(hex64.test(authorization.kid), "kid shape");

  const protectedHeader = complete("fixtures/protected-header.cbor");
  assert(protectedHeader instanceof Map && protectedHeader.size === 3, "protected header map");
  assert(protectedHeader.get(1) === -7, "protected algorithm");
  assert(protectedHeader.get(3) === "application/capsule.approval-grant+cbor;v=0", "protected content type");
  assert(protectedHeader.get(4).toString("hex") === authorization.kid, "protected kid");

  const payload = complete("fixtures/approval-payload.cbor");
  assert(payload instanceof Map && payload.size === 12, "payload shape");
  assert(payload.get(1) === "capsule.approval-grant" && payload.get(2) === 0, "payload type/version");
  assert(payload.get(3).toString("hex") === "11".repeat(16), "payload installation");
  assert(payload.get(4).toString("hex") === "22".repeat(32), "payload epoch");
  assert(payload.get(5).toString("hex") === "77".repeat(16), "payload registration");
  assert(payload.get(6).toString("hex") === sha256(plan), "payload plan");
  assert(payload.get(7).toString("hex") === "55".repeat(16), "payload supervisor");
  assert(payload.get(8).toString("hex") === "66".repeat(16), "payload nonce");
  assert(payload.get(9) === "capsule.plan.approve", "payload purpose");
  assert(payload.get(10) === "capsule.execution-supervisor", "payload audience");
  assert(payload.get(12) - payload.get(11) === 300, "payload lifetime");

  const sigStructure = complete("fixtures/sig-structure.cbor");
  assert(Array.isArray(sigStructure) && sigStructure.length === 4, "Sig_structure shape");
  assert(sigStructure[0] === "Signature1", "Sig_structure context");
  assert(sigStructure[1].equals(read("fixtures/protected-header.cbor")), "Sig_structure protected");
  assert(sigStructure[2].length === 0, "Sig_structure external AAD");
  assert(sigStructure[3].equals(read("fixtures/approval-payload.cbor")), "Sig_structure payload");

  const envelope = complete("fixtures/approval-envelope.cose");
  assert(envelope.tag === 18 && Array.isArray(envelope.value) && envelope.value.length === 4, "Sign1 framing");
  assert(envelope.value[0].equals(read("fixtures/protected-header.cbor")), "envelope protected");
  assert(envelope.value[1] instanceof Map && envelope.value[1].size === 0, "unprotected empty");
  assert(envelope.value[2].equals(read("fixtures/approval-payload.cbor")), "envelope payload");
  assert(envelope.value[3].equals(read("fixtures/signature.raw")), "envelope signature");

  const key = createPublicKey({
    key: {
      kty: "EC", crv: "P-256",
      x: Buffer.from(authorization.publicKeyX, "hex").toString("base64url"),
      y: Buffer.from(authorization.publicKeyY, "hex").toString("base64url"),
    },
    format: "jwk",
  });
  const signature = read("fixtures/signature.raw");
  assert(signature.length === 64, "raw signature size");
  assert(verifySignature("sha256", read("fixtures/sig-structure.cbor"), { key, dsaEncoding: "ieee-p1363" }, signature), "public signature verification");
  const mutatedMessage = Buffer.from(read("fixtures/sig-structure.cbor"));
  mutatedMessage[mutatedMessage.length - 1] ^= 1;
  assert(!verifySignature("sha256", mutatedMessage, { key, dsaEncoding: "ieee-p1363" }, signature), "message mutation refusal");
  const mutatedSignature = Buffer.from(signature);
  mutatedSignature[0] ^= 1;
  assert(!verifySignature("sha256", read("fixtures/sig-structure.cbor"), { key, dsaEncoding: "ieee-p1363" }, mutatedSignature), "signature mutation refusal");

  const seam = json("interfaces/supervisor-seam-v0.json");
  assert(seam.authorityOwner === "execution-supervisor" && seam.brokerAuthority === "bounded-process-memory-only", "seam authority");
  assert(!seam.productConsumer && !seam.installedListener, "seam inactive");
  assert(seam.operations.map((item) => item.name).join(",") === "FetchRegisteredPlanV0,SubmitApprovalV0,RequestAttemptV0", "seam operations");
  assert(seam.operations[1].linearizationPoint === "supervisor-durable-approval-commit", "approval commit owner");
  assert(seam.operations[1].brokerJournalPermitted === false, "no broker journal");
  assert(seam.operations[2].secondAttemptPermitted === false, "no second attempt");
}

function verifyRequestedEntitlements() {
  const request = json("inputs/requested-effective-entitlements.json");
  assert(request.candidateOnly && !request.observedOrProvisioned, "entitlement candidate boundary");
  assert(request.bundleId === "com.capsulecorp.capsule.broker.c6b1", "candidate bundle id");
  assert(request.required["com.apple.security.app-sandbox"] === true, "sandbox request");
  assert(
    JSON.stringify(request.required["keychain-access-groups"]) ===
      JSON.stringify(["3DDR84M4JS.com.capsulecorp.capsule.broker.approval.epoch-7"]),
    "keychain group request",
  );
  for (const required of [
    "com.apple.security.application-groups", "com.apple.security.network.client", "com.apple.security.network.server",
    "com.apple.security.get-task-allow", "com.apple.security.hypervisor", "temporary-exception",
  ]) assert(request.forbidden.includes(required), `forbidden entitlement ${required}`);
  const plist = read("inputs/CapsuleC6b1BrokerEvidence.entitlements").toString();
  assert(plist.includes("com.apple.security.app-sandbox") && plist.includes("approval.epoch-7"), "entitlements plist");
  for (const forbidden of request.forbidden) assert(!plist.includes(`<key>${forbidden}</key>`), `plist contains ${forbidden}`);
}

function verifyNoLiveAuthorityImports() {
  const sourceRoot = join(root, "Sources");
  const sources = walk(sourceRoot).map((path) => readFileSync(path).toString("utf8")).join("\n");
  for (const forbidden of [
    "import Security", "import LocalAuthentication", "SecKeyCreateRandomKey", "SecKeyCreateSignature", "LAContext(",
    "SecItemAdd", "SecItemDelete", "xpc_connection_create", "SMAppService",
  ]) assert(!sources.includes(forbidden), `live authority API present: ${forbidden}`);
  assert(sources.includes("unsigned-no-security-framework-no-keychain-no-local-authentication"), "native inert scope");
}

function verifyBoundedMutations(manifest) {
  let count = 0;
  for (const entry of manifest.artifacts) {
    const changed = Buffer.from(read(entry.path));
    changed[0] ^= 1;
    assert(sha256(changed) !== entry.sha256, `artifact mutation retained digest ${entry.path}`);
    count += 1;
  }

  const authorization = json("fixtures/key-authorization.json");
  const acceptsAuthorization = (candidate) =>
    candidate.teamId === "3DDR84M4JS" &&
    candidate.brokerRole === "capsule.role.approval-broker/v0" &&
    candidate.requestedAccessGroup === "3DDR84M4JS.com.capsulecorp.capsule.broker.approval.epoch-7" &&
    candidate.purpose === "capsule.plan.approve" &&
    candidate.audience === "capsule.execution-supervisor" &&
    candidate.contextPolicy === "fresh-nonreused-one-sign-budget" &&
    candidate.active === true && candidate.noFallback === true &&
    candidate.privateKeyPresent === false && candidate.credentialPresent === false;
  for (const [field, value] of [
    ["teamId", "WRONGTEAM"],
    ["brokerRole", "capsule.role.daemon/v0"],
    ["requestedAccessGroup", "3DDR84M4JS.wrong"],
    ["purpose", "capsule.plan.execute"],
    ["audience", "capsule.execution-daemon"],
    ["contextPolicy", "reused"],
    ["active", false],
    ["noFallback", false],
    ["privateKeyPresent", true],
    ["credentialPresent", true],
  ]) {
    const changed = structuredClone(authorization);
    changed[field] = value;
    assert(!acceptsAuthorization(changed), `authorization mutation accepted ${field}`);
    count += 1;
  }

  const projection = json("fixtures/projection.json");
  for (const [field, value] of [
    ["planDigest", "00".repeat(32)],
    ["registrationId", "00".repeat(16)],
    ["installationId", "00".repeat(16)],
    ["epochDigest", "00".repeat(32)],
    ["supervisorId", "00".repeat(16)],
  ]) {
    const changed = structuredClone(projection);
    changed[field] = value;
    assert(JSON.stringify(changed) !== JSON.stringify(projection), `projection mutation absent ${field}`);
    assert(
      changed.planDigest !== sha256(read("fixtures/execution-plan.cbor")) ||
        changed.registrationId !== "77".repeat(16) || changed.installationId !== "11".repeat(16) ||
        changed.epochDigest !== "22".repeat(32) || changed.supervisorId !== "55".repeat(16),
      `projection mutation accepted ${field}`,
    );
    count += 1;
  }

  return count;
}

verifyExperimentManifest();
const manifest = verifyFixtureManifest();
verifySemantics();
verifyRequestedEntitlements();
verifyNoLiveAuthorityImports();
const mutations = verifyBoundedMutations(manifest);
console.log(JSON.stringify({ status: "PASSED", artifacts: manifest.artifacts.length, mutations, productConsumer: false }));
