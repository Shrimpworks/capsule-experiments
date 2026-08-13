import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidence = join(root, "evidence", "2026-08-12");
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const check = (condition, message) => { if (!condition) throw new Error(message); };
const expect = (path, bytes, digest) => {
  check(statSync(path).size === bytes, `size mismatch: ${relative(root, path)}`);
  check(sha256(path) === digest, `digest mismatch: ${relative(root, path)}`);
};
const json = (path) => JSON.parse(readFileSync(path, "utf8"));

const expected = {
  source: [32352414, "7073152cccd4df42d5081ecec5c8ab36f8d6914039faa806060656d55a9e4cf3"],
  lock: [45815, "4dd8f08c8b223adbf3468fce5fe9e0468dfe9f4a255129cc304cb604fa0d389d"],
  vendor: [70134953, "1e96e49a516e4cf6a9ec79acae9a9eb3d0ee52b332695fa11476a97e1e50d1d4"],
  bundle: [20981992, "ad908b8289c86f25c3413713fa3e60c4c8bb91fec0d52763e870d7a186865ee6"],
  binary: [68496520, "e781a90236cdf1272a9a16189c6be033164fa25a5aa9e52376ef998982ec0a77"],
  snapshot: [699988, "4e8965217d5a6675a880326eee6f690bbeec7e7cb243decf2f3e9f453a871a2c"],
};
expect(join(root, "inputs", "Shrimpworks-deno-29b71f06c2df-source.tar.gz"), ...expected.source);
expect(join(root, "inputs", "Cargo.lock"), ...expected.lock);
expect(join(root, "inputs", "cargo-source-bundle.tar.gz"), ...expected.vendor);
const bundle = join(root, "artifacts", "capsule-deno-core-c2b-runtime-bundle.tar.gz");
expect(bundle, ...expected.bundle);
check(sha256(join(root, "scripts", "build-runtime-static-only.sh")) ===
  "02a3480054a355f6225dc2db04e7b429c2aaf66ecaad46c8839934dedc755a2a",
"static-only script mismatch");

const result = json(join(evidence, "result.json"));
check(result.decision === "PASSED-EXACT-NETWORK-DISABLED-STATIC-REPRODUCTION",
  "result decision mismatch");
check(result.cargoPackages.registry === 189 && result.cargoPackages.path === 4 &&
  result.cargoPackages.otherSources === 0 && result.cargoPackages.checksumClosure === 189,
"Cargo closure mismatch");
check(result.builds.byteEqual === true && result.builds.networkMode === "none",
  "build comparison mismatch");
check(Object.values(result.execution).every((value) => value === "NOT_RUN") &&
  result.runtimeAdmission === false && result.completeC5bComposition === "BLOCKED",
"execution/admission boundary mismatch");

for (const name of ["acquisition-a.log", "acquisition-b.log"]) {
  const log = readFileSync(join(evidence, name), "utf8");
  check(log.includes("cargoRegistrySourcePackages=189") &&
    log.includes(`cargoSourceBundle.size=${expected.vendor[0]}`) &&
    log.includes(`cargoSourceBundle.sha256=${expected.vendor[1]}`),
  `${name} closure receipt mismatch`);
}
for (const name of ["build-a.log", "build-b.log"]) {
  const log = readFileSync(join(evidence, name), "utf8");
  check(log.includes("Finished `release` profile") &&
    log.includes(`binary.sha256=${expected.binary[1]}`) &&
    log.includes(`snapshot.sha256=${expected.snapshot[1]}`) &&
    log.includes(`bundle.sha256=${expected.bundle[1]}`), `${name} result mismatch`);
  check(!/^\s*Running /m.test(log), `${name} records candidate execution`);
}
const boundary = readFileSync(join(evidence, "build-boundary.txt"), "utf8");
for (const row of [
  "networkMode=none", "candidateExecution=NOT_RUN", "mutationExecution=NOT_RUN",
  "guestExecution=NOT_RUN", "runtimeAdmission=false",
]) check(boundary.includes(`${row}\n`), `missing boundary row: ${row}`);
check(readFileSync(join(evidence, "final-link-symbols.txt"), "utf8") ===
  "deno_core::ops_builtin_v8::op_get_ext_import_meta_proto\n" +
  "deno_core::ops_builtin_v8::op_get_extras_binding_object\n" +
  "deno_core::ops_builtin_v8::op_set_captured_bootstrap\n", "link surface mismatch");
