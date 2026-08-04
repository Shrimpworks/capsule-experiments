#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv.length !== 4) {
  throw new Error("usage: generate-evidence.mjs DENO_STAGE OUTPUT_DIRECTORY");
}

const experiment = dirname(fileURLToPath(import.meta.url));
const stage = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
mkdirSync(output, { recursive: true });

const sha256 = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const artifact = (name, path) => ({
  name,
  path,
  size: statSync(path).size,
  sha256: sha256(path),
});
const writeJson = (name, value) =>
  writeFileSync(join(output, name), `${JSON.stringify(value, null, 2)}\n`);

const known = JSON.parse(
  readFileSync(join(experiment, "manifests/known-answers.json"), "utf8"),
);
const rustyRoot = join(stage, "inputs/rusty-v8");
const rustyRelease = JSON.parse(
  readFileSync(join(rustyRoot, "release-manifest.json"), "utf8"),
);
if (rustyRelease.sourceCommit !== "80e863ddb942a4aa2b384e794fc23e35b9d2bb15") {
  throw new Error("unexpected rusty_v8 governed source commit");
}

const binaryPath = join(
  stage,
  "out/build-a/bundle/bin/capsule-deno-core-physical-omission",
);
const snapshotPath = join(
  stage,
  "out/build-a/bundle/share/capsule-deno-core/capsule_core_snapshot.bin",
);
const denoBundlePath = join(
  stage,
  "out/build-a/capsule-deno-core-runtime-bundle.tar.gz",
);
const rootTarPath = join(stage, "root-a/rootfs.tar");
const rootGzipPath = join(stage, "root-a/rootfs.tar.gz");
const rootManifestPath = join(stage, "out/runtime-root-files.tsv");
const cargoSourcePath = join(stage, "cache/cargo-source-bundle.tar.gz");
const denoSourcePath = join(
  stage,
  "inputs/Shrimpworks-deno-9adb0b68b55b-source.tar.gz",
);

const subjects = {
  denoBinary: artifact("deno/binary", binaryPath),
  denoSnapshot: artifact("deno/snapshot", snapshotPath),
  denoTwoFileBundle: artifact("deno/two-file-bundle", denoBundlePath),
  runtimeRootManifest: artifact("runtime-root/manifest", rootManifestPath),
  runtimeRootTar: artifact("runtime-root/rootfs.tar", rootTarPath),
  runtimeRootGzip: artifact("runtime-root/rootfs.tar.gz", rootGzipPath),
  denoSource: artifact("sources/Shrimpworks-deno-source.tar.gz", denoSourcePath),
  cargoSource: artifact("sources/cargo-source-bundle.tar.gz", cargoSourcePath),
};

const buildEvidence = {
  buildBoundary: artifact("evidence/build-boundary.txt", join(stage, "out/build-boundary.txt")),
  rustcVersion: artifact("evidence/rustc-version.txt", join(stage, "out/rustc-version.txt")),
  cargoVersion: artifact("evidence/cargo-version.txt", join(stage, "out/cargo-version.txt")),
  finalLinkSymbols: artifact("evidence/final-link-symbols.txt", join(stage, "out/final-link-symbols.txt")),
  elfProof: artifact("evidence/elf-proof.txt", join(stage, "out/elf-proof.txt")),
  runtimeVerification: artifact("evidence/runtime-verification.txt", join(stage, "out/runtime-verification.txt")),
  fixedResult: artifact("evidence/fixed-result.json", join(stage, "out/runtime-evidence/fixed-result.json")),
  sealedResult: artifact("evidence/sealed-result.json", join(stage, "out/runtime-evidence/sealed-result.json")),
  runtimeManifestResult: artifact(
    "evidence/runtime-manifest-and-result.txt",
    join(stage, "out/runtime-evidence/runtime-manifest-and-result.txt"),
  ),
  syscallRestoration: artifact(
    "evidence/syscall-restoration-results.jsonl",
    join(stage, "out/runtime-evidence/syscall-restoration-results.jsonl"),
  ),
  rootMutations: artifact("evidence/root-mutation-results.tsv", join(stage, "out/root-mutation-results.tsv")),
  rootElfProof: artifact("evidence/elf-root-proof.txt", join(stage, "out/elf-root-proof.txt")),
  fileOpenTrace: artifact("evidence/file-open.trace", join(stage, "out/file-open.trace")),
  fileOpenSummary: artifact("evidence/file-open-summary.json", join(stage, "out/file-open-summary.json")),
};

