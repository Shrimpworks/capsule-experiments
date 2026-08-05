#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const artifactDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = join(artifactDir, "evidence");
const binaryPath = join(artifactDir, "dist/capsule-mjs-source-validator-aarch64-apple-darwin");
const lockPath = join(artifactDir, "Cargo.lock");
const reproductionPath = join(evidenceDir, "reproduction.json");
const archivedCandidate = Object.freeze({
  archiveCommit: "0d8233b55f153b27a901a9ec45a3834208e3aa86",
  cargoLockSha256: "505669a07338603876bc96c242f8d5af386d3a13139e70110a8b52f39bae69ac",
  oxcDependencyCount: 65,
  candidateOnlyFeatureUnifiedDependencies: Object.freeze([
    "serde_derive@1.0.229|registry+https://github.com/rust-lang/crates.io-index",
  ]),
});

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function filesBelow(root) {
  const result = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const stat = statSync(path);
      if (stat.isDirectory()) visit(path);
      else if (stat.isFile()) result.push(path);
    }
  };
  visit(root);
  return result;
}

const metadata = JSON.parse(
  execFileSync(
    "cargo",
    [
      "+1.95.0",
      "metadata",
      "--format-version",
      "1",
      "--locked",
      "--offline",
      "--filter-platform",
      "aarch64-apple-darwin",
      "--manifest-path",
      join(artifactDir, "Cargo.toml"),
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  ),
);
const packageById = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
const nodeById = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
const root = metadata.packages.find((pkg) => pkg.name === "capsule-mjs-source-validator");
if (!root) throw new Error("validator package missing from metadata");

function dependencyClosure(nodeMap, roots) {
  const result = new Set();
  const pending = [...roots];
  while (pending.length > 0) {
    const id = pending.pop();
    if (result.has(id)) continue;
    result.add(id);
    for (const dependency of nodeMap.get(id)?.deps ?? []) {
      if (dependency.dep_kinds.some((kind) => kind.kind === null || kind.kind === "build")) {
        pending.push(dependency.pkg);
      }
    }
  }
  return result;
}
const closure = dependencyClosure(nodeById, [root.id]);

const packages = [...closure]
  .map((id) => packageById.get(id))
  .sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));

const packageRecords = packages.map((pkg) => {
  const packageRoot = dirname(pkg.manifest_path);
  const checksumPath = join(packageRoot, ".cargo-checksum.json");
  let registryChecksum = null;
  try {
    registryChecksum = JSON.parse(readFileSync(checksumPath, "utf8")).package ?? null;
  } catch {
    // The repository-owned root is bound by the source-input list below.
  }
  const sourceFiles =
    pkg.name === root.name
      ? [
          join(packageRoot, "Cargo.toml"),
          join(packageRoot, "Cargo.lock"),
          join(packageRoot, "LICENSE"),
          join(packageRoot, "rust-toolchain.toml"),
          ...filesBelow(join(packageRoot, "src")),
        ]
      : filesBelow(packageRoot);
  const sourceBytes = sourceFiles.reduce((total, path) => total + statSync(path).size, 0);
  const notices = sourceFiles
    .filter((path) => /^(license|copying|notice|copyright)/i.test(basename(path)))
    .map((path) => ({
      path: relative(packageRoot, path),
      bytes: statSync(path).size,
      sha256: sha256File(path),
    }));
  return {
    name: pkg.name,
    version: pkg.version,
    source: pkg.source ?? "repository",
    registryChecksum,
    licenseExpression: pkg.license ?? null,
    licenseFile: pkg.license_file ?? null,
    sourceFileCount: sourceFiles.length,
    sourceBytes,
    notices,
  };
});

const directOxcNames = new Set([
  "oxc_allocator",
  "oxc_ast",
  "oxc_ast_visit",
  "oxc_parser",
  "oxc_semantic",
  "oxc_span",
]);
const artifactDirectOxcIds = nodeById
  .get(root.id)
  .deps.filter((dependency) => directOxcNames.has(dependency.name))
  .map((dependency) => dependency.pkg);
const artifactOxcClosure = dependencyClosure(nodeById, artifactDirectOxcIds);
if (artifactOxcClosure.size !== archivedCandidate.oxcDependencyCount - 1) {
  throw new Error("artifact Oxc closure no longer matches the retained candidate comparison");
}

const lockPackageCount = (readFileSync(lockPath, "utf8").match(/^\[\[package\]\]$/gm) ?? []).length;