const elf = readFileSync(join(evidence, "elf-proof.txt"), "utf8");
for (const row of [
  "Class:                             ELF64",
  "Data:                              2's complement, little endian",
  "Type:                              DYN (Position-Independent Executable file)",
  "Machine:                           AArch64",
]) check(elf.includes(row), `ELF identity mismatch: ${row}`);
const needed = [...elf.matchAll(/\(NEEDED\).*\[([^\]]+)\]/g)].map((item) => item[1]).sort();
check(JSON.stringify(needed) === JSON.stringify([
  "ld-linux-aarch64.so.1", "libc.so.6", "libgcc_s.so.1", "libm.so.6",
]), "ELF NEEDED surface mismatch");
check(!elf.includes("(RPATH)") && !elf.includes("(RUNPATH)"), "ELF path override present");
const sbom = json(join(evidence, "sbom.cdx.json"));
check(sbom.bomFormat === "CycloneDX" && sbom.components.length === 193,
  "SBOM closure mismatch");
const sourceNotice = json(join(evidence, "source-notice-closure.json"));
check(sourceNotice.result === "closed-for-declared-runtime-candidate-materials" &&
  sourceNotice.engineeringInventoryNotLegalAdvice === true &&
  sourceNotice.deno.repository === "https://github.com/Shrimpworks/deno.git" &&
  sourceNotice.deno.commit === "29b71f06c2df5ab06721ccbb7bc744fb8104356e" &&
  sourceNotice.deno.tree === "172e57551fe5a6683f11c886a81f9634023a5514" &&
  sourceNotice.deno.sourceArchive.bytes === expected.source[0] &&
  sourceNotice.deno.sourceArchive.sha256 === expected.source[1] &&
  sourceNotice.cargo.lock.bytes === expected.lock[0] &&
  sourceNotice.cargo.lock.sha256 === expected.lock[1] &&
  sourceNotice.cargo.sourceBundle.bytes === expected.vendor[0] &&
  sourceNotice.cargo.sourceBundle.sha256 === expected.vendor[1] &&
  sourceNotice.cargo.registrySources === 189 &&
  sourceNotice.rustyV8.repository === "https://github.com/Shrimpworks/rusty_v8.git" &&
  sourceNotice.rustyV8.commit === "80e863ddb942a4aa2b384e794fc23e35b9d2bb15" &&
  sourceNotice.rustyV8.archiveSha256 ===
    "1ae209c9e4ba5803d010d2c79ee4cc0af0126c5a7ebcca211c7e41deaede4cd2" &&
  sourceNotice.rustyV8.bindingSha256 ===
    "8603f09ab95e79620ea29f73933c09ae3618c6f924472c0ce36d5c614d1ceba4" &&
  sourceNotice.unsigned === true && sourceNotice.published === false,
"source/notice closure mismatch");

const bindingPath = join(root, "inputs", "src_binding_simdutf_release_aarch64-unknown-linux-gnu.rs");
expect(bindingPath, 40369, "8603f09ab95e79620ea29f73933c09ae3618c6f924472c0ce36d5c614d1ceba4");
const release = json(join(root, "inputs", "release-manifest.json"));
check(release.sourceCommit === "80e863ddb942a4aa2b384e794fc23e35b9d2bb15" &&
  release.profile === "linux-arm64-release-simdutf-v1" && release.admitted === false &&
  release.published === false && release.unsigned === true &&
  release.files["librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz"].size === 37674703 &&
  release.files["librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz"].sha256 ===
    "1ae209c9e4ba5803d010d2c79ee4cc0af0126c5a7ebcca211c7e41deaede4cd2" &&
  release.files["src_binding_simdutf_release_aarch64-unknown-linux-gnu.rs"].size === 40369 &&
  release.files["src_binding_simdutf_release_aarch64-unknown-linux-gnu.rs"].sha256 ===
    "8603f09ab95e79620ea29f73933c09ae3618c6f924472c0ce36d5c614d1ceba4",
"rusty_v8 release manifest mismatch");
const artifactRows = readFileSync(join(root, "inputs", "artifact-sha256sums.txt"), "utf8")
  .trim().split("\n");
check(artifactRows.includes(
  "1ae209c9e4ba5803d010d2c79ee4cc0af0126c5a7ebcca211c7e41deaede4cd2  librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz") &&
  artifactRows.includes(
    "8603f09ab95e79620ea29f73933c09ae3618c6f924472c0ce36d5c614d1ceba4  src_binding_simdutf_release_aarch64-unknown-linux-gnu.rs"),
"rusty_v8 artifact checksum rows missing");

const comparison = json(join(evidence, "same-host-comparison.json"));
check(JSON.stringify(comparison) === JSON.stringify({
  decision: "all-declared-static-materials-byte-equal",
  normalizationApplied: false,
  independentAcquisitions: true,
  independentBuildRoots: true,
  artifacts: {
    cargoVendorBundle: { bytes: expected.vendor[0], sha256: expected.vendor[1], result: "byte-equal" },
    runtimeBinary: { bytes: expected.binary[0], sha256: expected.binary[1], result: "byte-equal" },
    snapshot: { bytes: expected.snapshot[0], sha256: expected.snapshot[1], result: "byte-equal" },
    runtimeBundle: { bytes: expected.bundle[0], sha256: expected.bundle[1], result: "byte-equal" },
  },
}), "same-host comparison mismatch");