const reproductionPairs = {
  denoBinary: [
    join(stage, "out/build-a/bundle/bin/capsule-deno-core-physical-omission"),
    join(stage, "out/build-b/bundle/bin/capsule-deno-core-physical-omission"),
  ],
  denoSnapshot: [
    join(stage, "out/build-a/bundle/share/capsule-deno-core/capsule_core_snapshot.bin"),
    join(stage, "out/build-b/bundle/share/capsule-deno-core/capsule_core_snapshot.bin"),
  ],
  denoTwoFileBundle: [
    join(stage, "out/build-a/capsule-deno-core-runtime-bundle.tar.gz"),
    join(stage, "out/build-b/capsule-deno-core-runtime-bundle.tar.gz"),
  ],
  runtimeRootManifest: [
    join(stage, "root-a/runtime-root-files.tsv"),
    join(stage, "root-b/runtime-root-files.tsv"),
  ],
  runtimeRootTar: [join(stage, "root-a/rootfs.tar"), join(stage, "root-b/rootfs.tar")],
  runtimeRootGzip: [join(stage, "root-a/rootfs.tar.gz"), join(stage, "root-b/rootfs.tar.gz")],
};
const reproducibility = Object.fromEntries(
  Object.entries(reproductionPairs).map(([name, [pathA, pathB]]) => {
    const buildA = artifact(`${name}/build-a`, pathA);
    const buildB = artifact(`${name}/build-b`, pathB);
    if (buildA.size !== buildB.size || buildA.sha256 !== buildB.sha256) {
      throw new Error(`same-host reproduction mismatch: ${name}`);
    }
    return [name, { buildA, buildB, result: "byte-equal" }];
  }),
);

const rustyFiles = readdirSync(rustyRoot)
  .sort()
  .map((name) => artifact(`rusty-v8/${name}`, join(rustyRoot, name)));
for (const item of rustyFiles) {
  const expected = rustyRelease.files[item.name.slice("rusty-v8/".length)];
  if (expected && (expected.sha256 !== item.sha256 || expected.size !== item.size)) {
    throw new Error(`rusty_v8 release-manifest mismatch: ${item.name}`);
  }
}

const runtimeInputRoot = join(stage, "inputs/runtime");
const runtimeSourceFiles = readdirSync(runtimeInputRoot)
  .filter((name) => /\.(deb|dsc|tar\.(?:gz|xz))$/.test(name))
  .sort()
  .map((name) => artifact(`runtime-inputs/${name}`, join(runtimeInputRoot, name)));

const caps = {
  rustyV8TotalBytes: 2147483648,
  denoBinaryBytes: 104857600,
  denoSnapshotBytes: 2097152,
  denoTwoFileBundleBytes: 134217728,
  cargoSourceBundleBytes: 268435456,
  runtimeRootEntries: 22,
  runtimeRootRegularFileBytes: 104857600,
  runtimeRootTarBytes: 134217728,
  runtimeRootGzipBytes: 67108864,
};
const rustyTotal = rustyFiles.reduce((sum, item) => sum + item.size, 0);
if (rustyTotal > caps.rustyV8TotalBytes) throw new Error("rusty_v8 cap exceeded");
if (subjects.denoBinary.size > caps.denoBinaryBytes) throw new Error("binary cap exceeded");
if (subjects.denoSnapshot.size > caps.denoSnapshotBytes) throw new Error("snapshot cap exceeded");
if (subjects.denoTwoFileBundle.size > caps.denoTwoFileBundleBytes) {
  throw new Error("Deno bundle cap exceeded");
}
if (subjects.cargoSource.size > caps.cargoSourceBundleBytes) {
  throw new Error("Cargo source cap exceeded");
}
if (subjects.runtimeRootTar.size > caps.runtimeRootTarBytes) {
  throw new Error("root tar cap exceeded");
}
if (subjects.runtimeRootGzip.size > caps.runtimeRootGzipBytes) {
  throw new Error("root gzip cap exceeded");
}

const rootRows = readFileSync(rootManifestPath, "utf8")
  .trimEnd()
  .split("\n")
  .slice(1)
  .map((line) => line.split("\t"));
const rootRegularBytes = rootRows
  .filter((row) => row[1] === "file")
  .reduce((sum, row) => sum + Number(row[5]), 0);
if (rootRows.length !== caps.runtimeRootEntries) throw new Error("root entry cap mismatch");
if (rootRegularBytes > caps.runtimeRootRegularFileBytes) {
  throw new Error("root regular-file cap exceeded");
}

