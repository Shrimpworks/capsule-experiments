#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv.length !== 6) {
  throw new Error("usage: generate-evidence.mjs BUILD_A BUILD_B VENDOR_ROOT OUTPUT_DIRECTORY");
}

const experiment = dirname(fileURLToPath(import.meta.url));
const physical = resolve(experiment, "../gate-c-deno-core-physical-omission");
const buildA = resolve(process.argv[2]);
const buildB = resolve(process.argv[3]);
const vendorRoot = resolve(process.argv[4]);
const output = resolve(process.argv[5]);
mkdirSync(output, { recursive: true });

const identities = {
  repositoryBaseline: "54489437f75465f6ed7b9ef4477bc5557bf5b923",
  denoCommit: "14eea3160ae5834476aa3b9d317b8d41d991b982",
  denoSource: "95f9d8361809f2d2f3ee2d8a6955951dcf96c2f4bbeb540c2d6fdd9363e6dc94",
  denoCoreCrate: "16b44f6f84139c39ec2f8d1b838412eb84ecaa9837103f7b12169896fd8778b4",
  v8Crate: "c7f4e905df70d6c00b95e69c5f0831fd5eb5889b0116ae2b30293578c19cd1bc",
  rustyV8Commit: "d305e6afa7736f6e298c30ae6646f7709ee9382b",
  rustyV8Archive: "8d91df74c8a671c23f880e64038023f49e07ca85c96e15d76a87e2aac9b20595",
  cargoSourceBundle: "912ee37b7735efc7412abf9a34c66ecf970fc8335f14d6b21202a0c7964df58c",
  builder:
    "rust:1.95.0-bookworm@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1",
  builderPlatformImage: "sha256:7cf1e580ef5539f03b58560753e8ab84c8c360960d99dff714004aa98f203977",
  binary: "597baba6b9f50fc619ce667a352e19686f8c73efc6819d137b3c4081450fd6f5",
  snapshot: "ef5f1e7883bbf62a6422957ff0eea51a06d4b35cad1f47dc9c9ae137ab8dfa0b",
  bundle: "da8f755832a6fceba37078c58cc67c4136bc823acc75fe377ec4c1b98a8ef498",
};

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeJson(name, value) {
  writeFileSync(join(output, name), `${JSON.stringify(value, null, 2)}\n`);
}

function field(block, name) {
  return block.match(new RegExp(`^${name} = "([^"]+)"`, "m"))?.[1] ?? null;
}

function parseLock(path) {
  return readFileSync(path, "utf8")
    .split("[[package]]")
    .slice(1)
    .map((block) => {
      const dependencyBody = block.match(/dependencies = \[([\s\S]*?)\n\]/)?.[1] ?? "";
      return {
        name: field(block, "name"),
        version: field(block, "version"),
        source: field(block, "source"),
        checksum: field(block, "checksum"),
        dependencySpecs: [...dependencyBody.matchAll(/"([^"]+)"/g)].map((match) => match[1]),
      };
    });
}

function purl(pkg) {
  return pkg.source
    ? `pkg:cargo/${encodeURIComponent(pkg.name)}@${encodeURIComponent(pkg.version)}`
    : `pkg:generic/capsule/${encodeURIComponent(pkg.name)}@${encodeURIComponent(pkg.version)}`;
}

function dependencyTarget(spec, packages) {
  const withoutSource = spec.replace(/ \([^)]*\)$/, "");
  const [name, maybeVersion] = withoutSource.split(" ");
  const candidates = packages.filter((pkg) => pkg.name === name);
  if (maybeVersion) {
    return candidates.find((pkg) => pkg.version === maybeVersion) ?? null;
  }
  return candidates.length === 1 ? candidates[0] : null;
}

function declaredLicense(cargoToml) {
  return readFileSync(cargoToml, "utf8").match(/^license = "([^"]+)"/m)?.[1] ?? null;
}

function sourceRepository(cargoToml) {
  return readFileSync(cargoToml, "utf8").match(/^repository = "([^"]+)"/m)?.[1] ?? null;
}

function licenseFiles(directory) {
  return readdirSync(directory)
    .filter((name) => /^(license|copying|notice)/i.test(name))
    .filter((name) => statSync(join(directory, name)).isFile())
    .sort()
    .map((name) => ({ path: name, sha256: sha256(join(directory, name)) }));
}

