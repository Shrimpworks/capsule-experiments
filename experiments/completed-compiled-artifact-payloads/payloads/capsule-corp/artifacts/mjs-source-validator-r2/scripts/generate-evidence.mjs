#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const artifactDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = join(artifactDir, "evidence");
const [buildA, buildB] = process.argv.slice(2).map((path) => resolve(path));
if (!buildA || !buildB) throw new Error("two clean bundle directories are required");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sha256File = (path) => sha256(readFileSync(path));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

function filesBelow(root) {
  const files = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const stat = statSync(path);
      if (stat.isDirectory()) visit(path);
      else if (stat.isFile()) files.push(path);
      else throw new Error(`non-regular artifact entry: ${path}`);
    }
  };
  visit(root);
  return files;
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
const root = metadata.packages.find((pkg) => pkg.name === "capsule-mjs-source-validator-r2");
if (!root) throw new Error("R2 package missing from Cargo metadata");
const packageById = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
const nodeById = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
const sourceInputNames = [
  "Cargo.toml",
  "Cargo.lock",
  "LICENSE",
  "rust-toolchain.toml",
  "src/lib.rs",
  "src/bin/daemon.rs",
  "src/bin/approval_broker.rs",
  "launcher/launcher.c",
  "launcher/daemon-Info.plist",
  "launcher/broker-Info.plist",
  "scripts/reproduce.sh",
  "scripts/generate-evidence.mjs",
  "scripts/verify-evidence.mjs",
  "scripts/verify-process.mjs",
];
const closure = new Set();
const pending = [root.id];
while (pending.length > 0) {
  const id = pending.pop();
  if (closure.has(id)) continue;
  closure.add(id);
  for (const dependency of nodeById.get(id)?.deps ?? []) {
    if (dependency.dep_kinds.some((kind) => kind.kind === null || kind.kind === "build")) {
      pending.push(dependency.pkg);
    }
  }
}

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
    // Repository sources are bound separately below.
  }
  const files =
    pkg.name === root.name
      ? sourceInputNames.map((path) => join(artifactDir, path))
      : filesBelow(packageRoot);
  const notices = files
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
    sourceFileCount: files.length,
    sourceBytes: files.reduce((total, path) => total + statSync(path).size, 0),
    notices,
  };
});

const sourceInputs = sourceInputNames.map((path) => ({
  path,
  bytes: statSync(join(artifactDir, path)).size,
  sha256: sha256File(join(artifactDir, path)),
}));

const roleSpecs = [
  {
    role: "daemon",
    serviceIdentifier: "com.capsulecorp.capsule.source-validator.daemon.v1",
    bundle: "CapsuleSourceValidatorDaemon.xpc",
    launcher: "Contents/MacOS/CapsuleSourceValidatorDaemonLauncher",
    parser: "Contents/Resources/capsule-mjs-source-validator-daemon",
  },
  {
    role: "approval-broker",
    serviceIdentifier: "com.capsulecorp.capsule.source-validator.approval-broker.v1",
    bundle: "CapsuleSourceValidatorBroker.xpc",
    launcher: "Contents/MacOS/CapsuleSourceValidatorBrokerLauncher",
    parser: "Contents/Resources/capsule-mjs-source-validator-approval-broker",
  },
];

function retained(path) {
  return {
    path,
    bytes: statSync(join(artifactDir, path)).size,
    sha256: sha256File(join(artifactDir, path)),
  };
}
function dylibs(path) {
  return execFileSync("otool", ["-L", path], { encoding: "utf8" })
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(" ")[0])
    .filter(Boolean);
}

const roles = roleSpecs.map((spec) => {
  const bundlePath = `dist/${spec.bundle}`;
  const infoPlist = `${bundlePath}/Contents/Info.plist`;
  const launcher = `${bundlePath}/${spec.launcher}`;
  const parser = `${bundlePath}/${spec.parser}`;
  const policy = `${bundlePath}/Contents/Resources/resource-policy-inactive.bin`;
  return {
    role: spec.role,
    serviceIdentifier: spec.serviceIdentifier,
    bundlePath,
    infoPlist: retained(infoPlist),
    launcher: {
      ...retained(launcher),
      appleIdentity: null,
      dylibs: dylibs(join(artifactDir, launcher)),
    },
    parser: { ...retained(parser), appleIdentity: null, dylibs: dylibs(join(artifactDir, parser)) },
    resourcePolicy: { ...retained(policy), activation: "inactive", activeMeasurements: false },
  };
});

const manifestA = filesBelow(buildA).map((path) => ({
  path: relative(buildA, path),
  bytes: statSync(path).size,
  sha256: sha256File(path),
}));
const manifestB = filesBelow(buildB).map((path) => ({
  path: relative(buildB, path),
  bytes: statSync(path).size,
  sha256: sha256File(path),
}));
const reproduction = {
  schema: "capsule.source-validator.unsigned-reproduction/v1",
  method:
    "two clean copied source directories, Cargo targets, native launcher builds, and assembled bundle directories",
  network: "offline",
  sameHost: true,
  independentBuilder: false,
  target: "aarch64-apple-darwin",
  macosDeploymentTarget: "14.0",
  rustc: execFileSync("rustc", ["+1.95.0", "--version"], { encoding: "utf8" }).trim(),
  cargo: execFileSync("cargo", ["+1.95.0", "--version"], { encoding: "utf8" }).trim(),
  clang: execFileSync("clang", ["--version"], { encoding: "utf8" }).split("\n")[0],
  cargoLockSha256: sha256File(join(artifactDir, "Cargo.lock")),
  sourceDateEpoch: 0,
  roles: roleSpecs.map((spec) => ({ role: spec.role, bundle: spec.bundle })),
  buildA: manifestA,
  buildB: manifestB,
  byteIdentical: JSON.stringify(manifestA) === JSON.stringify(manifestB),
  limitation:
    "Same-host clean-directory equality is not independent-builder or clean-host provenance.",
};
writeJson(join(evidenceDir, "reproduction.json"), reproduction);

