import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const experiment = dirname(fileURLToPath(import.meta.url));
const repository = resolve(experiment, "../..");
const [stageA, stageB, deno, corp] = process.argv.slice(2).map((path) =>
  resolve(path)
);
if (!stageA || !stageB || !deno || !corp) {
  throw new Error("usage: generate-evidence.mjs STAGE_A STAGE_B DENO CORP");
}

const evidence = join(experiment, "evidence", "2026-08-04-v2");
mkdirSync(evidence, { recursive: true });
const sha256Bytes = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
const sha256 = (path) => sha256Bytes(readFileSync(path));
const artifact = (path) => ({
  bytes: statSync(path).size,
  sha256: sha256(path),
});
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (name, value) =>
  writeFileSync(join(evidence, name), `${JSON.stringify(value, null, 2)}\n`);
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: "utf8" });

const expected = {
  denoCommit: "29b71f06c2df5ab06721ccbb7bc744fb8104356e",
  denoTree: "172e57551fe5a6683f11c886a81f9634023a5514",
  denoBase: "ea18b9dc21ff8ebd19347be7095f47937ee14ec2",
  binding:
    "41350bcfc854338ded5e62f77475daf86486351356104dbbf647a8f8b5f11946",
  c1: "d5d75e638a15be6c9f4a3230d17309d085f6ec103a73b64d9e0fd656a5423c9e",
  c2a: "d4ce88888186266f5d251e6246c889b1fd46d7746bb0ba56bcc4b3ce4675992f",
  source: "c8e940feb89b342de2d5e6bd13c413226676de9a539fce34c4107516e635b475",
  input: "9de0c909cfb111bd99c3b0b5f7a10972894270c2867022a71b6b6f3c0cd1af6e",
  completion:
    "bb7234ee486b0fbccc2091859ec93499e6a14ea7d6e091cdef60a0e2a6e8371c",
  sourceArchive:
    "7073152cccd4df42d5081ecec5c8ab36f8d6914039faa806060656d55a9e4cf3",
  cargoSource:
    "1e96e49a516e4cf6a9ec79acae9a9eb3d0ee52b332695fa11476a97e1e50d1d4",
  cargoLock:
    "4dd8f08c8b223adbf3468fce5fe9e0468dfe9f4a255129cc304cb604fa0d389d",
  rustyV8Commit: "80e863ddb942a4aa2b384e794fc23e35b9d2bb15",
  rustyV8Archive:
    "1ae209c9e4ba5803d010d2c79ee4cc0af0126c5a7ebcca211c7e41deaede4cd2",
  rustyV8Binding:
    "8603f09ab95e79620ea29f73933c09ae3618c6f924472c0ce36d5c614d1ceba4",
  binary: "e781a90236cdf1272a9a16189c6be033164fa25a5aa9e52376ef998982ec0a77",
  snapshot:
    "4e8965217d5a6675a880326eee6f690bbeec7e7cb243decf2f3e9f453a871a2c",
  bundle: "ad908b8289c86f25c3413713fa3e60c4c8bb91fec0d52763e870d7a186865ee6",
};

check(run("git", ["rev-parse", "HEAD"], deno).trim() === expected.denoCommit,
  "Deno commit mismatch");
check(run("git", ["rev-parse", "HEAD^{tree}"], deno).trim() === expected.denoTree,
  "Deno tree mismatch");
check(run("git", ["status", "--porcelain"], deno) === "", "Deno worktree is dirty");
run("git", ["merge-base", "--is-ancestor", expected.denoBase, expected.denoCommit], deno);

const c1Path = join(corp,
  "schemas/conformance/c1-governed-deno-core/controlled-development-profile.json");
const c2aPath = join(corp,
  "schemas/conformance/c2a-governed-deno-core/passive-execution-profile.json");
check(sha256(c1Path) === expected.c1, "C1 bytes changed");
check(sha256(c2aPath) === expected.c2a, "C2A bytes changed");

const fixtureRoot = join(deno,
  "tools/capsule/governed-deno-core/c2b-fixture");
check(sha256(join(fixtureRoot, "binding.json")) === expected.binding,
  "binding bytes changed");
const generatorLog = run("node", [join(fixtureRoot, "generate.mjs"), c1Path, c2aPath, "check"], deno);
const verifierLog = run("node", [join(fixtureRoot, "verify.mjs")], deno);
const inventoryLog = run("node", [
  join(experiment, "scripts", "test-closed-inventory.mjs"),
  fixtureRoot,
], repository);
writeFileSync(join(evidence, "fixture-generator-check.txt"), generatorLog);
writeFileSync(join(evidence, "fixture-static-verification.txt"), verifierLog);
writeFileSync(join(evidence, "closed-inventory-proof.txt"), inventoryLog);

