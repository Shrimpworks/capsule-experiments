#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const refuse = (condition, message) => { if (!condition) throw new Error(message); };
const json = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const expectedInputs = new Map([
  ["inputs/c5b2/libkrun.h", [54658, "dce44d1d70ab770b1089e57646e025281a4137fe5052b9dd8eaefb80c01a1bd8"]],
  ["inputs/c5b2/macho-inspection.json", [3192, "e86810b067d7eb04d91e4a1a99eeda908891dba2970cb3aa1e68f202fe512b28"]],
  ["inputs/c5b3/controller-contract.json", [4185, "36285d7fa3f27a992fda413afb38c1ed05a3af30f496c5784b2165d5b2f90e59"]],
  ["inputs/c5b3/controller_core.h", [4413, "0ae153a47d5a2d0cdfbae7e149139b72abbd35f7f1223dd5745f03df86cadd12"]],
  ["inputs/c5b3/controller_core.c", [9837, "e382b0c3ca15dfcd0fb1b4dd5dcfec8336606fa907191518acfc6d849450a1d7"]],
  ["inputs/c5b4/recovery.json", [5786, "814eef24d1583b49ecf773043d142b6c7d77fb00a304dc964be7360b427b9cb4"]],
  ["inputs/c5b4/macho-inspection.json", [521, "5389836bb8a99a4159c54a6634bf33152f52969d4200ed51b965d7da616a0c7f"]],
  ["inputs/c5b5/effect-adapter-contract.json", [3331, "396d7e4d0d4ded1d072aac0040609c2cff39624dc56012896dc8663e0766f6f7"]],
  ["inputs/c5b5/adapter-profile.json", [4355, "5e8341952eeb78d44ceaa9002ab6906b33a125f3fa54cfb48bdf7f13020474e2"]],
  ["inputs/c5b5/archive-manifest.json", [4931, "a3c550e9e51217eb1b16223f9294b8b5d8020dc436dbc53f05b89bdac652b06c"]],
  ["inputs/c5b5/effect-adapter.o", [6968, "852234b318772651d1e4feda6c016dbaa860c061be4db4b160c6c91f573abd0b"]],
  ["inputs/c5b5/source/effect_adapter.h", [3298, "7b069517faa62ae052fc9c3ec0ec098b4f3ce58f35e5a5f377fc9433e7c0bb93"]],
  ["inputs/c5b5/source/effect_adapter.c", [10730, "d3c7a234d9ea03d317dfd8766307be48bb581b2559cdb145884dedc89c12fac2"]],
]);
for (const [path, [bytes, digest]] of expectedInputs) {
  const value = await readFile(join(root, path));
  refuse(value.length === bytes && sha256(value) === digest, `${path}: immutable input mismatch`);
}

const contract = await json("contracts/effect-implementation-contract.json");
refuse(contract.objectType === "capsule.c5b7.real-effect-implementation-contract" && contract.objectVersion === 1, "contract identity");
refuse(contract.scope === "compile-only-closed-effect-executor" && contract.authorityOwner === "Execution Supervisor", "contract scope/authority");
refuse(contract.effectBoundary.invokesClosedEffects === true && contract.effectBoundary.executionAuthorized === false && contract.effectBoundary.entryPointPresent === false && contract.effectBoundary.linked === false && contract.effectBoundary.loaded === false, "closed effect boundary");
refuse(contract.immutableProfile.rootBytes === 134217728 && contract.nonComposability.c5b7RootBytes === 100663296 && contract.nonComposability.compositeStatus === "BLOCKED", "C5b5 root size / C5b7 non-composability");
refuse(contract.fixedStrings.rootDevice === "/dev/vda" && contract.fixedStrings.executable === "/usr/local/libexec/capsule-init.krun", "fixed strings");
refuse(contract.fixedDescriptors.root === 4 && contract.fixedDescriptors.source === 5 && contract.fixedDescriptors.input === 6 && contract.fixedDescriptors.completion === 7, "fixed descriptors");
refuse(contract.contextPolicy.createResultIsContext && contract.contextPolicy.freeAttemptedOnPreEnterFailure && contract.contextPolicy.freeResultRetained && contract.contextPolicy.freeAttemptedAtMostOnce && contract.contextPolicy.enterConsumesContext, "context policy");
refuse(contract.requestOrdering.authority === "exact-C5b3-controller-step-sequence" && contract.requestOrdering.executorLocalCrossCallMemory === false && JSON.stringify(contract.requestOrdering.acceptedSeparateCallSequences) === JSON.stringify([["REQUEST_TEARDOWN", "PROVE_ABSENCE", "REMOVE_FIXED_ROOT"], ["REQUEST_DURABLE_COMMIT", "DELIVER_STORED"]]), "request order");

