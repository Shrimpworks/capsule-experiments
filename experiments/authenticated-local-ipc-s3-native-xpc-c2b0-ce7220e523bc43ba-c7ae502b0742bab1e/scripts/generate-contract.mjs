#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");
const profile = JSON.parse(await readFile(resolve(root, "experiment-profile.json"), "utf8"));
const contractBytes = await readFile(
  resolve(root, "fixtures/authenticated-local-ipc-v0/native-xpc-v0.contract.json"),
);
const contract = JSON.parse(contractBytes.toString("utf8"));

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
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

if (sha256(contractBytes) !== profile.capsuleCorp.nativeContractSha256) {
  throw new Error("native contract digest differs from the pinned Capsule identity");
}
if (sha256(Buffer.from(stableJSON(contract.cases))) !== profile.capsuleCorp.orderedCaseDigest) {
  throw new Error("ordered native case digest differs from the pinned Capsule identity");
}

const executableMethods = profile.methodScope.executable;
const referenceMethods = profile.methodScope.passiveCollisionReferenceOnly;
if (executableMethods.join(",") !== "SubmitMainMJSV0,RegisterPlanV0,GetRegisteredPlanV0") {
  throw new Error("the executable method scope must remain the exact historical S3 set");
}
if (referenceMethods.join(",") !== "SubmitApprovalV0,RequestAttemptV0") {
  throw new Error("the passive collision/reference set must remain the exact C4 pair");
}

const aliases = new Map(profile.serviceAliases.map((entry) => [entry.method, entry]));
const bodyFields = (method) =>
  contract.envelopes[method].request.fields.filter((field) => field.applicationData);
const cString = (value) => JSON.stringify(value);
const methodRows = executableMethods.map((method) => {
  const binding = contract.methodBindings[method];
  const envelope = contract.envelopes[method].request;
  const alias = aliases.get(method);
  if (!alias || alias.canonical !== binding.service) {
    throw new Error(`service alias mismatch for ${method}`);
  }
  const fields = bodyFields(method);
  const padded = [...fields];
  while (padded.length < 4) padded.push(null);
  return `    {
        ${cString(method)}, ${cString(binding.entryPoint)}, ${cString(binding.service)},
        ${cString(alias.experimental)}, ${cString(binding.expectedRole)},
        ${cString(binding.audience)}, ${cString(binding.purpose)},
        ${binding.messageTag}u, ${binding.methodVersion}u, ${binding.deadlineMilliseconds}u,
        ${envelope.exactKeyCount}u, ${envelope.applicationDataMaxBytes}u, ${fields.length}u,
        {
${padded
  .map((field) =>
    field
      ? `            { ${cString(field.key)}, ${field.minDataBytes}u, ${field.maxDataBytes}u, ${field.nonZeroData ? "true" : "false"} }`
      : "            { NULL, 0u, 0u, false }",
  )
  .join(",\n")}
        }
    }`;
});

const header = `/* Generated from the exact imported Capsule native-XPC contract. */
#ifndef CAPSULE_C2B0_CONTRACT_GENERATED_H
#define CAPSULE_C2B0_CONTRACT_GENERATED_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct capsule_c2b0_body_field {
    const char *key;
    size_t minimum_bytes;
    size_t maximum_bytes;
    bool nonzero;
} capsule_c2b0_body_field;

typedef struct capsule_c2b0_method_spec {
    const char *method;
    const char *entry_point;
    const char *canonical_service;
    const char *experimental_service;
    const char *expected_role;
    const char *audience;
    const char *purpose;
    uint64_t message_tag;
    uint64_t method_version;
    uint64_t deadline_milliseconds;
    size_t request_key_count;
    size_t application_data_maximum;
    size_t body_field_count;
    capsule_c2b0_body_field body_fields[4];
} capsule_c2b0_method_spec;

#define CAPSULE_C2B0_PROTOCOL_VERSION 0u
#define CAPSULE_C2B0_UINT53_MAX 9007199254740991ULL
#define CAPSULE_C2B0_METHOD_COUNT 3u
#define CAPSULE_C2B0_C4_SUBMIT_APPROVAL_TAG 4u
#define CAPSULE_C2B0_C4_REQUEST_ATTEMPT_TAG 5u
#define CAPSULE_C2B0_REQUIRED_FUTURE_GATE ${cString(profile.activation.requiredFutureGate)}

static const capsule_c2b0_method_spec CAPSULE_C2B0_METHODS[CAPSULE_C2B0_METHOD_COUNT] = {
${methodRows.join(",\n")}
};

#endif
`;