const sourceManifest = {
  schema: "capsule.source-validator.unsigned-source-manifest/v1",
  artifact: "capsule-source-validator-role-bundles-r2",
  target: "aarch64-apple-darwin",
  cargoLockSha256: sha256File(join(artifactDir, "Cargo.lock")),
  lockedPackageCount: (
    readFileSync(join(artifactDir, "Cargo.lock"), "utf8").match(/^\[\[package\]\]$/gm) ?? []
  ).length,
  targetComponentCount: packageRecords.length,
  sourceInputs,
  packages: packageRecords.map(({ notices, ...record }) => record),
};
writeJson(join(evidenceDir, "source-manifest.json"), sourceManifest);

const licenseReport = {
  schema: "capsule.source-validator.unsigned-license-report/v1",
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
    "This is a declared-license and notice-file inventory, not legal advice or an authorship audit.",
};
writeJson(join(evidenceDir, "license-report.json"), licenseReport);

const purl = (pkg) =>
  pkg.source === "repository"
    ? "pkg:generic/capsule/capsule-mjs-source-validator-r2@0.1.0"
    : `pkg:cargo/${encodeURIComponent(pkg.name)}@${encodeURIComponent(pkg.version)}`;
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
      { name: "capsule:network", value: "offline" },
      { name: "capsule:enrollment", value: "not-enrolled" },
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
  })),
};
writeJson(join(evidenceDir, "sbom.cdx.json"), sbom);

const buildManifest = {
  schema: "capsule.source-validator.unsigned-build-manifest/v1",
  target: "aarch64-apple-darwin",
  macosDeploymentTarget: "14.0",
  network: "offline",
  roles,
  dependencyGraph: {
    lockedPackages: sourceManifest.lockedPackageCount,
    targetComponents: sourceManifest.targetComponentCount,
  },
  signing: {
    appleIdentityUsed: false,
    enrollment: "not-enrolled",
    note: "Mach-O files carry only build-tool linker signatures.",
  },
};
writeJson(join(evidenceDir, "build-manifest.json"), buildManifest);

const provenanceSubjects = roles
  .flatMap((role) => [role.infoPlist, role.launcher, role.parser, role.resourcePolicy])
  .map((item) => ({
    name: item.path,
    digest: { sha256: item.sha256 },
  }));
const provenance = {
  _type: "https://in-toto.io/Statement/v1",
  subject: provenanceSubjects,
  predicateType: "https://slsa.dev/provenance/v1",
  predicate: {
    buildDefinition: {
      buildType: "https://capsulecorp.example/source-validator/unsigned-role-bundles-r2/v1",
      externalParameters: {
        target: "aarch64-apple-darwin",
        macosDeploymentTarget: "14.0",
        network: "offline",
      },
      internalParameters: {
        sourceManifestSha256: sha256File(join(evidenceDir, "source-manifest.json")),
        cargoLockSha256: sourceManifest.cargoLockSha256,
      },
      resolvedDependencies: [],
    },
    runDetails: {
      builder: { id: "local-unsigned-same-host-builder" },
      metadata: { invocationId: "not-retained", startedOn: null, finishedOn: null },
      byproducts: [],
    },
    capsuleLimitations: {
      signed: false,
      independentBuilder: false,
      installed: false,
      enrolled: false,
    },
  },
};
writeJson(join(evidenceDir, "provenance.intoto.json"), provenance);

const construction = {
  schema: "capsule.source-validator.unsigned-construction/v1",
  status: "PASSED",
  enrollment: "not-enrolled",
  signing: { appleIdentityUsed: false, developerIdUsed: false },
  build: { network: "offline", target: "aarch64-apple-darwin", macosDeploymentTarget: "14.0" },
  roles,
  behavior: {
    resourcePolicy: "inactive",
    xpcEndpointInstalled: false,
    parserSpawnPermitted: false,
    productConsumerPresent: false,
    reason:
      "R4 has not derived or admitted active resource values; the unsigned R2 launcher predecodes and refuses.",
  },
  limitations: [
    "Unsigned bundles are not installed, enrolled, authenticated, or product-wired.",
    "No active monitored parser-child launch is claimed under the canonical inactive resource policy.",
    "Same-host byte equality is not independent-builder or clean-host reproduction.",
  ],
};
writeJson(join(evidenceDir, "construction.json"), construction);

for (const path of roles.flatMap((role) => [role.launcher.path, role.parser.path])) {
  const result = spawnSync("/usr/bin/codesign", ["-dv", "--verbose=4", join(artifactDir, path)], {
    encoding: "utf8",
  });
  if (
    result.status !== 0 ||
    !`${result.stdout}${result.stderr}`.includes("TeamIdentifier=not set")
  ) {
    throw new Error(`${path}: expected identity-free linker signature`);
  }
}