const paths = {
  binary: "out/runtime/bundle/bin/capsule-deno-core-c2b-fixed-fixture",
  snapshot: "out/runtime/bundle/share/capsule-deno-core/capsule_core_snapshot.bin",
  bundle: "out/runtime/capsule-deno-core-c2b-runtime-bundle.tar.gz",
  bundleManifest: "out/runtime/bundle-manifest.tsv",
  completion: "out/runtime/evidence/completion.json",
  runtimeManifest: "out/runtime/evidence/runtime-manifest.txt",
  finalLink: "out/runtime/evidence/final-link-symbols.txt",
  elf: "out/runtime/evidence/elf-proof.txt",
  argumentRefusal: "out/runtime/evidence/argument-injection.txt",
  environmentRefusal: "out/runtime/evidence/environment-injection.txt",
  descriptorRefusal: "out/runtime/evidence/descriptor-injection.txt",
  rustc: "out/runtime/evidence/rustc-version.txt",
  cargo: "out/runtime/evidence/cargo-version.txt",
  boundary: "out/runtime/evidence/build-boundary.txt",
};

const comparison = {};
for (const [name, path] of Object.entries(paths)) {
  const a = artifact(join(stageA, path));
  const b = artifact(join(stageB, path));
  check(a.sha256 === b.sha256 && a.bytes === b.bytes,
    `${name} did not reproduce`);
  comparison[name] = { result: "byte-equal", buildA: a, buildB: b };
}
for (const [name, path] of Object.entries({
  denoSourceArchive: "inputs/Shrimpworks-deno-29b71f06c2df-source.tar.gz",
  cargoSourceBundle: "cache/cargo-source-bundle.tar.gz",
  cargoLock: "probe/Cargo.lock",
})) {
  const a = artifact(join(stageA, path));
  const b = artifact(join(stageB, path));
  check(a.sha256 === b.sha256 && a.bytes === b.bytes,
    `${name} did not reproduce`);
  comparison[name] = { result: "byte-equal", buildA: a, buildB: b };
}
check(comparison.binary.buildA.sha256 === expected.binary, "binary mismatch");
check(comparison.snapshot.buildA.sha256 === expected.snapshot, "snapshot mismatch");
check(comparison.bundle.buildA.sha256 === expected.bundle, "bundle mismatch");
check(comparison.denoSourceArchive.buildA.sha256 === expected.sourceArchive,
  "Deno source archive mismatch");
check(comparison.cargoSourceBundle.buildA.sha256 === expected.cargoSource,
  "Cargo source bundle mismatch");
check(comparison.cargoLock.buildA.sha256 === expected.cargoLock,
  "Cargo lock mismatch");
writeJson("same-host-comparison.json", {
  schema: "capsule.c2b-fixed-fixture.same-host-comparison.v1",
  decision: "all-declared-runtime-materials-byte-equal",
  normalizationApplied: false,
  independentBuilder: false,
  artifacts: comparison,
});

for (const name of [
  "bundleManifest",
  "completion",
  "runtimeManifest",
  "finalLink",
  "elf",
  "argumentRefusal",
  "environmentRefusal",
  "descriptorRefusal",
  "rustc",
  "cargo",
  "boundary",
]) {
  const path = paths[name];
  copyFileSync(join(stageA, path), join(evidence, `${name}.txt`));
}
copyFileSync(join(stageA, "out/runtime/evidence/restoration-results.jsonl"),
  join(evidence, "restoration-results.jsonl"));
copyFileSync(join(stageA, "out/runtime/evidence/restoration-manifests.txt"),
  join(evidence, "restoration-manifests.txt"));
const restorations = readFileSync(join(evidence, "restoration-results.jsonl"), "utf8")
  .trim().split("\n").map(JSON.parse);
check(restorations.length === 4 && restorations.every((item) =>
  item.result === "denied" && item.errno === 1), "restoration refusal mismatch");