const container = json(join(evidence, "container-boundary.json"));
check(JSON.stringify(container) === JSON.stringify({
  builder: {
    reference: "rust:1.95.0-bookworm@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1",
    imageId: "sha256:7cf1e580ef5539f03b58560753e8ab84c8c360960d99dff714004aa98f203977",
    os: "linux", architecture: "arm64",
  },
  acquisition: {
    connectedOnlyForLockedCargoSources: true, sharedCargoCache: false, sharedTargetCache: false,
  },
  decisiveBuild: {
    networkMode: "none", readOnlyRootFilesystem: true, capDrop: ["ALL"],
    noNewPrivileges: true, seccomp: "unconfined", memoryBytes: 10737418240,
    logicalCpus: 1, cpuSet: "0", sourceDateEpoch: "0", timezone: "UTC", locale: "C",
    compilerCache: "absent", candidateExecution: "NOT_RUN",
  },
}), "container boundary mismatch");

const provenance = json(join(evidence, "provenance.intoto.json"));
check(provenance._type === "https://in-toto.io/Statement/v1" &&
  provenance.predicateType === "https://slsa.dev/provenance/v1" &&
  JSON.stringify(provenance.subject) === JSON.stringify([{
    name: "capsule-deno-core-c2b-runtime-bundle.tar.gz",
    digest: { sha256: expected.bundle[1] },
  }]) &&
  provenance.predicate.runDetails.builder.id ===
    "rust:1.95.0-bookworm@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1" &&
  JSON.stringify(provenance.predicate.buildDefinition.resolvedDependencies) === JSON.stringify([
    { uri: "git+https://github.com/Shrimpworks/deno.git", digest: { gitCommit: "29b71f06c2df5ab06721ccbb7bc744fb8104356e" } },
    { uri: "pkg:cargo/vendor-bundle", digest: { sha256: expected.vendor[1] } },
    { uri: "pkg:generic/rusty_v8@150.2.0", digest: { sha256: "1ae209c9e4ba5803d010d2c79ee4cc0af0126c5a7ebcca211c7e41deaede4cd2" } },
  ]) && JSON.stringify(provenance.predicate.runDetails.byproducts) === JSON.stringify([
    { name: "candidateExecution", content: "NOT_RUN" },
    { name: "guestExecution", content: "NOT_RUN" },
  ]), "provenance mismatch");

const extracted = mkdtempSync(join(tmpdir(), "capsule-c5b6-verify."));
try {
  const members = execFileSync("tar", ["-tzf", bundle], { encoding: "utf8" })
    .trim().split("\n");
  check(JSON.stringify(members) === JSON.stringify([
    "bin/", "bin/capsule-deno-core-c2b-fixed-fixture", "share/",
    "share/capsule-deno-core/", "share/capsule-deno-core/capsule_core_snapshot.bin",
  ]), "unsafe or unexpected runtime bundle members");
  check(members.every((name) => !name.startsWith("/") &&
    !name.split("/").includes("..") && !name.includes("\\")), "unsafe runtime bundle path");
  execFileSync("tar", ["-xzf", bundle, "-C", extracted]);
  const binary = join(extracted, "bin", "capsule-deno-core-c2b-fixed-fixture");
  const snapshot = join(extracted, "share", "capsule-deno-core", "capsule_core_snapshot.bin");
  expect(binary, ...expected.binary);
  expect(snapshot, ...expected.snapshot);
  const paths = [];
  const walk = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) walk(path); else paths.push(relative(extracted, path));
    }
  };
  walk(extracted);
  check(JSON.stringify(paths) === JSON.stringify([
    "bin/capsule-deno-core-c2b-fixed-fixture",
    "share/capsule-deno-core/capsule_core_snapshot.bin",
  ]), "runtime bundle inventory mismatch");
} finally { rmSync(extracted, { recursive: true, force: true }); }

const manifestPath = join(root, "manifests", "archive-manifest.json");
const manifest = json(manifestPath);
const actual = [];
const walk = (directory) => {
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (path !== manifestPath) actual.push({
      path: relative(root, path), bytes: statSync(path).size, sha256: sha256(path),
    });
  }
};
walk(root);
check(manifest.closed === true && JSON.stringify(manifest.entries) === JSON.stringify(actual),
  "closed archive manifest mismatch");

console.log(`archive.entries=${actual.length}`);
console.log("cargo.registryPackages=189");
console.log("buildAandB=byte-equal");
console.log("candidateExecution=NOT_RUN");
console.log("decision=PASSED-EXACT-NETWORK-DISABLED-STATIC-REPRODUCTION");