const sourceInputs = [
  "Cargo.toml",
  "Cargo.lock",
  "LICENSE",
  "rust-toolchain.toml",
  "src/lib.rs",
  "src/main.rs",
  "scripts/reproduce.sh",
  "scripts/generate-evidence.mjs",
  "scripts/verify-evidence.mjs",
  "scripts/verify-process.mjs",
].map((path) => ({
  path,
  bytes: statSync(join(artifactDir, path)).size,
  sha256: sha256File(join(artifactDir, path)),
}));

const sourceManifest = {
  schema: "capsule.source-validator.source-manifest/v1",
  artifact: "capsule-mjs-source-validator",
  target: "aarch64-apple-darwin",
  cargoLockSha256: sha256File(lockPath),
  lockedDependencyCount: lockPackageCount - 1,
  targetComponentCount: packageRecords.length,
  targetDependencyCount: packageRecords.filter((pkg) => pkg.source !== "repository").length,
  engineeringCandidate: {
    archiveCommit: archivedCandidate.archiveCommit,
    cargoLockSha256: archivedCandidate.cargoLockSha256,
    oxcDependencyCount: archivedCandidate.oxcDependencyCount,
    artifactOxcDependencyCount: artifactOxcClosure.size,
    artifactOnlyDependencies: [],
    candidateOnlyFeatureUnifiedDependencies:
      archivedCandidate.candidateOnlyFeatureUnifiedDependencies,
    disposition:
      "all artifact Oxc package/version/source identities match the candidate; the artifact omits only serde_derive, which the multi-candidate experiment workspace feature-unified but this crate does not enable",
  },
  sourceInputs,
  packages: packageRecords.map(({ notices, ...pkg }) => pkg),
};
writeJson(join(evidenceDir, "source-manifest.json"), sourceManifest);

const licenseReport = {
  schema: "capsule.source-validator.license-report/v1",
  artifact: "capsule-mjs-source-validator",
  packageCount: packageRecords.length,
  packages: packageRecords.map(({ name, version, licenseExpression, licenseFile, notices }) => ({
    name,
    version,
    licenseExpression,
    licenseFile,
    notices,
    review: licenseExpression || licenseFile ? "declared-and-notice-files-hashed" : "missing",
  })),
  missingDeclarations: packageRecords
    .filter((pkg) => !pkg.licenseExpression && !pkg.licenseFile)
    .map((pkg) => `${pkg.name}@${pkg.version}`),
  limitation:
    "Declared expressions and retained notice-file hashes are an inventory, not legal advice or an upstream authorship audit.",
};
writeJson(join(evidenceDir, "license-report.json"), licenseReport);

function purl(pkg) {
  return pkg.source === "repository"
    ? "pkg:generic/capsule/capsule-mjs-source-validator@0.1.0"
    : `pkg:cargo/${encodeURIComponent(pkg.name)}@${encodeURIComponent(pkg.version)}`;
}
const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  version: 1,
  metadata: {
    component: {
      type: "application",
      "bom-ref": purl(packageRecords.find((pkg) => pkg.name === root.name)),
      name: root.name,
      version: root.version,
    },
    properties: [
      { name: "capsule:target", value: "aarch64-apple-darwin" },
      { name: "capsule:cargo-lock-sha256", value: sha256File(lockPath) },
      { name: "capsule:network-during-retained-build", value: "offline" },
      { name: "capsule:admission", value: "not-enrolled" },
    ],
  },
  components: packageRecords.map((pkg) => ({
    type: pkg.name === root.name ? "application" : "library",
    "bom-ref": purl(pkg),
    name: pkg.name,
    version: pkg.version,
    purl: purl(pkg),
    ...(pkg.registryChecksum
      ? { hashes: [{ alg: "SHA-256", content: pkg.registryChecksum }] }
      : {}),
    ...(pkg.licenseExpression ? { licenses: [{ expression: pkg.licenseExpression }] } : {}),
    properties: [
      { name: "capsule:source", value: pkg.source },
      { name: "capsule:source-bytes", value: String(pkg.sourceBytes) },
    ],
  })),
  dependencies: [...closure].sort().map((id) => ({
    ref: purl(
      packageRecords.find((pkg) => {
        const candidate = packageById.get(id);
        return pkg.name === candidate.name && pkg.version === candidate.version;
      }),
    ),
    dependsOn: (nodeById.get(id)?.deps ?? [])
      .filter(
        (dependency) =>
          closure.has(dependency.pkg) &&
          dependency.dep_kinds.some((kind) => kind.kind === null || kind.kind === "build"),
      )
      .map((dependency) => {
        const candidate = packageById.get(dependency.pkg);
        return purl(
          packageRecords.find(
            (pkg) => pkg.name === candidate.name && pkg.version === candidate.version,
          ),
        );
      })
      .sort(),
  })),
};
writeJson(join(evidenceDir, "sbom.cdx.json"), sbom);

