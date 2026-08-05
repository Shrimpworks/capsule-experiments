#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const artifactDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = join(artifactDir, "evidence");
const binary = join(artifactDir, "dist/capsule-mjs-source-validator-aarch64-apple-darwin");
const corpus = resolve(artifactDir, "../../schemas/conformance/v0");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fileHash = (path) => hash(readFileSync(path));

const build = JSON.parse(readFileSync(join(evidenceDir, "build-manifest.json"), "utf8"));
const assessment = JSON.parse(readFileSync(join(evidenceDir, "assessment.json"), "utf8"));
const profileEvidence = JSON.parse(
  readFileSync(join(evidenceDir, "artifact-profile.json"), "utf8"),
);
const profile = readFileSync(join(evidenceDir, "artifact-profile.bin"));
if (profile.length !== 160 || profile.subarray(4, 12).toString("ascii") !== "CAPMJSAP") {
  throw new Error("artifact profile framing mismatch");
}
if (fileHash(binary) !== build.artifact.sha256 || statSync(binary).size !== build.artifact.bytes) {
  throw new Error("artifact does not match build manifest");
}
if (profile.subarray(60, 92).toString("hex") !== build.artifact.sha256) {
  throw new Error("artifact profile executable binding mismatch");
}
if (
  profile.subarray(94, 126).toString("hex") !== fileHash(join(evidenceDir, "build-manifest.json"))
) {
  throw new Error("artifact profile build binding mismatch");
}
if (profile.subarray(128, 160).toString("hex") !== fileHash(join(evidenceDir, "assessment.json"))) {
  throw new Error("artifact profile assessment binding mismatch");
}
const profileIdentity = createHash("sha256")
  .update("capsule.source-validator.artifact-profile/v0")
  .update(Buffer.from([0]))
  .update(profile)
  .digest("hex");
if (profileIdentity !== profileEvidence.identitySha256) {
  throw new Error("artifact profile identity mismatch");
}
if (assessment.decision !== "V1-ARTIFACT-RETAINED-NOT-ENROLLED") {
  throw new Error("assessment overstates admission");
}

const fixtureProfile = readFileSync(join(corpus, "mjs-source-validator/artifact-profile.bin"));
const fixtureProfileIdentity = createHash("sha256")
  .update("capsule.source-validator.artifact-profile/v0")
  .update(Buffer.from([0]))
  .update(fixtureProfile)
  .digest("hex");
const names = readdirSync(join(corpus, "mjs-source"))
  .filter((name) => name.startsWith("language-hold-") && name.endsWith(".mjs"))
  .sort();
if (names.length !== 28) throw new Error(`expected 28 M1 HOLD cases, received ${names.length}`);
for (const name of names) {
  const stem = name.replace(/^language-/, "").replace(/\.mjs$/, "");
  const request = readFileSync(join(corpus, `mjs-source-validator/request-${stem}.bin`));
  const expected = readFileSync(join(corpus, `mjs-source-validator/result-${stem}.bin`));
  const observed = spawnSync(binary, [`--artifact-profile-digest=${fixtureProfileIdentity}`], {
    input: request,
    maxBuffer: 1024 * 1024,
    env: {},
  });
  if (observed.status !== 0 || !observed.stdout.equals(expected) || observed.stderr.length !== 0) {
    throw new Error(`${name}: artifact/V0 result mismatch`);
  }
}

for (const name of [
  "reject-request-truncated.bin",
  "reject-request-trailing.bin",
  "reject-request-digest.bin",
  "request-cap-plus-one.bin",
  "request-invalid-utf8.bin",
  "request-leading-bom.bin",
]) {
  const observed = spawnSync(binary, [`--artifact-profile-digest=${profileIdentity}`], {
    input: readFileSync(join(corpus, `mjs-source-validator/${name}`)),
    maxBuffer: 1024 * 1024,
    env: {},
  });
  if (observed.status === 0 || observed.stdout.length !== 0 || observed.stderr.length !== 0) {
    throw new Error(`${name}: malformed input did not fail closed without output`);
  }
}

const licenseReport = JSON.parse(readFileSync(join(evidenceDir, "license-report.json"), "utf8"));
if (licenseReport.missingDeclarations.length !== 0) {
  throw new Error(`missing license declarations: ${licenseReport.missingDeclarations.join(", ")}`);
}
const sbom = JSON.parse(readFileSync(join(evidenceDir, "sbom.cdx.json"), "utf8"));
const source = JSON.parse(readFileSync(join(evidenceDir, "source-manifest.json"), "utf8"));
if (
  sbom.components.length !== source.targetComponentCount ||
  source.targetComponentCount !== build.dependencyGraph.targetComponents ||
  source.lockedDependencyCount !== build.dependencyGraph.lockedDependencies ||
  source.engineeringCandidate.artifactOnlyDependencies.length !== 0 ||
  build.dependencyGraph.artifactOnlyOxcDependencies.length !== 0 ||
  source.engineeringCandidate.candidateOnlyFeatureUnifiedDependencies.length !== 1 ||
  build.dependencyGraph.candidateOnlyFeatureUnifiedOxcDependencies.length !== 1
) {
  throw new Error("dependency inventory count mismatch");
}
const reproduction = JSON.parse(readFileSync(join(evidenceDir, "reproduction.json"), "utf8"));
if (!reproduction.byteIdentical || reproduction.independentBuilder || !reproduction.sameHost) {
  throw new Error("reproduction evidence classification mismatch");
}

console.log(
  JSON.stringify({
    artifactSha256: build.artifact.sha256,
    artifactBytes: build.artifact.bytes,
    artifactProfileIdentitySha256: profileIdentity,
    lockedDependencies: source.lockedDependencyCount,
    targetDependencies: source.targetDependencyCount,
    m1HoldCases: names.length,
    admission: "not-enrolled",
  }),
);