const profile = await json("manifests/effect-implementation-profile.json");
refuse(profile.scopedImplementationStatus === "PASSED" && profile.completeCompositeStatus === "BLOCKED" && profile.controlledExecutionStatus === "BLOCKED" && profile.productAdmission === "BLOCKED", "status boundary");
refuse(profile.productionObject.format === "Mach-O arm64 MH_OBJECT" && profile.productionObject.buildA.sha256 === profile.productionObject.buildB.sha256 && profile.productionObject.entryPoint === false && profile.productionObject.loaded === false, "production object profile");
refuse(profile.testDouble.realLibkrunResolved === false && profile.testDouble.realLibkrunLoaded === false, "test-double boundary");
const testMatrix = await json("fixtures/test-matrix.json");
const testResults = await json("evidence/2026-08-13/test-double-results.json");
refuse(testMatrix.status === "PASSED" && testResults.status === "PASSED" && testMatrix.cases.length === testResults.cases && testResults.realControllerSeparateStepIntegration === true, "test coverage count/integration");
refuse(Object.values(profile.effects).every((value) => value === false), "unexpected effect claim");

const objectA = await readFile(join(root, "dist/effect-implementation-a.o"));
const objectB = await readFile(join(root, "dist/effect-implementation-b.o"));
refuse(objectA.equals(objectB), "production A/B object identity");
refuse(objectA.length === profile.productionObject.buildA.bytes && sha256(objectA) === profile.productionObject.buildA.sha256, "production object digest");

const run = (command, args) => {
  const value = spawnSync(command, args, { encoding: "utf8" });
  refuse(value.status === 0, `${command} failed: ${value.stderr}`);
  return value.stdout;
};
const header = run("otool", ["-hv", join(root, "dist/effect-implementation-a.o")]);
refuse(header.includes("ARM64") && header.includes("OBJECT"), "not arm64 MH_OBJECT");
const loads = run("otool", ["-l", join(root, "dist/effect-implementation-a.o")]);
for (const forbidden of ["LC_LOAD_DYLIB", "LC_LOAD_WEAK_DYLIB", "LC_MAIN", "LC_UNIXTHREAD", "LC_ID_DYLIB", "LC_RPATH"]) refuse(!loads.includes(forbidden), `forbidden load command ${forbidden}`);
const globalSymbols = run("nm", ["-g", join(root, "dist/effect-implementation-a.o")]);
const exports = globalSymbols.split("\n").filter((line) => / T _/.test(line)).map((line) => line.trim().split(/\s+/).at(-1)).sort();
refuse(JSON.stringify(exports) === JSON.stringify(["_c5b7_execute_controller_actions", "_c5b7_validate_execution_inputs"]), "exact export closure");
const imports = globalSymbols.split("\n").filter((line) => line.trim().startsWith("U ")).map((line) => line.trim().slice(2)).sort();
const expectedImports = [
  "_c5b5_translate_controller_actions", "_c5b5_validate_immutable_profile", "_close",
  "_krun_add_console_port_inout", "_krun_add_read_only_raw_root_fd", "_krun_add_virtio_console_multiport",
  "_krun_create_ctx", "_krun_disable_implicit_console", "_krun_disable_implicit_init",
  "_krun_disable_implicit_vsock", "_krun_free_ctx", "_krun_set_exec", "_krun_set_kernel_console",
  "_krun_set_root_disk_remount", "_krun_set_vm_config", "_krun_set_workdir", "_krun_start_enter",
  "_read", "_write",
].sort();
refuse(JSON.stringify(imports) === JSON.stringify(expectedImports), "exact undefined import closure");
const strings = run("strings", [join(root, "dist/effect-implementation-a.o")]);
for (const fixed of ["/dev/vda", "ext4", "ro,nosuid,nodev", "capsule.source", "capsule.input", "capsule.completion", "hvc0", "/usr/local/libexec/capsule-init.krun"]) refuse(strings.includes(fixed), `missing fixed string ${fixed}`);
for (const forbidden of ["dlopen", "dlsym", "getenv", "posix_spawn", "execve", "system(", "unlink", "remove("]) refuse(!strings.includes(forbidden), `forbidden surface ${forbidden}`);
refuse(!globalSymbols.includes(" _main") && !globalSymbols.includes(" T _main"), "entrypoint present");

const testRun = run(join(root, "scripts/test-double.sh"), []);
refuse(testRun.includes("C5b7 test-double executor: PASSED"), "test-double result");

const archive = await json("manifests/archive-manifest.json");
refuse(archive.objectType === "capsule.experiment-archive-manifest" && archive.manifestSelfExcluded === true, "archive identity");
async function walk(path) {
  const output = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) output.push(...await walk(child)); else output.push(child);
  }
  return output;
}
const archivePath = "manifests/archive-manifest.json";
const files = (await walk(root)).map((path) => relative(root, path)).filter((path) => path !== archivePath).sort();
refuse(JSON.stringify(files) === JSON.stringify(archive.retainedFiles.map(({ path }) => path)), "closed archive inventory");
for (const entry of archive.retainedFiles) {
  const bytes = await readFile(join(root, entry.path));
  const metadata = await stat(join(root, entry.path));
  refuse(bytes.length === entry.bytes && sha256(bytes) === entry.sha256 && (metadata.mode & 0o777).toString(8).padStart(4, "0") === entry.mode, `${entry.path}: archive identity mismatch`);
}
console.log(JSON.stringify({ status: "PASSED", retainedFiles: files.length, productionObject: { bytes: objectA.length, sha256: sha256(objectA) }, effects: "NONE" }));