const reproduction = JSON.parse(readFileSync(reproductionPath, "utf8"));
const codeSignatureCheck = spawnSync("/usr/bin/codesign", ["-dv", "--verbose=4", binaryPath], {
  encoding: "utf8",
});
const codeSignatureOutput = `${codeSignatureCheck.stdout}${codeSignatureCheck.stderr}`;
const codeDirectoryHash = codeSignatureOutput.match(
  /CandidateCDHashFull sha256=([0-9a-f]{64})/,
)?.[1];
if (
  codeSignatureCheck.status !== 0 ||
  !codeSignatureOutput.includes("flags=0x20002(adhoc,linker-signed)") ||
  !codeSignatureOutput.includes("Signature=adhoc") ||
  !codeSignatureOutput.includes("TeamIdentifier=not set") ||
  !codeDirectoryHash
) {
  throw new Error("artifact does not have the expected identity-free linker ad-hoc signature");
}
const linkedLibraries = execFileSync("/usr/bin/otool", ["-L", binaryPath], { encoding: "utf8" })
  .split("\n")
  .slice(1)
  .map((line) => line.trim())
  .filter(Boolean);
if (
  linkedLibraries.length !== 1 ||
  linkedLibraries[0] !==
    "/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 1356.0.0)"
) {
  throw new Error("artifact has an unexpected dynamic-library dependency");
}
const buildManifest = {
  schema: "capsule.source-validator.build-manifest/v1",
  artifact: {
    path: "dist/capsule-mjs-source-validator-aarch64-apple-darwin",
    bytes: statSync(binaryPath).size,
    sha256: sha256File(binaryPath),
    executableFormat: "Mach-O arm64",
    codeSignature: {
      kind: "linker-ad-hoc",
      codeDirectorySha256: codeDirectoryHash,
      teamIdentifier: null,
      installationAuthority: false,
    },
    linkedLibraries,
  },
  toolchain: {
    rustc: reproduction.rustc,
    cargo: reproduction.cargo,
    target: reproduction.target,
    macosDeploymentTarget: reproduction.macosDeploymentTarget,
  },
  build: {
    network: "offline",
    cargo: "build --release --locked --offline --target aarch64-apple-darwin",
    rustflags: reproduction.rustflags,
    sourceDateEpoch: reproduction.sourceDateEpoch,
  },
  inputs: {
    cargoLockSha256: sha256File(lockPath),
    sourceManifestSha256: sha256File(join(evidenceDir, "source-manifest.json")),
    licenseReportSha256: sha256File(join(evidenceDir, "license-report.json")),
    sbomSha256: sha256File(join(evidenceDir, "sbom.cdx.json")),
    reproductionSha256: sha256File(reproductionPath),
  },
  dependencyGraph: {
    lockedDependencies: lockPackageCount - 1,
    targetComponents: packageRecords.length,
    targetDependencies: packageRecords.filter((pkg) => pkg.source !== "repository").length,
    candidateOxcDependencies: archivedCandidate.oxcDependencyCount,
    artifactOxcDependencies: artifactOxcClosure.size,
    artifactOnlyOxcDependencies: [],
    candidateOnlyFeatureUnifiedOxcDependencies:
      archivedCandidate.candidateOnlyFeatureUnifiedDependencies,
    directOxcCrates: [
      "oxc_allocator@0.140.0",
      "oxc_ast@0.140.0",
      "oxc_ast_visit@0.140.0",
      "oxc_parser@0.140.0",
      "oxc_semantic@0.140.0",
      "oxc_span@0.140.0",
    ],
    fixedHashPrimitive: "sha2@0.10.9",
  },
  reproducibility: {
    byteIdentical: reproduction.byteIdentical,
    sameHost: reproduction.sameHost,
    independentBuilder: reproduction.independentBuilder,
  },
};
writeJson(join(evidenceDir, "build-manifest.json"), buildManifest);

const provenance = {
  _type: "https://in-toto.io/Statement/v1",
  subject: [
    {
      name: buildManifest.artifact.path,
      digest: { sha256: buildManifest.artifact.sha256 },
    },
  ],
  predicateType: "https://slsa.dev/provenance/v1",
  predicate: {
    buildDefinition: {
      buildType: "https://capsule.local/source-validator-rust-offline/v1",
      externalParameters: {
        target: reproduction.target,
        toolchain: reproduction.rustc,
        cargoArguments: buildManifest.build.cargo,
      },
      internalParameters: {
        rustflags: reproduction.rustflags,
        sourceDateEpoch: reproduction.sourceDateEpoch,
      },
      resolvedDependencies: [
        { uri: "file:Cargo.lock", digest: { sha256: sha256File(lockPath) } },
        {
          uri: "file:evidence/source-manifest.json",
          digest: { sha256: sha256File(join(evidenceDir, "source-manifest.json")) },
        },
      ],
    },
    runDetails: {
      builder: { id: "https://capsule.local/untrusted-same-host-builder/v1" },
      metadata: { invocationId: "capsule-mjs-validator-v1-same-host-reproduction" },
      byproducts: [
        {
          name: "evidence/build-manifest.json",
          digest: { sha256: sha256File(join(evidenceDir, "build-manifest.json")) },
        },
      ],
    },
  },
  signatures: [],
  limitation:
    "Unsigned same-host provenance; no installation authority, independent builder, transparency log, or release signature is claimed.",
};
writeJson(join(evidenceDir, "provenance.intoto.json"), provenance);