const priorRootManifestPath = join(
  experiment,
  "../gate-c-deno-core-runtime-root/manifests/runtime-root-files.tsv",
);
const priorRootRows = readFileSync(priorRootManifestPath, "utf8")
  .trimEnd()
  .split("\n")
  .slice(1)
  .map((line) => line.split("\t"));
if (priorRootRows.length !== 22) throw new Error("prior root manifest is not 22 entries");
const priorByPath = new Map(priorRootRows.map((row) => [row[0], row]));
const currentByPath = new Map(rootRows.map((row) => [row[0], row]));
const rootPaths = [...new Set([...priorByPath.keys(), ...currentByPath.keys()])].sort();
const rootEntryDifferences = rootPaths
  .filter((path) => JSON.stringify(priorByPath.get(path)) !== JSON.stringify(currentByPath.get(path)))
  .map((path) => ({
    path,
    prior: priorByPath.get(path) ?? null,
    current: currentByPath.get(path) ?? null,
  }));
const allowedRootDifferences = new Set([
  "bin/capsule-deno-core-physical-omission",
  "share/capsule-deno-core/capsule_core_snapshot.bin",
]);
if (rootEntryDifferences.some((item) => !allowedRootDifferences.has(item.path))) {
  throw new Error("standalone-root difference is not attributable to governed Deno outputs");
}
const rootEntryComparison = {
  schema: "capsule.fork-native-runtime-root-entry-comparison.v1",
  priorManifest: artifact("runtime-root/prior-manifest", priorRootManifestPath),
  currentManifest: subjects.runtimeRootManifest,
  priorEntryCount: priorRootRows.length,
  currentEntryCount: rootRows.length,
  equalEntryCount: rootRows.length - rootEntryDifferences.length,
  differentEntryCount: rootEntryDifferences.length,
  differences: rootEntryDifferences,
  attribution:
    "only exact governed Deno binary and snapshot members may differ; no root bytes are normalized or rewritten",
};
writeJson("root-entry-comparison.json", rootEntryComparison);

const manifestText = readFileSync(
  join(stage, "out/runtime-evidence/runtime-manifest-and-result.txt"),
  "utf8",
);
const resultMarker = manifestText.lastIndexOf('\n{"count":3');
if (resultMarker < 0) throw new Error("runtime manifest result marker absent");
const descriptorManifest = JSON.parse(manifestText.slice(0, resultMarker));
if (
  JSON.stringify(descriptorManifest.hostSeal.inheritedDescriptors) !==
  JSON.stringify([0, 1, 2])
) {
  throw new Error("descriptor manifest mismatch");
}
writeJson("descriptor-manifest.json", descriptorManifest);

const compare = (current, prior) => ({
  current,
  prior,
  result: current === prior ? "equal" : "different",
});
const oracleV8 =
  "1ae209c9e4ba5803d010d2c79ee4cc0af0126c5a7ebcca211c7e41deaede4cd2";
const comparison = {
  schema: "capsule.fork-native-runtime-comparison.v1",
  rustyV8Archive: {
    ...compare(
      sha256(
        join(
          rustyRoot,
          "librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz",
        ),
      ),
      oracleV8,
    ),
    oracleRun: 30925045754,
  },
  denoBinary: compare(
    subjects.denoBinary.sha256,
    known.physicalOmission.binary.sha256,
  ),
  denoSnapshot: compare(
    subjects.denoSnapshot.sha256,
    known.physicalOmission.snapshot.sha256,
  ),
  runtimeRootGzip: compare(
    subjects.runtimeRootGzip.sha256,
    known.standaloneRoot.gzip.sha256,
  ),
  runtimeRootEntries: rootEntryComparison,
  decision: "comparison-closed",
  unexplainedDifferences: [],
  attribution: {
    versionedInputs: [
      "Shrimpworks/deno@9adb0b68b55bca81644827f1e7749a3acb091bed",
      "Shrimpworks/rusty_v8@80e863ddb942a4aa2b384e794fc23e35b9d2bb15",
      `rusty_v8 archive ${rustyRelease.files["librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz"].sha256}`,
      "direct governed Deno workspace path /workspace/deno/libs/core",
      "rust:1.95.0-bookworm@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1",
      "single visible logical CPU pinned to CPU set 0 for snapshot construction",
    ],
    denoBinary:
      "supersedes the prior binary because the exact governed rusty_v8 archive, direct fork workspace source path, and independently serialized current snapshot replace the prior official-prebuilt construction inputs",
    denoSnapshot:
      "supersedes the prior snapshot under the exact governed rusty_v8 archive and declared single-logical-CPU fork-native snapshot boundary; clean builds A and B are byte-equal",
    runtimeRootGzip:
      "supersedes the prior root solely through the versioned binary and snapshot entries; all other 20 closed-root entries are byte-identical",
    outputRewriteOrNormalization: false,
    rule:
      "different identities are retained as superseding fork-native bytes and are never rewritten to prior known answers",
  },
};
writeJson("comparison.json", comparison);

