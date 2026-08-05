#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const artifactDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = join(artifactDir, "evidence");
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const read = (name) => JSON.parse(readFileSync(join(evidenceDir, name), "utf8"));
const construction = read("construction.json");
const build = read("build-manifest.json");
const source = read("source-manifest.json");
const licenses = read("license-report.json");
const sbom = read("sbom.cdx.json");
const provenance = read("provenance.intoto.json");
const reproduction = read("reproduction.json");

if (
  construction.status !== "PASSED" ||
  construction.enrollment !== "not-enrolled" ||
  construction.signing.appleIdentityUsed
) {
  throw new Error("construction status or enrollment overstates R2");
}
if (
  construction.behavior.resourcePolicy !== "inactive" ||
  construction.behavior.parserSpawnPermitted ||
  construction.behavior.productConsumerPresent
) {
  throw new Error("construction activates an unmeasured endpoint or consumer");
}
if (!reproduction.byteIdentical || !reproduction.sameHost || reproduction.independentBuilder) {
  throw new Error("reproduction classification mismatch");
}
if (
  licenses.missingDeclarations.length !== 0 ||
  sbom.components.length !== source.targetComponentCount ||
  build.roles.length !== 2
) {
  throw new Error("source, license, or SBOM inventory mismatch");
}
if (
  provenance.predicate.capsuleLimitations.signed ||
  provenance.predicate.capsuleLimitations.enrolled
) {
  throw new Error("unsigned provenance overstates signing or enrollment");
}

const seen = new Set();
for (const role of construction.roles) {
  for (const item of [role.infoPlist, role.launcher, role.parser, role.resourcePolicy]) {
    const path = join(artifactDir, item.path);
    const stat = lstatSync(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size !== item.bytes ||
      hash(path) !== item.sha256
    ) {
      throw new Error(`${item.path}: retained byte mismatch`);
    }
  }
  if (role.resourcePolicy.activation !== "inactive" || role.resourcePolicy.activeMeasurements) {
    throw new Error(`${role.role}: resource policy is not the exact inactive R1 record`);
  }
  seen.add(role.launcher.sha256);
  seen.add(role.parser.sha256);
  execFileSync("plutil", ["-lint", join(artifactDir, role.infoPlist.path)], { stdio: "ignore" });
  if (role.launcher.dylibs.some((path) => path !== "/usr/lib/libSystem.B.dylib")) {
    throw new Error(`${role.role}: launcher gained unexpected dynamic-library authority`);
  }
}
if (seen.size !== 4) throw new Error("role-specific launcher/parser bytes are not distinct");

const expectedPolicy = new Map([
  ["daemon", "c198dac71f3b5c2d2e8cca34fc3e9c01ff7b8093ef1a881d8160a34800ff1098"],
  ["approval-broker", "b0ce8504190b5fe9b0a0296c22340a6439ab453cb32f32c19ddb6e594698568d"],
]);
for (const role of construction.roles) {
  if (role.resourcePolicy.sha256 !== expectedPolicy.get(role.role)) {
    throw new Error(`${role.role}: inactive policy identity changed`);
  }
}

for (const path of source.sourceInputs) {
  const full = join(artifactDir, path.path);
  if (statSync(full).size !== path.bytes || hash(full) !== path.sha256) {
    throw new Error(`${path.path}: source input changed after evidence generation`);
  }
}

console.log(
  JSON.stringify({
    roles: 2,
    components: source.targetComponentCount,
    enrollment: "not-enrolled",
    resourcePolicy: "inactive",
  }),
);