const lockPath = join(physical, "probe/Cargo.lock");
const packages = parseLock(lockPath);
const registryPackages = packages.filter((pkg) => pkg.source?.startsWith("registry+"));
if (packages.length !== 193 || registryPackages.length !== 191) {
  throw new Error(`unexpected Cargo graph: ${packages.length}/${registryPackages.length}`);
}

const crateInventory = registryPackages
  .map((pkg) => {
    const directory = join(vendorRoot, `${pkg.name}-${pkg.version}`);
    const checksum = JSON.parse(
      readFileSync(join(directory, ".cargo-checksum.json"), "utf8"),
    ).package;
    if (checksum !== pkg.checksum) {
      throw new Error(`crate checksum mismatch: ${pkg.name} ${pkg.version}`);
    }
    const expression = declaredLicense(join(directory, "Cargo.toml"));
    if (!expression) throw new Error(`missing declared license: ${pkg.name} ${pkg.version}`);
    return {
      name: pkg.name,
      version: pkg.version,
      cratesIoSha256: checksum,
      source: `https://crates.io/api/v1/crates/${pkg.name}/${pkg.version}/download`,
      repository: sourceRepository(join(directory, "Cargo.toml")),
      licenseExpression: expression,
      licenseFiles: licenseFiles(directory),
    };
  })
  .sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
  );

const patchQueue = [
  {
    order: 1,
    path: "patches/0001-physically-allowlist-bootstrap-ops.patch",
    sha256: sha256(join(physical, "patches/0001-physically-allowlist-bootstrap-ops.patch")),
    purpose: "physically reduce the sole built-in op registry to three reviewed bootstrap ops",
  },
  {
    order: 2,
    path: "patches/0002-canonicalize-snapshot-module-order.patch",
    sha256: sha256(join(physical, "patches/0002-canonicalize-snapshot-module-order.patch")),
    purpose: "sort the existing snapshot sidecar module-name vector before serialization",
  },
];

const mutation = {
  path: "patches/mutations/restore-op-print.patch",
  sha256: sha256(join(physical, "patches/mutations/restore-op-print.patch")),
  expectedEffect: "four-op binary rejected by the exact runtime registry assertion",
};

const fixtureNames = [
  "deno-core-seal.js",
  "dynamic-import.js",
  "input.json",
  "nominal.js",
  "nominal.ts",
  "refused-input.json",
  "refused-source.js",
  "static-import.js",
];
const fixtures = fixtureNames.map((name) => ({
  path: `fixtures/${name}`,
  sha256: sha256(join(physical, "fixtures", name)),
  size: statSync(join(physical, "fixtures", name)).size,
}));

const artifactPaths = {
  binary: "bundle/bin/capsule-deno-core-physical-omission",
  snapshot: "bundle/share/capsule-deno-core/capsule_core_snapshot.bin",
  archive: "capsule-deno-core-runtime-bundle.tar.gz",
};
const artifacts = Object.fromEntries(
  Object.entries(artifactPaths).map(([name, path]) => {
    const first = join(buildA, path);
    const second = join(buildB, path);
    const firstHash = sha256(first);
    const secondHash = sha256(second);
    if (firstHash !== secondHash) throw new Error(`A/B mismatch: ${name}`);
    return [name, { path, size: statSync(first).size, sha256: firstHash }];
  }),
);
if (
  artifacts.binary.sha256 !== identities.binary ||
  artifacts.snapshot.sha256 !== identities.snapshot ||
  artifacts.archive.sha256 !== identities.bundle
) {
  throw new Error("declared output identity mismatch");
}

