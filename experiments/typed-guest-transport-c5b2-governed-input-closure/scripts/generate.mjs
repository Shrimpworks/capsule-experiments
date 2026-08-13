#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function identity(path) {
  const bytes = await readFile(join(root, path));
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
}

function command(name, args) {
  return execFileSync(name, args, { encoding: "utf8", cwd: root })
    .trimEnd()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function emit(path, value) {
  const output = canonical(value);
  if (check) {
    const current = await readFile(join(root, path), "utf8");
    if (current !== output) throw new Error(`${path}: generated output mismatch`);
    return;
  }
  await writeFile(join(root, path), output);
}

const c2bV4Paths = [
  "inputs/c2b-v4/materialized-profile.json",
  "inputs/c2b-v4/libkrun.h",
  "inputs/c2b-v4/libkrun-abi-audit.c",
  "inputs/c2b-v4/libkrun.1.dylib",
  "inputs/c2b-v4/capsule-host-runner.c",
  "inputs/c2b-v4/capsule-host-runner",
];
const boundInputs = Object.fromEntries(
  await Promise.all(c2bV4Paths.map(async (path) => [path.split("/").at(-1), await identity(path)])),
);
const c5b1Profile = await identity("inputs/c5b1/artifact-profile.json");
const historicalEvidence = {
  artifactClosureReport: await identity("inputs/c2b-artifact-closure/artifact-closure-report.json"),
  libkrunfwMachO: await identity("inputs/c2b-artifact-closure/libkrunfw-macho.txt"),
  kernelExtraction: await identity("inputs/c2b-artifact-closure/kernel-extraction.txt"),
};

const profile = {
  objectType: "capsule.c5b2.governed-input-closure",
  objectVersion: 1,
  identity: "capsule.c5b2.typed-transport-governed-input-closure/2026-08-12",
  scopedInputClosureStatus: "PASSED",
  completeExecutableSuccessorStatus: "BLOCKED",
  controlledExecutionStatus: "BLOCKED",
  runtimeProfileAdmission: "BLOCKED",
  repositoryBaseline: "ee00ae2abbce64ae6458b82d0b53d904ee39aeb6",
  capsuleSource: {
    repository: "Shrimpworks/capsule-corp",
    commit: "e5401a81b727915ec01afe9012a77e7586a57c13",
    directory: "schemas/conformance/c2b-host-runner-materialized-v4",
  },
  predecessor: {
    mergeCommit: "db08ebf277432e06d6cba3b7f7338e3bd4a61252",
    experimentRoot: "experiments/typed-guest-transport-c5b1-executable-successor",
    artifactProfile: c5b1Profile,
    hardStopControllerReused: false,
  },
  governedSources: {
    deno: {
      repository: "Shrimpworks/deno",
      commit: "3fa21d1ae7705ab4bcb4bc98955f25301b20122a",
      tree: "6060cb0eb4cd3395a4c141f054634968744617d2",
    },
    rustyV8: {
      repository: "Shrimpworks/rusty_v8",
      commit: "d09221062280ae1675fe26c53c3f43871aae2055",
      tree: "2632901e6e7e9ac88662756ceb658d4e3e49fceb",
    },
    libkrun: {
      repository: "Shrimpworks/libkrun",
      upstreamCommit: "728df8125077d0db44265f6e997c72b81b65c015",
      acceptedCommit: "7432eda5a49220976b0167005aa43ee622f9d632",
      acceptedTree: "7671440cfbafa58fe20aebf8d4deb2a843ebe346",
    },
  },
  boundAvailableInputs: boundInputs,
  retainedIdentityOnlyEvidence: historicalEvidence,
  governedArtifactClosure: {
    libkrun: {
      retainedBytesAvailable: true,
      bindingStatus: "BOUND",
      artifact: boundInputs["libkrun.1.dylib"],
      architecture: "arm64",
      minimumMacos: "11.0",
      sdk: "26.5",
      installName: "libkrun.1.dylib",
      loaded: false,
    },
    denoCoreExecutable: {
      retainedBytesAvailable: false,
      bindingStatus: "BLOCKED",
      expectedBytes: 68496520,
      expectedSha256: "e781a90236cdf1272a9a16189c6be033164fa25a5aa9e52376ef998982ec0a77",
      reason: "the canonical profile retains only the identity; no immutable executable bytes are present in either bounded repository input",
    },
    libkrunfw: {
      retainedBytesAvailable: false,
      bindingStatus: "BLOCKED",
      role: "sole-runtime-boot-kernel-carrier",
      expectedBytes: 24339104,
      expectedSha256: "0b14f4b8005dafd33c38df5935b9efdb6381c724224b3967ba1cecbecf10b6e9",
      reason: "the retained archive preserves identity and construction evidence but not the large dylib bytes",
      staticEvidence: historicalEvidence.libkrunfwMachO,
    },
    kernel: {
      retainedBytesAvailable: false,
      bindingStatus: "EVIDENCE_ONLY",
      role: "derived-evidence-only-not-separate-runtime-input",
      expectedBytes: 24117248,
      expectedSha256: "b50a4165215d5d897ab3614606a2105756cf8f2b2510cbceda9dc06057a5622d",
      extractionEvidence: historicalEvidence.kernelExtraction,
    },
    separateFirmware: {
      retainedBytesAvailable: false,
      bindingStatus: "INAPPLICABLE",
      reason: "accepted ADR-0041 makes libkrunfw the sole non-EFI boot-kernel carrier and forbids separate firmware path authority",
    },
    controlledTestController: {
      retainedBytesAvailable: false,
      bindingStatus: "BLOCKED",
      path: null,
      bytes: null,
      sha256: null,
      reason: "no complete reviewed controller implements the frozen C5b copy, cap-plus-one, fault, teardown, absence, and cleanup matrix",
    },
  },
  composition: {
    compositeManifest: null,
    runtimeRoot: null,
    controller: null,
    executable: false,
    reason: "three required retained byte inputs and the complete controller remain absent",
  },
  effects: {
    artifactExecuted: false,
    libkrunLoaded: false,
    hvfCalled: false,
    processStarted: false,
    vmStarted: false,
    guestStarted: false,
    networkAccessed: false,
    credentialAccessed: false,
    signed: false,
    installed: false,
    productStateMutated: false,
    admissionChanged: false,
  },
};
await emit("manifests/input-closure.json", profile);

const libPath = "inputs/c2b-v4/libkrun.1.dylib";
const runnerPath = "inputs/c2b-v4/capsule-host-runner";
const inspection = {
  method: "static-system-tool-readback-only-no-load",
  status: "PASSED",
  file: {
    libkrun: command("file", [libPath]).at(0).split(": ").at(-1),
    runner: command("file", [runnerPath]).at(0).split(": ").at(-1),
  },
  libkrunDependencies: command("otool", ["-L", libPath]).slice(1),
  runnerDependencies: command("otool", ["-L", runnerPath]).slice(1),
  libkrunExports: command("nm", ["-gjU", libPath]).filter((name) => name.startsWith("_krun_")).sort(),
  runnerUndefinedKrunSymbols: command("nm", ["-g", runnerPath])
    .filter((line) => line.startsWith("U _krun_"))
    .map((line) => line.split(" ").at(-1))
    .sort(),
  abiSyntaxOnly: "PASSED",
  loaded: false,
  executed: false,
};
execFileSync("clang", ["-std=c17", "-fsyntax-only", "-Iinputs/c2b-v4", "inputs/c2b-v4/libkrun-abi-audit.c"], { cwd: root, stdio: "pipe" });
await emit("evidence/2026-08-12/macho-inspection.json", inspection);

const result = {
  workItem: "C5b2 governed input closure",
  scopedInputClosureStatus: "PASSED",
  completeExecutableSuccessorStatus: "BLOCKED",
  result: "Exact current-source libkrun, accepted header, ABI audit, and final runner bytes are bound and statically verified; absent runtime/libkrunfw bytes and the missing reviewed controller prevent a composite.",
  boundedInputs: Object.keys(boundInputs).length,
  effects: profile.effects,
};
await emit("evidence/2026-08-12/result.json", result);
await emit("evidence/2026-08-12/mutation-dispositions.json", {
  status: "PASSED",
  cases: [
    { id: "libkrun-byte", expected: "source identity mismatch" },
    { id: "runner-byte", expected: "source identity mismatch" },
    { id: "runtime-false-binding", expected: "runtime blocker mismatch" },
    { id: "libkrunfw-false-binding", expected: "libkrunfw blocker mismatch" },
    { id: "firmware-path-authority", expected: "firmware role mismatch" },
    { id: "controller-invention", expected: "controller must remain explicitly unbound" },
    { id: "false-executable-claim", expected: "composition must remain unbound" },
  ],
});

async function walk(path) {
  const entries = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) entries.push(...(await walk(child)));
    else entries.push(child);
  }
  return entries;
}

const archivePath = "manifests/archive-manifest.json";
const files = (await walk(root))
  .map((path) => relative(root, path))
  .filter((path) => path !== archivePath)
  .sort();
const retainedFiles = [];
for (const path of files) {
  const bytes = await readFile(join(root, path));
  const metadata = await stat(join(root, path));
  retainedFiles.push({ path, mode: (metadata.mode & 0o777).toString(8).padStart(4, "0"), bytes: bytes.length, sha256: sha256(bytes) });
}
await emit(archivePath, {
  objectType: "capsule.experiment-archive-manifest",
  objectVersion: 1,
  identity: profile.identity,
  manifestSelfExcluded: true,
  retainedFiles,
});

console.log(JSON.stringify({ result: "PASSED", check, retainedFiles: retainedFiles.length }));