const fixtureMutations = [
  "missing-source",
  "wrong-source",
  "substituted-source",
  "source-cap-plus-one",
  "source-media",
  "source-loader-request",
  "source-dynamic-loader-request",
  "missing-input",
  "wrong-input",
  "substituted-input",
  "input-cap-plus-one",
  "input-media",
  "source-digest",
  "source-length",
  "input-digest",
  "input-length",
  "restoration-extension",
  "restoration-module-loader",
  "restoration-inspector",
  "restoration-jit",
  "restoration-code-generation",
  "restoration-descriptor",
];
writeJson("mutation-dispositions.json", {
  schema: "capsule.c2b-fixed-fixture.runtime-mutations.v1",
  fixedFixtureContract: fixtureMutations.map((name) => ({
    name,
    result: "refused-before-evaluation",
  })),
  callerSurface: ["argument", "environment", "descriptor"].map((name) => ({
    name,
    result: "refused-before-evaluation",
  })),
  sealedSyscalls: restorations,
  deferredToPostCanonicalRootAndComposedProfileWork: [
    "missing-artifact",
    "wrong-artifact",
    "substituted-artifact",
    "raw-root-readback-and-positional-io",
    "framed-transport-cap-plus-one",
    "launcher-and-init-restoration",
  ],
  guestOnly: [
    "libkrun-hvf-guest-boot",
    "guest-console-transport",
    "guest-teardown-and-reset",
  ],
});

const priorEvidence = join(repository,
  "experiments/gate-c-fork-native-deno-runtime-bundle/evidence/2026-08-04");
const oldSbom = json(join(priorEvidence, "sbom.cdx.json"));
oldSbom.metadata.component = {
  type: "application",
  "bom-ref": "capsule-c2b-fixed-fixture-runtime-candidate",
  name: "Capsule governed deno_core fixed-fixture runtime candidate",
  version: `0.409.0-${expected.denoCommit.slice(0, 12)}`,
  hashes: [{ alg: "SHA-256", content: expected.bundle }],
};
oldSbom.metadata.properties = [
  { name: "capsule:scope", value: "fixed-fixture-development-candidate-only" },
  { name: "capsule:binding-sha256", value: expected.binding },
  { name: "capsule:admission", value: "none" },
  { name: "capsule:runtime-001", value: "unsupported" },
  { name: "capsule:vmm-001", value: "unsupported" },
  { name: "capsule:cargo-source-count", value: "189" },
];
const denoComponent = oldSbom.components.find((item) =>
  item.name === "Shrimpworks governed deno_core");
denoComponent["bom-ref"] =
  `pkg:generic/Shrimpworks/deno_core@${expected.denoCommit.slice(0, 12)}`;
denoComponent.version = `0.409.0-${expected.denoCommit.slice(0, 12)}`;
denoComponent.hashes = [{ alg: "SHA-256", content: expected.sourceArchive }];
oldSbom.dependencies = [{
  ref: "capsule-c2b-fixed-fixture-runtime-candidate",
  dependsOn: oldSbom.components.map((item) => item["bom-ref"]).sort(),
}];
oldSbom.compositions = [{
  aggregate: "complete",
  assemblies: ["capsule-c2b-fixed-fixture-runtime-candidate"],
}];
writeJson("sbom.cdx.json", oldSbom);

const sourceClosure = {
  schema: "capsule.c2b-fixed-fixture.source-notice-closure.v1",
  result: "closed-for-declared-runtime-candidate-materials",
  engineeringInventoryNotLegalAdvice: true,
  deno: {
    repository: "https://github.com/Shrimpworks/deno.git",
    commit: expected.denoCommit,
    tree: expected.denoTree,
    sourceArchive: comparison.denoSourceArchive.buildA,
    license: {
      path: "LICENSE.md",
      sha256: sha256(join(deno, "LICENSE.md")),
      expression: "MIT",
    },
  },
  cargo: {
    lock: comparison.cargoLock.buildA,
    sourceBundle: comparison.cargoSourceBundle.buildA,
    registrySources: 189,
    priorCompleteSbomInput:
      "experiments/gate-c-fork-native-deno-runtime-bundle/evidence/2026-08-04/sbom.cdx.json",
  },
  rustyV8: {
    repository: "https://github.com/Shrimpworks/rusty_v8.git",
    commit: expected.rustyV8Commit,
    archiveSha256: expected.rustyV8Archive,
    bindingSha256: expected.rustyV8Binding,
    notices: {
      retainedPath:
        "experiments/gate-c-fork-native-deno-runtime-bundle/evidence/2026-08-04/rusty-v8-licenses-notices.tar.gz",
      sha256: "336aade62182917a7251116c2deca73ef3a51758f025b02b3b90f4423adc7314",
    },
  },
  unsigned: true,
  published: false,
};
writeJson("source-notice-closure.json", sourceClosure);

