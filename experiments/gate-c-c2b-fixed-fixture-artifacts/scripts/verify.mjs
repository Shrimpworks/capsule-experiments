import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const experiment = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidence = join(experiment, "evidence", "2026-08-04-v2");
const predecessorEvidence = join(experiment, "evidence", "2026-08-04");
const [deno, corp, stageA, stageB] = process.argv.slice(2).map((path) =>
  resolve(path)
);
if (!deno || !corp || !stageA || !stageB) {
  throw new Error("usage: verify.mjs DENO CORP STAGE_A STAGE_B");
}

const sha256Bytes = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
const sha256 = (path) => sha256Bytes(readFileSync(path));
const json = (name) => JSON.parse(readFileSync(join(evidence, name), "utf8"));
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: "utf8" });

for (const name of [
  "same-host-comparison.json",
  "mutation-dispositions.json",
  "sbom.cdx.json",
  "source-notice-closure.json",
  "runtime-build-evidence-manifest.json",
  "provenance.intoto.json",
  "result.json",
]) json(name);

const manifest = json("runtime-build-evidence-manifest.json");
const selfDigest = manifest.selfDigest.sha256;
manifest.selfDigest.sha256 = null;
check(sha256Bytes(Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)) === selfDigest,
  "candidate self-digest mismatch");
check(selfDigest ===
  "732301bf8553b0c59b3fe0e4f2b9e070dcc3a1b478e742dc13bd438873b7e488",
  "unexpected candidate self-digest");
const predecessor = JSON.parse(readFileSync(join(
  predecessorEvidence,
  "runtime-build-evidence-manifest.json",
), "utf8"));
check(predecessor.identity ===
  "capsule.c2b-fixed-fixture.runtime-build-evidence/c1-c2a-v1" &&
  predecessor.selfDigest.sha256 ===
    "6a673b88dc99e8939bc46ec88fb4f869caf7a9ff5909aa445e62afc5a3a83f87",
"predecessor build evidence was not retained exactly");

const result = json("result.json");
check(result.decision === "PASSED-FIXED-FIXTURE-NON-GUEST-BUILD-ONLY",
  "result claim boundary mismatch");
check(result.canonicalCapsuleCorpGate === "PENDING" && result.c2b === "BLOCKED",
  "canonical/C2B gate mismatch");
check(result.runtime001 === "unsupported" && result.vmm001 === "unsupported" &&
  result.guestExecution === "NOT_RUN", "unsupported state mismatch");

const expectedArtifacts = {
  binary: {
    path: "out/runtime/bundle/bin/capsule-deno-core-c2b-fixed-fixture",
    bytes: 68496520,
    sha256: "e781a90236cdf1272a9a16189c6be033164fa25a5aa9e52376ef998982ec0a77",
  },
  snapshot: {
    path: "out/runtime/bundle/share/capsule-deno-core/capsule_core_snapshot.bin",
    bytes: 699988,
    sha256: "4e8965217d5a6675a880326eee6f690bbeec7e7cb243decf2f3e9f453a871a2c",
  },
  twoFileBundle: {
    path: "out/runtime/capsule-deno-core-c2b-runtime-bundle.tar.gz",
    bytes: 20981992,
    sha256: "ad908b8289c86f25c3413713fa3e60c4c8bb91fec0d52763e870d7a186865ee6",
  },
};
for (const [name, expected] of Object.entries(expectedArtifacts)) {
  check(JSON.stringify(result.artifacts[name]) ===
    JSON.stringify({ bytes: expected.bytes, sha256: expected.sha256 }),
  `${name} retained result mismatch`);
  for (const stage of [stageA, stageB]) {
    const path = join(stage, expected.path);
    check(statSync(path).size === expected.bytes && sha256(path) === expected.sha256,
      `${name} stage bytes mismatch`);
  }
}

const comparison = json("same-host-comparison.json");
check(comparison.decision === "all-declared-runtime-materials-byte-equal" &&
  comparison.normalizationApplied === false && comparison.independentBuilder === false,
  "comparison boundary mismatch");
for (const [name, item] of Object.entries(comparison.artifacts)) {
  check(item.result === "byte-equal" &&
    JSON.stringify(item.buildA) === JSON.stringify(item.buildB),
  `${name} comparison mismatch`);
}