const expandedCases = [];
const referenceCases = [];
for (const row of contract.caseTable) {
  const applicable =
    row.method === "all" || row.method === "all-frozen-methods"
      ? executableMethods
      : [row.method];
  const executable = applicable.filter((method) => executableMethods.includes(method));
  const reference = applicable.filter((method) => referenceMethods.includes(method));
  for (const method of executable) {
    expandedCases.push({ ...row, sourceCaseId: row.id, method });
  }
  for (const method of reference) {
    referenceCases.push({ ...row, sourceCaseId: row.id, method });
  }
}

const plan = {
  objectType: "capsule.experiment.authenticated-local-ipc-s3-native-xpc-c2b0-plan",
  objectVersion: 0,
  status: "construction-only-execution-blocked",
  capsuleCorp: profile.capsuleCorp,
  executableMethods,
  passiveCollisionReferenceOnly: referenceMethods,
  serviceAliases: profile.serviceAliases,
  executableCases: expandedCases,
  passiveReferenceCases: referenceCases,
  executableDeadlineCases: contract.deadlineCases.filter((row) =>
    executableMethods.includes(row.method),
  ),
  passiveReferenceDeadlineCases: contract.deadlineCases.filter((row) =>
    referenceMethods.includes(row.method),
  ),
  executableResponseLoss: contract.responseLoss.filter((row) =>
    executableMethods.includes(row.method),
  ),
  passiveReferenceResponseLoss: contract.responseLoss.filter((row) =>
    referenceMethods.includes(row.method),
  ),
  futureNativeHarnessOracles: contract.futureNativeHarnessOracles,
  evidenceClassifications: ["OS", "protocol", "harness", "inference", "untested"],
  activation: profile.activation,
};
const planText = `${JSON.stringify(plan, null, 2)}\n`;

const fixtureDefinitions = [
  ["JOB_PROPOSAL", "fixtures/body/job-proposal.json"],
  ["EXECUTION_PLAN", "fixtures/body/execution-plan.cbor"],
  ["ROLE_BINDINGS", "fixtures/body/role-bindings.bin"],
  ["PLAN_REGISTRATION", "fixtures/body/plan-registration.cbor"],
  ["SOURCE_MANIFEST", "fixtures/body/source-manifest.cbor"],
  ["SOURCE", "fixtures/body/main.mjs"],
  ["APPROVAL_ENVELOPE_C4_REFERENCE_ONLY", "fixtures/body/approval-envelope.cose"],
];
const fixtureRows = [];
for (const [symbol, relative] of fixtureDefinitions) {
  const bytes = await readFile(resolve(root, relative));
  const values = [...bytes];
  const lines = [];
  for (let offset = 0; offset < values.length; offset += 12) {
    lines.push(`    ${values.slice(offset, offset + 12).map((value) => `0x${value.toString(16).padStart(2, "0")}`).join(", ")}`);
  }
  fixtureRows.push(`static const uint8_t CAPSULE_C2B0_${symbol}[] = {\n${lines.join(",\n")}\n};\nstatic const size_t CAPSULE_C2B0_${symbol}_LENGTH = sizeof(CAPSULE_C2B0_${symbol});`);
}
const fixtureHeader = `/* Generated exact public fixture bytes; the C4 envelope is reference-only. */
#ifndef CAPSULE_C2B0_FIXTURES_GENERATED_H
#define CAPSULE_C2B0_FIXTURES_GENERATED_H

#include <stddef.h>
#include <stdint.h>

${fixtureRows.join("\n\n")}

#endif
`;

const outputs = [
  ["generated/capsule_c2b0_contract.generated.h", header],
  ["generated/capsule_c2b0_fixtures.generated.h", fixtureHeader],
  ["generated/execution-plan.json", planText],
];
for (const [relative, expected] of outputs) {
  const path = resolve(root, relative);
  if (write) {
    await writeFile(path, expected);
  } else {
    const actual = await readFile(path, "utf8");
    if (actual !== expected) throw new Error(`${relative} is not generator-clean`);
  }
}

console.log(
  JSON.stringify({
    status: "PASSED",
    write,
    methods: executableMethods.length,
    executableCases: expandedCases.length,
    passiveReferenceCases: referenceCases.length,
    deadlineCases: contract.deadlineCases.length,
  }),
);