const manifest = {
  objectType: "capsule.c2b-fixed-fixture.runtime-build-evidence",
  schemaVersion: 1,
  identity: "capsule.c2b-fixed-fixture.runtime-build-evidence/c1-c2a-v2",
  status: "passed-fixed-fixture-non-guest-build-only",
  selfDigest: {
    algorithm: "sha256",
    rule: "UTF-8 pretty JSON with selfDigest.sha256 null and trailing LF",
    sha256: null,
  },
  unchangedPassiveContracts: {
    c1: { bytes: statSync(c1Path).size, sha256: expected.c1 },
    c2a: { bytes: statSync(c2aPath).size, sha256: expected.c2a },
  },
  immutableBuildOnlySupplement: {
    identity: "capsule.governed-deno-core.c2b-fixed-fixture/c1-c2a-v1",
    sha256: expected.binding,
    canonicalRegistrationAuthority: false,
  },
  predecessorBuildEvidence: {
    identity: "capsule.c2b-fixed-fixture.runtime-build-evidence/c1-c2a-v1",
    retainedPath:
      "experiments/gate-c-c2b-fixed-fixture-artifacts/evidence/2026-08-04/runtime-build-evidence-manifest.json",
    selfDigest:
      "6a673b88dc99e8939bc46ec88fb4f869caf7a9ff5909aa445e62afc5a3a83f87",
    reason: "superseded only by exact governed fork formatter-policy commit",
  },
  sources: {
    deno: {
      repository: "https://github.com/Shrimpworks/deno.git",
      base: expected.denoBase,
      commit: expected.denoCommit,
      tree: expected.denoTree,
      draftPullRequest: "https://github.com/Shrimpworks/deno/pull/2",
      sourceArchive: comparison.denoSourceArchive.buildA,
    },
    rustyV8: {
      repository: "https://github.com/Shrimpworks/rusty_v8.git",
      commit: expected.rustyV8Commit,
      archiveSha256: expected.rustyV8Archive,
      bindingSha256: expected.rustyV8Binding,
      sourceChanged: false,
    },
  },
  fixedFixture: {
    source: { mediaType: "application/capsule.javascript-source;v=0;module=esm", bytes: 103, sha256: expected.source },
    input: { mediaType: "application/json", bytes: 36, sha256: expected.input },
    completion: { mediaType: "application/json", bytes: 35, sha256: expected.completion },
  },
  artifacts: {
    binary: comparison.binary.buildA,
    snapshot: comparison.snapshot.buildA,
    twoFileBundle: comparison.bundle.buildA,
    bundleManifest: comparison.bundleManifest.buildA,
  },
  construction: {
    acquisition: "two independent connected digest-only stages",
    decisiveBuild: "two independent network-disabled empty-target/output builds",
    builder:
      "rust:1.95.0-bookworm@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1",
    target: "aarch64-unknown-linux-gnu",
    sourceDateEpoch: 0,
    logicalCpus: 1,
    cpuSet: "0",
    normalizationApplied: false,
    sameHostReproducibility: "byte-equal",
    independentBuilder: false,
  },
  validation: {
    closedGeneratedInventory: {
      retainedFiles: 10,
      extraFileMutation: "refused-before-formatter",
    },
    exactKnownAnswer: "pass",
    fixtureAndAuthorityMutations: {
      count: fixtureMutations.length,
      names: fixtureMutations,
      result: "refused-before-evaluation",
    },
    callerArgumentEnvironmentDescriptorInjection: "refused-before-evaluation",
    restorationSyscalls: restorations,
    exactThreeOpFinalLink: "pass",
    elfAudit: "pass",
  },
  authority: {
    fixedFixtureOnly: true,
    arbitrarySource: false,
    callerPaths: false,
    callerArguments: false,
    callerEnvironment: false,
    loaderOrModuleRequests: false,
    runtimeSelection: false,
    runtimeAdmission: false,
  },
  deferredByCanonicalGate: {
    capsuleCorpBindingReconciliationPr: "required-before-composed-profile-or-guest",
    runtimeRoot: "not-constructed-in-this-callback",
    composedProfile: "not-constructed-in-this-callback",
  },
  unsupported: {
    c2b: "BLOCKED-pending-separate-owned-guest-authorization-and-run",
    runtime001: true,
    vmm001: true,
    guestExecution: "NOT_RUN",
  },
};
manifest.selfDigest.sha256 = sha256Bytes(
  Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
);
writeJson("runtime-build-evidence-manifest.json", manifest);