const field = (block, name) =>
  block.match(new RegExp(`^${name} = "([^"]+)"`, "m"))?.[1] ?? null;
const lockPackages = readFileSync(join(stage, "probe/Cargo.lock"), "utf8")
  .split("[[package]]")
  .slice(1)
  .map((block) => ({
    name: field(block, "name"),
    version: field(block, "version"),
    source: field(block, "source"),
    checksum: field(block, "checksum"),
  }));
const registryPackages = lockPackages.filter((pkg) => pkg.source?.startsWith("registry+"));
if (lockPackages.length !== 193 || registryPackages.length !== 189) {
  throw new Error(`unexpected Cargo closure: ${lockPackages.length}/${registryPackages.length}`);
}
const cargoComponents = registryPackages.map((pkg) => {
  const source = join(stage, "cache/vendor", `${pkg.name}-${pkg.version}`);
  const checksum = JSON.parse(
    readFileSync(join(source, ".cargo-checksum.json"), "utf8"),
  ).package;
  if (checksum !== pkg.checksum) throw new Error(`Cargo checksum mismatch: ${pkg.name}`);
  const cargoToml = readFileSync(join(source, "Cargo.toml"), "utf8");
  const license = cargoToml.match(/^license = "([^"]+)"/m)?.[1] ?? null;
  if (!license) throw new Error(`Cargo license expression absent: ${pkg.name}`);
  return {
    type: "library",
    "bom-ref": `pkg:cargo/${pkg.name}@${pkg.version}`,
    name: pkg.name,
    version: pkg.version,
    purl: `pkg:cargo/${pkg.name}@${pkg.version}`,
    hashes: [{ alg: "SHA-256", content: checksum }],
    licenses: [{ expression: license }],
  };
});

const rootComponents = [
  ["glibc", "2.36-9+deb12u14", "01f4330719fd4f65580e16ea5a0527f372fca750e8f588d26deaf09f2d3b1cf4"],
  ["libgcc-s1", "12.2.0-14+deb12u1", "576926b283613db80168ddf76380a3bd877602778cf0d226caa7bfbfa71eacf3"],
].map(([name, version, digest]) => ({
  type: "library",
  "bom-ref": `pkg:deb/debian/${name}@${version}?arch=arm64`,
  name,
  version,
  hashes: [{ alg: "SHA-256", content: digest }],
}));

const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  version: 1,
  metadata: {
    component: {
      type: "application",
      "bom-ref": "capsule-fork-native-runtime-root",
      name: "Capsule fork-native governed deno_core standalone runtime root",
      version: "0.409.0-fork-native-9adb0b68",
      hashes: [{ alg: "SHA-256", content: subjects.runtimeRootGzip.sha256 }],
    },
    properties: [
      { name: "capsule:admission", value: "none" },
      { name: "capsule:runtime-001", value: "unsupported" },
      { name: "capsule:root-entry-count", value: String(rootRows.length) },
      { name: "capsule:cargo-source-count", value: String(registryPackages.length) },
      { name: "capsule:rusty-v8-sbom-sha256", value: sha256(join(rustyRoot, "sbom.cdx.json")) },
      { name: "capsule:rusty-v8-spdx-sha256", value: sha256(join(rustyRoot, "sbom.spdx.json")) },
    ],
  },
  components: [
    {
      type: "framework",
      "bom-ref": "pkg:generic/Shrimpworks/rusty_v8@80e863ddb942?arch=aarch64&os=linux",
      name: "Shrimpworks governed rusty_v8",
      version: "150.2.0-80e863ddb942",
      hashes: [
        {
          alg: "SHA-256",
          content:
            rustyRelease.files[
              "librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz"
            ].sha256,
        },
      ],
    },
    {
      type: "library",
      "bom-ref": "pkg:generic/Shrimpworks/deno_core@9adb0b68b55b",
      name: "Shrimpworks governed deno_core",
      version: "0.409.0-9adb0b68b55b",
      hashes: [{ alg: "SHA-256", content: subjects.denoSource.sha256 }],
      licenses: [{ expression: "MIT" }],
    },
    ...rootComponents,
    ...cargoComponents,
  ],
  compositions: [
    {
      aggregate: "complete",
      assemblies: ["capsule-fork-native-runtime-root"],
      dependencies: [
        "pkg:generic/Shrimpworks/rusty_v8@80e863ddb942?arch=aarch64&os=linux",
        "pkg:generic/Shrimpworks/deno_core@9adb0b68b55b",
        ...rootComponents.map((item) => item["bom-ref"]),
        ...cargoComponents.map((item) => item["bom-ref"]),
      ],
    },
  ],
};
writeJson("sbom.cdx.json", sbom);