const assessment = {
  schema: "capsule.source-validator.assessment/v1",
  decision: "V1-ARTIFACT-RETAINED-NOT-ENROLLED",
  artifactSha256: sha256File(binaryPath),
  cargoLockSha256: sha256File(lockPath),
  evidence: {
    buildManifestSha256: sha256File(join(evidenceDir, "build-manifest.json")),
    sourceManifestSha256: sha256File(join(evidenceDir, "source-manifest.json")),
    licenseReportSha256: sha256File(join(evidenceDir, "license-report.json")),
    sbomSha256: sha256File(join(evidenceDir, "sbom.cdx.json")),
    provenanceSha256: sha256File(join(evidenceDir, "provenance.intoto.json")),
    reproductionSha256: sha256File(reproductionPath),
  },
  passed: [
    "exact Oxc 0.140.0 parser/AST/visitor/semantic mode",
    "Rust 1.95.0 and complete locked offline dependency graph",
    "V0 request/result byte compatibility and all 28 M1 HOLD outcomes",
    "parser and semantic diagnostic typed refusals with zero counts",
    "same-host two-clean-directory byte-for-byte reproduction",
    "complete registry-checksum, license/notice, source and CycloneDX inventories",
    "valid identity-free linker ad-hoc signature with retained CodeDirectory digest",
  ],
  blockers: [
    "no independent builder or clean-host reproduction",
    "no installation-authority artifact signature or assessment signature; linker ad-hoc signing grants no identity",
    "no V2 fixed launch descriptor, sandbox, descriptor closure or resource/deadline proof",
    "no vulnerability-monitoring owner, response SLA or release cadence",
    "no daemon/Broker consumer and no runtime no-loader evidence",
  ],
  authority:
    "The artifact is unwired and cannot approve, register, retain state, use keys, launch a backend, or create a guest.",
};
writeJson(join(evidenceDir, "assessment.json"), assessment);

const candidate = readFileSync(
  resolve(
    artifactDir,
    "../../schemas/conformance/v0/mjs-source-validator/engineering-candidate.bin",
  ),
);
const candidateIdentity = createHash("sha256")
  .update("capsule.source-validator.engineering-candidate/v0")
  .update(Buffer.from([0]))
  .update(candidate)
  .digest();
const profile = Buffer.alloc(160);
profile.writeUInt32BE(156, 0);
profile.write("CAPMJSAP", 4, "ascii");
for (const [index, value] of [0, 0, 1, 1, 1, 1].entries())
  profile.writeUInt16BE(value, 12 + index * 2);
profile.writeUInt16BE(0x0102, 24);
candidateIdentity.copy(profile, 26);
profile.writeUInt16BE(0x0103, 58);
Buffer.from(buildManifest.artifact.sha256, "hex").copy(profile, 60);
profile.writeUInt16BE(0x0104, 92);
Buffer.from(sha256File(join(evidenceDir, "build-manifest.json")), "hex").copy(profile, 94);
profile.writeUInt16BE(0x0105, 126);
Buffer.from(sha256File(join(evidenceDir, "assessment.json")), "hex").copy(profile, 128);
writeFileSync(join(evidenceDir, "artifact-profile.bin"), profile);

const profileIdentity = createHash("sha256")
  .update("capsule.source-validator.artifact-profile/v0")
  .update(Buffer.from([0]))
  .update(profile)
  .digest("hex");
writeJson(join(evidenceDir, "artifact-profile.json"), {
  schema: "capsule.source-validator.artifact-profile-evidence/v1",
  bytes: profile.length,
  sha256: sha256Bytes(profile),
  identitySha256: profileIdentity,
  engineeringCandidateIdentitySha256: candidateIdentity.toString("hex"),
  executableSha256: buildManifest.artifact.sha256,
  buildManifestSha256: sha256File(join(evidenceDir, "build-manifest.json")),
  assessmentSha256: sha256File(join(evidenceDir, "assessment.json")),
  enrollment: "not-enrolled",
});
