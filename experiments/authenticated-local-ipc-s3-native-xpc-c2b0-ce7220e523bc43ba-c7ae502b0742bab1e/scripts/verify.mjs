#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootIndex = process.argv.indexOf("--root");
const root = rootIndex === -1 ? defaultRoot : resolve(process.argv[rootIndex + 1]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const stableJSON = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJSON(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};
const equalKeys = (value, expected, label) => {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} closed key set mismatch`);
  }
};

const profile = await json("experiment-profile.json");
equalKeys(
  profile,
  [
    "objectType", "objectVersion", "status", "capsuleCorp", "capsuleExperimentsBase",
    "identifierBase", "temporaryRoot", "bundleIdentifiers", "processNames", "methodScope",
    "serviceAliases", "limits", "activation",
  ],
  "profile",
);
if (profile.status !== "construction-only-execution-blocked") throw new Error("profile status widened");
if (profile.capsuleCorp.commit !== "e7220e523bc43ba8867122a1233e1625f2c1c164") {
  throw new Error("Capsule commit drift");
}
if (profile.capsuleExperimentsBase !== "067fe2beb40361bb714507cab1331004e0a656fa") {
  throw new Error("experiments baseline drift");
}
if (JSON.stringify(profile.methodScope.executable) !== JSON.stringify([
  "SubmitMainMJSV0", "RegisterPlanV0", "GetRegisteredPlanV0",
])) throw new Error("executable scope is not exactly S3");
if (JSON.stringify(profile.methodScope.passiveCollisionReferenceOnly) !== JSON.stringify([
  "SubmitApprovalV0", "RequestAttemptV0",
])) throw new Error("C4 is not passive collision/reference-only");
if (Object.values(profile.activation).some((value) => value === true)) {
  throw new Error("construction profile activates authority or execution");
}
if (profile.activation.requiredFutureGate !== "CAPSULE_C2B_AUTHORIZATION_V1") {
  throw new Error("future execution gate drift");
}

const fixtureRoot = "fixtures/authenticated-local-ipc-v0";
const manifestBytes = await readFile(resolve(root, fixtureRoot, "manifest.json"));
const contractBytes = await readFile(resolve(root, fixtureRoot, "native-xpc-v0.contract.json"));
const oraclesBytes = await readFile(resolve(root, fixtureRoot, "oracles.json"));
if (sha256(manifestBytes) !== profile.capsuleCorp.manifestSha256) throw new Error("imported manifest digest mismatch");
if (sha256(contractBytes) !== profile.capsuleCorp.nativeContractSha256) throw new Error("imported contract digest mismatch");
if (sha256(oraclesBytes) !== profile.capsuleCorp.oraclesSha256) throw new Error("imported oracle digest mismatch");
const importedManifest = JSON.parse(manifestBytes);
const contract = JSON.parse(contractBytes);
for (const [name, record] of Object.entries(importedManifest.knownAnswers)) {
  const bytes = await readFile(resolve(root, fixtureRoot, name));
  if (bytes.length !== record.byteLength || sha256(bytes) !== record.sha256) {
    throw new Error(`imported known answer mismatch: ${name}`);
  }
}
if (sha256(Buffer.from(stableJSON(contract.cases))) !== profile.capsuleCorp.orderedCaseDigest) {
  throw new Error("complete ordered-case digest mismatch");
}
if (contract.cases.length !== 70 || contract.caseTable.length !== 70 ||
    contract.deadlineCases.length !== 15 || contract.refusalReplies.length !== 13 ||
    contract.responseLoss.length !== 5) throw new Error("complete contract table count mismatch");
if (contract.peerAuthenticationEvidence !== null || contract.listenerActivated !== false ||
    contract.serviceRegistered !== false) throw new Error("imported passive claim drift");

const expectedMethods = {
  SubmitMainMJSV0: [1, 10000, 10, 2097152],
  RegisterPlanV0: [2, 5000, 13, 328337],
  GetRegisteredPlanV0: [3, 2000, 10, 16],
};
const aliasNames = new Set();
for (const alias of profile.serviceAliases) {
  const binding = contract.methodBindings[alias.method];
  const expected = expectedMethods[alias.method];
  if (!binding || !expected || alias.canonical !== binding.service) throw new Error(`alias binding mismatch: ${alias.method}`);
  if (alias.experimental === alias.canonical || !alias.experimental.includes(profile.identifierBase)) {
    throw new Error(`alias is not collision-resistant and external to canonical fixture: ${alias.method}`);
  }
  if (aliasNames.has(alias.experimental)) throw new Error("duplicate experimental service alias");
  aliasNames.add(alias.experimental);
  const envelope = contract.envelopes[alias.method].request;
  if (JSON.stringify([binding.messageTag, binding.deadlineMilliseconds, envelope.exactKeyCount, envelope.applicationDataMaxBytes]) !== JSON.stringify(expected)) {
    throw new Error(`method limits drift: ${alias.method}`);
  }
}

const bodyExpected = {
  "approval-envelope.cose": [375, "fb0a9e7c983f6f3986260dce857edf6b18cba99ee386f9532300dbdc31a5a3bd"],
  "execution-plan.cbor": [527, "ef268a0b829adc1ce1307203f4b805f63379954ccf41e8e20a7487b6e5acf241"],
  "job-proposal.json": [776, "8edd032c329b80f79a0b2cffe2dbff4dccfd5a08ff1c1313801c7f8a2f851d3e"],
  "main.mjs": [50, "681f39365de1369ee486fa34e88b993c60df5a835006b65e0d8916df717c31cc"],
  "plan-registration.cbor": [165, "82f9e72dcb8b0f6e16990c2e09aad4ac8661e72ff72820edf1b57ef5f9537199"],
  "role-bindings.bin": [562, "38995b7af11a5c971b9c7ebd46f24513f06750dffcdd5d49a9fdf41173b5244c"],
  "source-manifest.cbor": [89, "c387c80094027ffbcacb573f44f5f6b4dec4d243bb436b24dd644434feaa1d14"],
};
for (const [name, [length, digest]] of Object.entries(bodyExpected)) {
  const bytes = await readFile(resolve(root, "fixtures/body", name));
  if (bytes.length !== length || sha256(bytes) !== digest) throw new Error(`body fixture mismatch: ${name}`);
}

const plan = await json("generated/execution-plan.json");
if (plan.status !== "construction-only-execution-blocked" ||
    plan.executableMethods.length !== 3 || plan.passiveCollisionReferenceOnly.length !== 2) {
  throw new Error("generated plan scope drift");
}
if (plan.executableCases.length !== 100 || plan.passiveReferenceCases.length !== 24 ||
    plan.executableDeadlineCases.length !== 9 || plan.passiveReferenceDeadlineCases.length !== 6 ||
    plan.executableResponseLoss.length !== 3 || plan.passiveReferenceResponseLoss.length !== 2) {
  throw new Error("generated execution/reference partition mismatch");
}
if (plan.executableCases.some((row) => ["SubmitApprovalV0", "RequestAttemptV0"].includes(row.method))) {
  throw new Error("C4 method promoted into executable plan");
}
const requiredC4Collisions = [4, 5];
for (const method of Object.keys(expectedMethods)) {
  for (const tag of requiredC4Collisions) {
    if (!plan.executableCases.some((row) => row.method === method && row.mutation === `entry-point=${method};message-tag=${tag === 4 ? "SubmitApprovalV0" : "RequestAttemptV0"}`)) {
      throw new Error(`missing S3-to-C4 foreign-tag collision: ${method}/${tag}`);
    }
  }
}

const generatedHeader = await readFile(resolve(root, "generated/capsule_c2b0_contract.generated.h"), "utf8");
for (const alias of profile.serviceAliases) {
  if (!generatedHeader.includes(alias.canonical) || !generatedHeader.includes(alias.experimental)) {
    throw new Error(`generated header misses alias pair: ${alias.method}`);
  }
}
if (!generatedHeader.includes("CAPSULE_C2B0_C4_SUBMIT_APPROVAL_TAG 4u") ||
    !generatedHeader.includes("CAPSULE_C2B0_C4_REQUEST_ATTEMPT_TAG 5u") ||
    generatedHeader.includes('"SubmitApprovalV0"') || generatedHeader.includes('"RequestAttemptV0"')) {
  throw new Error("generated header does not preserve C4 as tag-only reference");
}

const contractSource = await readFile(resolve(root, "src/contract.c"), "utf8");
const serverSource = await readFile(resolve(root, "src/server.m"), "utf8");
const clientSource = await readFile(resolve(root, "src/client.m"), "utf8");
for (const required of [
  "SecCodeCreateWithXPCMessage", "SecCodeCheckValidity", "xpc_connection_get_euid",
  "xpc_connection_get_asid", "capsule_c2b0_validate_outer", "capsule_c2b0_copy_body",
]) if (!contractSource.includes(required)) throw new Error(`native contract source misses ${required}`);
const activateStart = serverSource.indexOf("static bool activate_service");
const setRequirement = serverSource.indexOf("xpc_connection_set_peer_code_signing_requirement", activateStart);
const resumeListener = serverSource.indexOf("xpc_connection_resume(context->listener)", activateStart);
if (activateStart === -1 || setRequirement === -1 || resumeListener === -1 || setRequirement > resumeListener) {
  throw new Error("peer requirement is not installed before listener activation");
}
const mainStart = serverSource.indexOf("int main(");
const gateCheck = serverSource.indexOf("capsule_c2b0_execution_gate", mainStart);
const activationCall = serverSource.indexOf("activate_service(&contexts", mainStart);
if (mainStart === -1 || gateCheck === -1 || activationCall === -1 || gateCheck > activationCall) {
  throw new Error("server execution gate does not precede service activation");
}
const clientMain = clientSource.indexOf("int main(");
const clientGate = clientSource.indexOf("capsule_c2b0_execution_gate", clientMain);
const connectionCreate = clientSource.indexOf("xpc_connection_create_mach_service", clientMain);
if (clientMain === -1 || clientGate === -1 || connectionCreate === -1 || clientGate > connectionCreate) {
  throw new Error("client execution gate does not precede connection creation");
}

const buildScript = await readFile(resolve(root, "scripts/build-unsigned.sh"), "utf8");
for (const forbidden of ["launchctl", "codesign --", "security ", "xpc_connection_create", "./capsule-c2s3-"]) {
  if (buildScript.includes(forbidden)) throw new Error(`build script contains execution/signing operation: ${forbidden}`);
}
for (const required of ["-Wl,-no_uuid", "-Wl,-no_adhoc_codesign", "cmp", "LC_CODE_SIGNATURE"]) {
  if (!buildScript.includes(required)) throw new Error(`build script misses reproducibility control: ${required}`);
}

const evidence = await json("evidence/2026-08-11/construction-result.json");
if (evidence.status !== "PASSED" || evidence.build.cleanDirectories !== 2 ||
    evidence.build.byteEquality !== true || evidence.build.lcUuidAbsent !== true ||
    evidence.build.lcCodeSignatureAbsent !== true || evidence.build.artifacts.length !== 5) {
  throw new Error("construction evidence is incomplete");
}
if (Object.values(evidence.observedEffects).some((value) => value !== false)) {
  throw new Error("construction evidence claims a forbidden effect");
}

const archiveManifest = await json("manifest.json");
if (archiveManifest.selfExcluded !== true || archiveManifest.fileCount !== archiveManifest.files.length) {
  throw new Error("archive manifest count/self-exclusion mismatch");
}
const actualPaths = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".build" || entry.name === "manifest.json") continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile()) actualPaths.push(path);
    else throw new Error(`non-regular archive entry: ${path}`);
  }
}
await walk(root);
actualPaths.sort((left, right) => left.localeCompare(right));
if (actualPaths.length !== archiveManifest.files.length) throw new Error("archive manifest is not closed");
for (let index = 0; index < actualPaths.length; index++) {
  const path = actualPaths[index];
  const record = archiveManifest.files[index];
  const bytes = await readFile(path);
  const metadata = await stat(path);
  if (record.path !== relative(root, path) || record.byteLength !== bytes.length ||
      record.sha256 !== sha256(bytes) || record.mode !== (metadata.mode & 0o777).toString(8).padStart(3, "0")) {
    throw new Error(`archive manifest entry mismatch: ${record.path}`);
  }
}

console.log(JSON.stringify({
  status: "PASSED",
  importedFiles: Object.keys(importedManifest.knownAnswers).length,
  bodyFixtures: Object.keys(bodyExpected).length,
  executableCases: plan.executableCases.length,
  passiveReferenceCases: plan.passiveReferenceCases.length,
  retainedFiles: archiveManifest.files.length,
}));