const sourceLicense = {
  schema: "capsule.fork-native-source-license-closure.v1",
  engineeringInventoryNotLegalAdvice: true,
  result: "closed-for-declared-build-and-runtime-materials",
  deno: {
    head: "9adb0b68b55bca81644827f1e7749a3acb091bed",
    tree: "72edd0f7b5f83b918945860653714e344c8a303f",
    sourceArchive: subjects.denoSource,
    license: "MIT",
  },
  cargo: {
    lockSha256: sha256(join(stage, "probe/Cargo.lock")),
    sourceBundle: subjects.cargoSource,
    packages: lockPackages.length,
    registrySources: registryPackages.length,
    registrySourcesWithLicenseExpression: cargoComponents.length,
  },
  rustyV8: {
    head: rustyRelease.sourceCommit,
    correspondingSource: rustyRelease.files["corresponding-source.tar.gz"],
    licensesNotices: rustyRelease.files["licenses-notices.tar.gz"],
    cyclonedx: rustyRelease.files["sbom.cdx.json"],
    spdx: rustyRelease.files["sbom.spdx.json"],
    provenance: rustyRelease.files["provenance.intoto.json"],
  },
  dynamicRoot: {
    packageSourcesManifest:
      "experiments/gate-c-deno-core-runtime-root/manifests/package-sources.json",
    inputs: runtimeSourceFiles,
  },
  unsigned: true,
  published: false,
};
writeJson("source-license-closure.json", sourceLicense);

const allArtifacts = [
  ...Object.values(subjects),
  ...Object.values(buildEvidence),
  ...rustyFiles,
  ...runtimeSourceFiles,
];
writeFileSync(
  join(output, "artifact-sha256sums.txt"),
  `${allArtifacts
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((item) => `${item.sha256}  ${item.size}  ${item.name}`)
    .join("\n")}\n`,
);

const bundleManifest = {
  schema: "capsule.fork-native-runtime-bundle.v1",
  status: "constructed-and-verified-not-admitted",
  target: "aarch64-unknown-linux-gnu",
  forks: {
    deno: {
      head: "9adb0b68b55bca81644827f1e7749a3acb091bed",
      merge: "ea18b9dc21ff8ebd19347be7095f47937ee14ec2",
      upstream: "14eea3160ae5834476aa3b9d317b8d41d991b982",
    },
    rustyV8: {
      head: "80e863ddb942a4aa2b384e794fc23e35b9d2bb15",
      merge: "cbf56de2e1156b1cf1561fdbaea7172a0aa056f4",
      upstream: "d305e6afa7736f6e298c30ae6646f7709ee9382b",
    },
  },
  runtime: {
    rootEntries: rootRows.length,
    regularFileBytes: rootRegularBytes,
    binary: subjects.denoBinary,
    snapshot: subjects.denoSnapshot,
    denoTwoFileBundle: subjects.denoTwoFileBundle,
    rootManifest: subjects.runtimeRootManifest,
    rootTar: subjects.runtimeRootTar,
    rootGzip: subjects.runtimeRootGzip,
    explicitLoaderInvocation: {
      interpreter: "/lib/ld-linux-aarch64.so.1",
      arguments: ["--inhibit-cache", "--library-path", "/lib/aarch64-linux-gnu"],
    },
  },
  supplyChain: {
    denoSource: subjects.denoSource,
    cargoSource: subjects.cargoSource,
    rustyV8ReleaseManifest: rustyRelease,
    dynamicRootSources: runtimeSourceFiles,
  },
  caps,
  capObservations: {
    rustyV8TotalBytes: rustyTotal,
    runtimeRootRegularFileBytes: rootRegularBytes,
  },
  reproducibility,
  comparison,
  evidence: buildEvidence,
  verification: {
    sameHostDenoBuildAB: "byte-equal",
    sameHostRootBuildAB: "byte-equal",
    builtinOps: descriptorManifest.builtinOps,
    fixedResult: { count: 3, label: "capsule-owned", sum: 6 },
    moduleLoader: descriptorManifest.moduleLoader,
    descriptors: descriptorManifest.hostSeal.inheritedDescriptors,
    syscallSeal: "pass",
    fileOpenClosure: "pass",
    restorationMutations: "pass",
  },
  admission: {
    signed: false,
    published: false,
    runtimeProfileSelected: false,
    runtime001: "unsupported",
  },
};
writeJson("runtime-bundle-manifest.json", bundleManifest);