const sourceInventory = {
  schema: "capsule.deno-core-source-inventory.v0",
  status: "complete-for-declared-cargo-build-inputs; v8-publication-notice-closure-blocked",
  generated: "2026-08-02",
  target: "aarch64-unknown-linux-gnu",
  inputs: [
    {
      name: "Deno source",
      version: "2.9.4",
      commit: identities.denoCommit,
      url: "https://github.com/denoland/deno/releases/download/v2.9.4/deno_src.tar.gz",
      size: 34010635,
      sha256: identities.denoSource,
      role: "upstream review cross-check",
    },
    {
      name: "deno_core crate",
      version: "0.409.0",
      url: "https://crates.io/api/v1/crates/deno_core/0.409.0/download",
      size: 510610,
      sha256: identities.denoCoreCrate,
      role: "patched build source",
    },
    {
      name: "rusty_v8 Linux arm64 archive",
      version: "150.2.0",
      commit: identities.rustyV8Commit,
      url: "https://github.com/denoland/rusty_v8/releases/download/v150.2.0/librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz",
      size: 37576362,
      sha256: identities.rustyV8Archive,
      role: "prebuilt static V8 input",
    },
    {
      name: "Cargo source bundle",
      version: "Cargo.lock a039052a",
      size: 70283110,
      sha256: identities.cargoSourceBundle,
      packageCount: crateInventory.length,
      role: "complete normalized locked registry source set",
    },
  ],
  cargoLock: {
    path: "probe/Cargo.lock",
    sha256: sha256(lockPath),
    packages: packages.length,
    registryPackages: registryPackages.length,
    pathPackages: packages.length - registryPackages.length,
  },
  patchQueue,
  mutation,
  crates: crateInventory,
};
writeJson("source-bundle-inventory.json", sourceInventory);

const licenseInventory = {
  schema: "capsule.deno-core-license-source-publication.v0",
  engineeringInventoryNotLegalAdvice: true,
  status: "blocked",
  cargo: {
    components: crateInventory.length,
    componentsWithDeclaredLicense: crateInventory.filter((item) => item.licenseExpression).length,
    componentsWithRootLicenseOrNoticeFile: crateInventory.filter(
      (item) => item.licenseFiles.length > 0,
    ).length,
    inventory: crateInventory.map(({ name, version, licenseExpression, licenseFiles }) => ({
      name,
      version,
      licenseExpression,
      licenseFiles,
    })),
  },
  upstream: [
    {
      component: "deno_core 0.409.0",
      licenseExpression: "MIT",
      publication: "publish exact original crate, ordered Capsule patches, and patched source tree",
      status: "specified",
    },
    {
      component: "rusty_v8 / V8 150.2.0 prebuilt archive",
      licenseExpression: "MIT plus transitive V8 third-party terms",
      publication:
        "publish rusty_v8 commit d305e6a, exact V8/dependency revisions used for the archive, and complete generated third-party notices",
      status: "blocked",
      blocker:
        "the v8 150.2.0 crate deliberately excludes LICENSE* and the official prebuilt archive has no retained complete source/notice manifest",
    },
    {
      component: "Rust 1.95.0 Bookworm builder/runtime root",
      licenseExpression: "multiple",
      publication:
        "bind the official OCI digest and provide the corresponding Rust and Debian source/license publication set for any distributed root",
      status: "not-bundled; exact-root-dependency-declared",
    },
  ],
  decision:
    "Do not publish or admit the candidate until the rusty_v8/V8 source and notice blocker is closed and reviewed.",
};
writeJson("license-and-source.json", licenseInventory);

const cargoComponents = packages.map((pkg) => {
  const component = {
    type: pkg.name === "capsule-deno-core-physical-omission" ? "application" : "library",
    "bom-ref": purl(pkg),
    name: pkg.name,
    version: pkg.version,
    purl: purl(pkg),
    properties: [
      {
        name: "capsule:source-role",
        value: pkg.source ? "locked-registry-source" : "repository-or-patched-path-source",
      },
    ],
  };
  if (pkg.checksum) component.hashes = [{ alg: "SHA-256", content: pkg.checksum }];
  if (pkg.source) {
    const item = crateInventory.find(
      (candidate) => candidate.name === pkg.name && candidate.version === pkg.version,
    );
    component.licenses = [{ expression: item.licenseExpression }];
    if (item.repository) component.externalReferences = [{ type: "vcs", url: item.repository }];
  } else if (pkg.name === "deno_core") {
    component.licenses = [{ expression: "MIT" }];
    component.hashes = [{ alg: "SHA-256", content: identities.denoCoreCrate }];
  }
  return component;
});

const bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  version: 1,
  metadata: {
    component: {
      type: "application",
      "bom-ref": "capsule-deno-core-runtime-bundle",
      name: "Capsule governed deno_core candidate bundle",
      version: "0.409.0-capsule-experiment",
      hashes: [{ alg: "SHA-256", content: identities.bundle }],
    },
    properties: [
      { name: "capsule:artifact-kind", value: "complete declared candidate-bundle SBOM" },
      { name: "capsule:admission", value: "none" },
      { name: "capsule:runtime-001", value: "unsupported" },
      { name: "capsule:cargo-lock-package-count", value: String(packages.length) },
      { name: "capsule:cargo-source-bundle-package-count", value: String(crateInventory.length) },
      { name: "capsule:license-closure", value: "blocked-v8-third-party-notices" },
    ],
  },
  components: [
    ...cargoComponents,
    {
      type: "framework",
      "bom-ref": "pkg:generic/rusty_v8@150.2.0?arch=aarch64&os=linux",
      name: "rusty_v8 prebuilt archive",
      version: "150.2.0",
      hashes: [{ alg: "SHA-256", content: identities.rustyV8Archive }],
      licenses: [{ expression: "MIT" }],
      properties: [
        { name: "capsule:source-commit", value: identities.rustyV8Commit },
        { name: "capsule:notice-closure", value: "blocked" },
      ],
    },
    {
      type: "container",
      "bom-ref":
        "pkg:oci/rust@1.95.0-bookworm?repository_digest=sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1",
      name: "Rust Bookworm builder and declared runtime root",
      version: "1.95.0-bookworm",
      hashes: [
        {
          alg: "SHA-256",
          content: "6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1",
        },
      ],
    },
  ],
  dependencies: packages.map((pkg) => ({
    ref: purl(pkg),
    dependsOn: pkg.dependencySpecs
      .map((spec) => dependencyTarget(spec, packages))
      .filter(Boolean)
      .map(purl)
      .sort(),
  })),
  compositions: [
    {
      aggregate: "incomplete",
      assemblies: ["capsule-deno-core-runtime-bundle"],
      dependencies: [
        "pkg:generic/rusty_v8@150.2.0?arch=aarch64&os=linux",
        "pkg:oci/rust@1.95.0-bookworm?repository_digest=sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1",
      ],
    },
  ],
};
bom.dependencies.unshift({
  ref: "capsule-deno-core-runtime-bundle",
  dependsOn: [
    "pkg:generic/capsule/capsule-deno-core-physical-omission@0.0.0",
    "pkg:generic/rusty_v8@150.2.0?arch=aarch64&os=linux",
    "pkg:oci/rust@1.95.0-bookworm?repository_digest=sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1",
  ],
});
writeJson("sbom.cdx.json", bom);