const mutations = json("mutation-dispositions.json");
check(mutations.fixedFixtureContract.length === 22 &&
  mutations.fixedFixtureContract.every((item) =>
    item.result === "refused-before-evaluation"), "fixture mutation mismatch");
check(mutations.callerSurface.length === 3 &&
  mutations.callerSurface.every((item) =>
    item.result === "refused-before-evaluation"), "caller mutation mismatch");
check(mutations.sealedSyscalls.length === 4 &&
  mutations.sealedSyscalls.every((item) =>
    item.result === "denied" && item.errno === 1), "syscall mutation mismatch");

check(readFileSync(join(evidence, "completion.txt"), "utf8") ===
  '{"doubled":42,"echo":"capsule-c2a"}', "known answer mismatch");
check(readFileSync(join(evidence, "finalLink.txt"), "utf8") ===
  "deno_core::ops_builtin_v8::op_get_ext_import_meta_proto\n" +
  "deno_core::ops_builtin_v8::op_get_extras_binding_object\n" +
  "deno_core::ops_builtin_v8::op_set_captured_bootstrap\n",
"final-link registry mismatch");
check(readFileSync(join(evidence, "argumentRefusal.txt"), "utf8")
  .includes("caller arguments are not accepted"), "argument refusal missing");
check(readFileSync(join(evidence, "environmentRefusal.txt"), "utf8")
  .includes("caller environment is not accepted"), "environment refusal missing");
check(readFileSync(join(evidence, "descriptorRefusal.txt"), "utf8")
  .includes("unexpected inherited descriptors: [0, 1, 2, 3]"),
"descriptor refusal missing");

const sbom = json("sbom.cdx.json");
check(sbom.bomFormat === "CycloneDX" && sbom.specVersion === "1.6" &&
  sbom.components.length === 193 && sbom.compositions[0].aggregate === "complete",
"SBOM closure mismatch");
const provenance = json("provenance.intoto.json");
check(provenance._type === "https://in-toto.io/Statement/v1" &&
  provenance.predicateType === "https://slsa.dev/provenance/v1" &&
  provenance.predicate.runDetails.limitations.length === 6,
"provenance closure mismatch");

check(run("git", ["rev-parse", "HEAD"], deno).trim() ===
  "29b71f06c2df5ab06721ccbb7bc744fb8104356e", "Deno ref mismatch");
check(run("git", ["status", "--porcelain"], deno) === "", "Deno worktree dirty");
const c1 = join(corp,
  "schemas/conformance/c1-governed-deno-core/controlled-development-profile.json");
const c2a = join(corp,
  "schemas/conformance/c2a-governed-deno-core/passive-execution-profile.json");
check(sha256(c1) ===
  "d5d75e638a15be6c9f4a3230d17309d085f6ec103a73b64d9e0fd656a5423c9e",
"C1 changed");
check(sha256(c2a) ===
  "d4ce88888186266f5d251e6246c889b1fd46d7746bb0ba56bcc4b3ce4675992f",
"C2A changed");
const fixture = join(deno, "tools/capsule/governed-deno-core/c2b-fixture");
const governedOutput = run("node", [
  join(deno, "tools/capsule/governed-deno-core/verify.mjs"),
], deno);
check(governedOutput.includes("fixture.mutations=22") &&
  governedOutput.includes("guestExecution=NOT_RUN"),
"outer governed verification mismatch");
run("node", [join(fixture, "generate.mjs"), c1, c2a, "check"], deno);
const staticOutput = run("node", [join(fixture, "verify.mjs")], deno);
check(staticOutput.includes("fixture.mutations=22") &&
  staticOutput.includes("guestExecution=NOT_RUN"), "fork static verification mismatch");
const inventoryOutput = run("node", [
  join(experiment, "scripts", "test-closed-inventory.mjs"),
  fixture,
], experiment);
check(inventoryOutput.includes("closedInventory.retainedFiles=10") &&
  inventoryOutput.includes("closedInventory.extraFile=refused"),
"closed inventory proof mismatch");

console.log(`candidate.selfDigest=${selfDigest}`);
console.log("buildAandB=byte-equal");
console.log("fixtureMutations=22-refused-before-evaluation");
console.log("restorationMutations=4-denied");
console.log("guestExecution=NOT_RUN");
console.log("decision=PASSED-FIXED-FIXTURE-NON-GUEST-BUILD-ONLY");