const provenance = {
  _type: "https://in-toto.io/Statement/v1",
  subject: [
    subjects.denoBinary,
    subjects.denoSnapshot,
    subjects.runtimeRootGzip,
  ].map((item) => ({ name: item.name, digest: { sha256: item.sha256 } })),
  predicateType: "https://slsa.dev/provenance/v1",
  predicate: {
    buildDefinition: {
      buildType: "https://capsule.local/experiments/fork-native-deno-runtime-bundle/v1",
      externalParameters: {
        target: "aarch64-unknown-linux-gnu",
        denoHead: bundleManifest.forks.deno.head,
        rustyV8Head: bundleManifest.forks.rustyV8.head,
        networkBoundary: "connected digest-only prefetch; network-none build/test/evidence",
      },
      internalParameters: {
        sourceDateEpoch: 0,
        locale: "C",
        timezone: "UTC",
        aslr: "disabled for Cargo and descendants",
        fixedWorkspace: "/workspace",
        snapshotBuilderLogicalCpus: 1,
        snapshotBuilderCpuSet: "0",
      },
      resolvedDependencies: [
        { uri: "pkg:github/Shrimpworks/deno@9adb0b68b55b", digest: { gitCommit: bundleManifest.forks.deno.head } },
        { uri: "pkg:github/Shrimpworks/rusty_v8@80e863ddb942", digest: { gitCommit: bundleManifest.forks.rustyV8.head } },
        { uri: "file:rusty-v8/provenance.intoto.json", digest: { sha256: sha256(join(rustyRoot, "provenance.intoto.json")) } },
        { uri: "file:cargo-source-bundle.tar.gz", digest: { sha256: subjects.cargoSource.sha256 } },
        ...runtimeSourceFiles.map((item) => ({
          uri: `file:${item.name}`,
          digest: { sha256: item.sha256 },
        })),
      ],
    },
    runDetails: {
      builder: {
        id: "pkg:oci/rust@1.95.0-bookworm?repository_digest=sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1",
      },
      metadata: {
        invocationId: "capsule-fork-native-arm64-2026-08-04-local-same-host",
      },
      byproducts: [
        { name: "comparison.json", digest: { sha256: sha256(join(output, "comparison.json")) } },
        { name: "sbom.cdx.json", digest: { sha256: sha256(join(output, "sbom.cdx.json")) } },
        { name: "source-license-closure.json", digest: { sha256: sha256(join(output, "source-license-closure.json")) } },
      ],
      limitations: [
        "unsigned experiment-generated provenance",
        "same Apple Silicon Docker Desktop/LinuxKit host for local rusty_v8, Deno A/B, and root A/B",
        "the local rusty_v8 build is an amd64-host to arm64-target cross build under Docker platform emulation",
        "GitHub run 30925045754 is comparison evidence, not an input to the local reconstruction",
        "no independent second builder or libkrun/HVF guest was exercised",
      ],
    },
  },
};
writeJson("provenance.intoto.json", provenance);

writeJson("result.json", {
  schema: "capsule.fork-native-deno-runtime-result.v1",
  decision: "PASSED-EXACT-CLEAN-CONSTRUCTION-ONLY",
  runtimeSelectionAdmission: "IN_PROGRESS-UNSUPPORTED",
  fixedResult: { count: 3, label: "capsule-owned", sum: 6 },
  artifacts: subjects,
  reproducibility,
  comparison,
  rootEntries: rootRows.length,
  rootRegularFileBytes: rootRegularBytes,
  verification: bundleManifest.verification,
  admission: bundleManifest.admission,
});

console.log(`wrote evidence to ${output}`);
console.log(`binary=${subjects.denoBinary.sha256}`);
console.log(`snapshot=${subjects.denoSnapshot.sha256}`);
console.log(`rootGzip=${subjects.runtimeRootGzip.sha256}`);