const bundleManifest = {
  schema: "capsule.runtime-bundle-candidate.v0",
  status: "experiment-only; not admitted; not signed",
  name: "governed-deno-core-0.409.0-linux-arm64",
  architecture: "aarch64",
  operatingSystem: "linux",
  repositoryBaseline: identities.repositoryBaseline,
  files: [
    { mode: "0755", ...artifacts.binary },
    { mode: "0644", ...artifacts.snapshot },
  ],
  archive: artifacts.archive,
  snapshot: {
    embeddedInBinary: true,
    separateCopyPurpose: "review and byte-verification evidence",
    priorSnapshot: null,
    extensions: [],
    extensionTranspiler: null,
    runtimeCallback: null,
  },
  wrapper: {
    cargoTomlSha256: sha256(join(physical, "probe/Cargo.toml")),
    cargoLockSha256: sha256(lockPath),
    buildRsSha256: sha256(join(physical, "probe/build.rs")),
    mainRsSha256: sha256(join(physical, "probe/src/main.rs")),
    fixtureAllowlist: fixtures,
    arbitraryInput: false,
  },
  construction: {
    denoCore: "0.409.0",
    defaultFeatures: false,
    features: ["reactor-tokio", "v8_use_custom_libcxx"],
    patchQueue,
    builtinOps: [
      "op_get_ext_import_meta_proto",
      "op_get_extras_binding_object",
      "op_set_captured_bootstrap",
    ],
    extensions: [],
    moduleLoader: null,
    inspector: false,
    v8Flags: ["--jitless", "--random-seed=42"],
  },
  builder: {
    image: identities.builder,
    platformImageId: identities.builderPlatformImage,
    dockerfileSha256: sha256(join(experiment, "builder/Dockerfile")),
    cargoConfigSha256: sha256(join(experiment, "cargo-config.toml")),
    checkInputsScriptSha256: sha256(join(experiment, "scripts/check-inputs.sh")),
    sourceAcquisitionScriptSha256: sha256(
      join(experiment, "scripts/acquire-cargo-source-bundle.sh"),
    ),
    buildTwiceScriptSha256: sha256(join(experiment, "scripts/build-twice.sh")),
    aptOrPackageManagerDuringBuild: false,
    networkDuringRetainedBuild: false,
    rustc: "1.95.0 (59807616e1fa2540724bfbac14d7976d7e4a3860)",
    cargo: "1.95.0 (f2d3ce0bd 2026-03-21)",
    llvm: "22.1.2",
    binutils: "2.40-2",
    gcc: "12.2.0-3",
    glibc: "2.36-9+deb12u14",
    environment: {
      CARGO_HOME: "/cargo-home",
      CARGO_NET_OFFLINE: "true",
      CARGO_TARGET_DIR: "/target",
      RUSTY_V8_ARCHIVE: "/inputs/rusty-v8.a.gz",
      SOURCE_DATE_EPOCH: "0",
      TZ: "UTC",
      LC_ALL: "C",
      LANG: "C",
      TMPDIR: "/target/tmp",
    },
    fixedPaths: ["/workspace", "/cargo-home", "/target"],
    command: "/usr/bin/setarch aarch64 -R cargo build --locked --offline --release -j1",
    buildOnlySecurityException:
      "seccomp=unconfined permits personality(2) for setarch -R; network remains none, root read-only, capabilities dropped, no-new-privileges set",
  },
  dynamicRuntimeRoot: {
    standalone: false,
    exactRoot: identities.builder,
    elfInterpreter: "/lib/ld-linux-aarch64.so.1",
    needed: ["ld-linux-aarch64.so.1", "libc.so.6", "libgcc_s.so.1", "libm.so.6"],
    limitation:
      "the two-file archive binds but does not embed its dynamic Linux root; a later runtime-selection ADR must define the complete runtime root",
  },
  evidence: {
    sbom: "sbom.cdx.json",
    provenance: "provenance.intoto.json",
    sourceInventory: "source-bundle-inventory.json",
    licenseInventory: "license-and-source.json",
    reproducibility: "reproducibility.json",
  },
  admission: {
    runtimeSelected: false,
    runtime001: "unsupported",
    signing: "not performed",
    backendOrGuest: "not exercised",
  },
};
writeJson("runtime-bundle-manifest.json", bundleManifest);

const provenance = {
  _type: "https://in-toto.io/Statement/v1",
  subject: Object.values(artifacts).map((artifact) => ({
    name: artifact.path,
    digest: { sha256: artifact.sha256 },
  })),
  predicateType: "https://slsa.dev/provenance/v1",
  predicate: {
    buildDefinition: {
      buildType: "https://capsule.local/experiments/deno-core-reproducible-package/v0",
      externalParameters: {
        target: "aarch64-unknown-linux-gnu",
        patchOrder: patchQueue.map((patch) => patch.path),
        cargo: "--locked --offline --release -j1",
        v8Flags: ["--jitless", "--random-seed=42"],
      },
      internalParameters: {
        sourceDateEpoch: 0,
        locale: "C",
        timezone: "UTC",
        aslr: "disabled for compiler process with setarch aarch64 -R",
        fixedPaths: ["/workspace", "/cargo-home", "/target"],
      },
      resolvedDependencies: [
        { uri: "pkg:github/denoland/deno@v2.9.4", digest: { sha256: identities.denoSource } },
        { uri: "pkg:cargo/deno_core@0.409.0", digest: { sha256: identities.denoCoreCrate } },
        { uri: "pkg:cargo/v8@150.2.0", digest: { sha256: identities.v8Crate } },
        {
          uri: "pkg:generic/rusty_v8@150.2.0?arch=aarch64&os=linux",
          digest: { sha256: identities.rustyV8Archive },
        },
        {
          uri: "file:cargo-source-bundle.tar.gz",
          digest: { sha256: identities.cargoSourceBundle },
        },
        ...patchQueue.map((patch) => ({
          uri: `file:${patch.path}`,
          digest: { sha256: patch.sha256 },
        })),
      ],
    },
    runDetails: {
      builder: {
        id: "pkg:oci/rust@1.95.0-bookworm?repository_digest=sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1",
      },
      metadata: {
        invocationId: "capsule-deno-core-repro-2026-08-02-same-host-a-b",
      },
      byproducts: [
        {
          name: "build-a/bundle-manifest.txt",
          digest: { sha256: sha256(join(buildA, "bundle-manifest.txt")) },
        },
        {
          name: "build-b/bundle-manifest.txt",
          digest: { sha256: sha256(join(buildB, "bundle-manifest.txt")) },
        },
      ],
      limitations: [
        "unsigned experiment-generated statement",
        "same Docker Desktop host and LinuxKit kernel for both clean containers",
        "no independently controlled second builder or host was available",
        "V8 third-party source and notice closure remains incomplete",
      ],
    },
  },
};
writeJson("provenance.intoto.json", provenance);