const provenance = {
  _type: "https://in-toto.io/Statement/v1",
  subject: [
    { name: "runtime/binary", digest: { sha256: expected.binary } },
    { name: "runtime/snapshot", digest: { sha256: expected.snapshot } },
    { name: "runtime/two-file-bundle", digest: { sha256: expected.bundle } },
  ],
  predicateType: "https://slsa.dev/provenance/v1",
  predicate: {
    buildDefinition: {
      buildType: "https://capsule.local/experiments/c2b-fixed-fixture-runtime/v1",
      externalParameters: {
        denoCommit: expected.denoCommit,
        bindingSha256: expected.binding,
        target: "aarch64-unknown-linux-gnu",
        networkBoundary: "connected digest-only acquisition; network-none build/test/evidence",
      },
      resolvedDependencies: [
        { uri: `pkg:github/Shrimpworks/deno@${expected.denoCommit}`, digest: { gitCommit: expected.denoCommit } },
        { uri: `pkg:github/Shrimpworks/rusty_v8@${expected.rustyV8Commit}`, digest: { gitCommit: expected.rustyV8Commit } },
        { uri: "file:cargo-source-bundle.tar.gz", digest: { sha256: expected.cargoSource } },
      ],
    },
    runDetails: {
      builder: { id: "pkg:oci/rust@1.95.0-bookworm?repository_digest=sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1" },
      metadata: { invocationId: "capsule-c2b-fixed-fixture-2026-08-04-v2-same-host" },
      limitations: [
        "unsigned experiment-generated provenance",
        "same Apple Silicon Docker Desktop/LinuxKit host for both builds",
        "linux/arm64 builder executed through Docker platform emulation",
        "no independent second builder",
        "no VM, HVF, libkrun, guest, runtime selection, or admission was exercised",
        "runtime root and composed profile are deferred to canonical capsule-corp reconciliation",
      ],
    },
  },
};
writeJson("provenance.intoto.json", provenance);

writeJson("result.json", {
  decision: "PASSED-FIXED-FIXTURE-NON-GUEST-BUILD-ONLY",
  denoDraftPullRequest: "https://github.com/Shrimpworks/deno/pull/2",
  artifacts: manifest.artifacts,
  candidateSelfDigest: manifest.selfDigest.sha256,
  predecessorCandidateSelfDigest:
    "6a673b88dc99e8939bc46ec88fb4f869caf7a9ff5909aa445e62afc5a3a83f87",
  sameHostReproducibility: "byte-equal",
  canonicalCapsuleCorpGate: "PENDING",
  c2b: "BLOCKED",
  runtime001: "unsupported",
  vmm001: "unsupported",
  guestExecution: "NOT_RUN",
});

writeFileSync(join(evidence, "commands.md"), `# Exact commands\n\nThe absolute stage paths are task-owned empty-state paths. Both decisive builds used:\n\n\`\`\`sh\n./scripts/prepare-runtime-stage.sh DENO RUSTY_V8_BUNDLE /private/tmp/capsule-c2b-fixed-fixture-runtime-v2-{a|b} v2-{a|b}\ndocker run --rm --platform linux/arm64 --network bridge ... sh scripts/prefetch-runtime.sh\ndocker run --rm --platform linux/arm64 --network none --read-only --cap-drop ALL --security-opt no-new-privileges --security-opt seccomp=unconfined --memory 10g --cpus 1 --cpuset-cpus 0 --tmpfs /tmp:rw,nosuid,nodev -e GOVERNED_NETWORK_MODE=none -v STAGE:/workspace -w /workspace rust:1.95.0-bookworm@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1 sh scripts/build-runtime-offline.sh\n\`\`\`\n\nRestoration validation used the same builder restrictions and \`--network none\` with \`scripts/test-runtime-restoration-offline.sh\`. No guest command was run.\n`);
writeFileSync(join(evidence, "verification-summary.txt"),
  `decision=PASSED-FIXED-FIXTURE-NON-GUEST-BUILD-ONLY\nbuildAandB=byte-equal\nfixtureKnownAnswer=pass\nfixtureMutations=22-refused\ncallerInjection=refused-before-evaluation\nrestorationMutations=4-denied\nfinalLink=exact-three-op-registry\nnetworkDuringDecisiveBuild=none\nguestExecution=NOT_RUN\ncanonicalCapsuleCorpGate=PENDING\nc2b=BLOCKED\nruntime001=unsupported\nvmm001=unsupported\n`);

console.log(`binary.sha256=${expected.binary}`);
console.log(`snapshot.sha256=${expected.snapshot}`);
console.log(`bundle.sha256=${expected.bundle}`);
console.log(`candidate.selfDigest=${manifest.selfDigest.sha256}`);
console.log("decision=PASSED-FIXED-FIXTURE-NON-GUEST-BUILD-ONLY");