writeJson("reproducibility.json", {
  schema: "capsule.deno-core-reproducibility.v0",
  level: "same-host-independent-clean-containers",
  result: "all-declared-package-bytes-equal",
  builder: identities.builder,
  buildA: artifacts,
  buildB: artifacts,
  completeComparison: [
    "bundle-manifest.txt cmp",
    "binary cmp",
    "snapshot cmp",
    "normalized archive cmp",
  ],
  nondeterminism: [
    {
      observation: "PR #43 ordinary snapshot builds differed",
      reviewedControl: "patch 0002 sorts the existing module-name sidecar vector",
      outputRewrite: false,
    },
    {
      observation:
        "initial package replay at /build/workspace produced equal but different binary adf3e5ae and snapshot 37c4b280",
      reviewedControl:
        "declare and reuse the original in-container /workspace, /cargo-home, and /target prefixes",
      outputRewrite: false,
    },
    {
      observation: "ASLR perturbs V8 snapshot bytes",
      reviewedControl: "setarch aarch64 -R for Cargo and descendants",
      outputRewrite: false,
    },
  ],
  independentBuilderBlocker:
    "only one owned Apple M1 Max / Docker Desktop LinuxKit host and one exact Linux/arm64 OCI implementation were available in scope",
});

writeJson("admission-checklist.json", {
  schema: "capsule.deno-core-package-admission-checklist.v0",
  decision: "no-go-for-runtime-selection-adr",
  admissionEffect: "none; RUNTIME-001 remains unsupported",
  checks: [
    { id: "immutable-inputs", status: "pass" },
    { id: "digest-pinned-no-apt-builder", status: "pass" },
    { id: "locked-offline-cargo-source-bundle", status: "pass" },
    { id: "clean-build-a", status: "pass" },
    { id: "clean-build-b", status: "pass" },
    { id: "complete-declared-bundle-byte-equality", status: "pass" },
    { id: "physical-three-op-registry-and-link-proof", status: "pass" },
    { id: "fixed-restoration-mutations", status: "pass" },
    {
      id: "independent-builder-provenance",
      status: "blocked",
      reason: "no second independently controlled Linux/arm64 builder or host available",
    },
    {
      id: "v8-source-license-notice-closure",
      status: "fail",
      reason:
        "official v8 crate excludes LICENSE* and no complete archive-corresponding notice manifest is retained",
    },
    {
      id: "standalone-runtime-root",
      status: "fail",
      reason:
        "candidate archive depends on the exact declared Bookworm root and four dynamic ELF subjects",
    },
    {
      id: "typescript-approved-byte-pipeline",
      status: "out-of-scope-blocker",
      reason:
        "deno_core candidate remains JavaScript-only and no schema/object-model change is authorized",
    },
  ],
});

console.log(`wrote evidence to ${output}`);
console.log(`cargoPackages=${packages.length}`);
console.log(`registrySources=${crateInventory.length}`);
console.log(`bundle=${artifacts.archive.sha256}`);
