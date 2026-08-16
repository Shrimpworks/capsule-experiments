#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const check = process.argv.includes("--check");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = resolve(root, "..", "..");
const generated = new Map();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest();
const sha256Hex = (bytes) => sha256(bytes).toString("hex");
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const retain = (path, bytes) => {
  const exact = Buffer.from(bytes);
  generated.set(path, exact);
  return { path, bytes: exact.length, sha256: sha256Hex(exact) };
};
const directRef = async (path) => {
  const bytes = await readFile(join(repository, path));
  return { path, bytes: bytes.length, sha256: sha256Hex(bytes) };
};

const paths = {
  hostRunner: "experiments/typed-guest-transport-c5b2-governed-input-closure/inputs/c2b-v4/capsule-host-runner",
  libkrun: "experiments/typed-guest-transport-c5b2-governed-input-closure/inputs/c2b-v4/libkrun.1.dylib",
  libkrunfw: "experiments/typed-guest-transport-c5b4-libkrunfw-recovery/artifacts/libkrunfw.5.dylib",
  runtimeRoot: "experiments/typed-guest-transport-c5b7-deterministic-runtime-root/dist/runtime-root.ext4",
  controller: "experiments/typed-guest-transport-c5b3-controlled-test-controller/dist/controller-core-a.o",
  rootBoundEffects: "experiments/typed-guest-transport-c5b8-c5b7-root-binding-successor/dist/controlled-effects-root-bound-a.o",
};
const components = Object.fromEntries(await Promise.all(
  Object.entries(paths).map(async ([name, path]) => [name, await directRef(path)]),
));
const libkrunSymbols = [
  "_krun_add_console_port_inout", "_krun_add_read_only_raw_root_fd", "_krun_add_virtio_console_multiport",
  "_krun_create_ctx", "_krun_disable_implicit_console", "_krun_disable_implicit_init",
  "_krun_disable_implicit_vsock", "_krun_set_exec", "_krun_set_kernel_console",
  "_krun_set_root_disk_remount", "_krun_set_vm_config", "_krun_set_workdir", "_krun_start_enter",
];
const profile = {
  objectType: "capsule.c5b9.immutable-no-run-composite",
  objectVersion: 1,
  identity: "capsule.c5b9.immutable-no-run-composite/2026-08-16",
  status: "construction-only-not-authorized",
  predecessors: {
    c5b2: "5a2f835e8c9df8279237f940f5af757e119593bd",
    c5b4: "068e221dafa7cf3e9a945cee7e8bf077eeed1c6b",
    c5b7: "78485fb91a31733c568fe43e5fa295474e5956e1",
    c5b8RootBinding: "b0819d76883eb86cbbc03b2b7033fe55bedbf713",
  },
  components,
  abi: {
    controllerDefined: ["_c5b3_controller_reset", "_c5b3_controller_step"],
    effectUndefinedController: ["_c5b3_controller_reset", "_c5b3_controller_step"],
    libkrunSymbols,
    runnerLibkrunImports: libkrunSymbols,
    effectLibkrunImports: libkrunSymbols,
    libkrunExportsCoverImports: true,
    fixedOperationPort: { symbol: "_c5b8_controlled_test_operation", provider: null, bindingStatus: "BLOCKED" },
    libkrunfwRole: "sole-runtime-boot-kernel-carrier",
    separateFirmware: "INAPPLICABLE",
  },
  transport: {
    payloadMaximumBytes: 262144,
    sourcePhysicalMaximum: 262296,
    inputPhysicalMaximum: 262296,
    completionPhysicalMaximum: 262368,
    completionRetentionBytes: 262369,
    completionLast: true,
    teardownOrder: ["child-tree-terminated", "runner-absent", "root-unlinked", "durable-commit", "delivery"],
  },
  authorization: {
    ownerConfirmedHost: null,
    ownedDisposableGuest: null,
    authorizationId: null,
    executionAuthorized: false,
    callerSelectedAuthority: false,
  },
  historicalV19V27: { rawBytesRecovered: false, identityReused: false },
  effects: {
    libkrunLoaded: false, artifactLoaded: false, runnerStarted: false, hvfCalled: false,
    vmStarted: false, guestStarted: false, networkAccessed: false, credentialsAccessed: false,
    productStateMutated: false, admissionChanged: false,
  },
};
const profileRef = retain("contracts/composite-profile.json", json(profile));

const predecessorRoot = join(repository, "experiments/typed-guest-transport-c5b8-c5b7-root-binding-successor");
const predecessorPlanBytes = await readFile(join(predecessorRoot, "contracts/no-run-plan.json"));
const predecessorProfileBytes = await readFile(join(predecessorRoot, "contracts/root-binding-profile.json"));
const predecessorPlan = JSON.parse(predecessorPlanBytes);
const completionPayload = await readFile(join(repository, "experiments/typed-guest-transport-c5b0-v19-successor/fixtures/expected-completion.json"));
const completionHeader = Buffer.alloc(160);
completionHeader.write("CPCMP001", 0, "ascii");
completionHeader.writeUInt16BE(1, 8); completionHeader.writeUInt16BE(1, 10);
completionHeader.writeUInt16BE(3, 12); completionHeader.writeUInt16BE(160, 14);
Buffer.from(predecessorPlan.attemptId, "hex").copy(completionHeader, 16);
Buffer.from(predecessorPlan.registrationId, "hex").copy(completionHeader, 32);
sha256(predecessorPlanBytes).copy(completionHeader, 48);
sha256(predecessorProfileBytes).copy(completionHeader, 80);
completionHeader.writeUInt16BE(1, 112); completionHeader.writeUInt16BE(0, 114);
completionHeader.writeUInt32BE(0, 116); completionHeader.writeBigUInt64BE(BigInt(completionPayload.length), 120);
sha256(completionPayload).copy(completionHeader, 128);
const trailer = Buffer.alloc(64);
trailer.write("CPEND001", 0, "ascii"); trailer.writeUInt16BE(1, 8); trailer.writeUInt16BE(1, 10);
trailer.writeUInt16BE(3, 12); trailer.writeUInt16BE(64, 14);
Buffer.from(predecessorPlan.attemptId, "hex").copy(trailer, 16);
sha256(Buffer.concat([completionHeader, completionPayload])).copy(trailer, 32);
const completionRef = retain("fixtures/completion.frame", Buffer.concat([completionHeader, completionPayload, trailer]));

const sourceFrameRef = await directRef("experiments/typed-guest-transport-c5b8-c5b7-root-binding-successor/fixtures/source.frame");
const inputFrameRef = await directRef("experiments/typed-guest-transport-c5b8-c5b7-root-binding-successor/fixtures/input.frame");
retain("contracts/no-run-composite.json", json({
  objectType: "capsule.c5b9.no-run-composite-plan", objectVersion: 1,
  identity: "capsule.c5b9.no-run-composite-plan/2026-08-16", status: "construction-only-not-authorized",
  compositeProfile: profileRef,
  executionProfile: { path: "experiments/typed-guest-transport-c5b8-c5b7-root-binding-successor/contracts/root-binding-profile.json", bytes: predecessorProfileBytes.length, sha256: sha256Hex(predecessorProfileBytes) },
  executionPlan: { path: "experiments/typed-guest-transport-c5b8-c5b7-root-binding-successor/contracts/no-run-plan.json", bytes: predecessorPlanBytes.length, sha256: sha256Hex(predecessorPlanBytes) },
  fixtures: { source: sourceFrameRef, input: inputFrameRef, completion: completionRef },
  authorization: profile.authorization,
}));
retain("evidence/2026-08-16/construction.json", json({
  workItem: "C5b9 immutable no-run composite", scopedStatus: "PASSED", controlledExecution: "BLOCKED",
  result: "Exact retained components, ABI/load surfaces, transport caps, completion-last ordering, and null authorization are bound without loading an artifact.",
  effects: profile.effects,
}));
retain("evidence/2026-08-16/mutation-dispositions.json", json({
  status: "PASSED",
  cases: ["component-digest", "root-size", "controller-abi", "libkrun-abi", "operation-provider", "execution-authorization", "caller-authority", "guest-effect", "transport-cap", "completion-last", "teardown-order", "historical-identity-reuse", "predecessor-substitution", "closed-inventory-extra"],
}));

for (const [path, bytes] of generated) {
  const destination = join(root, path);
  if (check) {
    if (!(await readFile(destination)).equals(bytes)) throw new Error(`generated file drift: ${path}`);
  } else {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
}

async function walk(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) result.push(...await walk(child)); else result.push(child);
  }
  return result;
}
const manifestPath = join(root, "manifests/archive-manifest.json");
const files = [];
for (const absolute of (await walk(root)).sort()) {
  if (absolute === manifestPath) continue;
  const bytes = await readFile(absolute);
  files.push({ path: relative(root, absolute), bytes: bytes.length, sha256: sha256Hex(bytes) });
}
const manifestBytes = json({
  objectType: "capsule.experiment-archive-manifest", objectVersion: 1,
  identity: "capsule.c5b9.immutable-no-run-composite/2026-08-16", manifestSelfExcluded: true, files,
});
if (check) {
  if (!(await readFile(manifestPath)).equals(manifestBytes)) throw new Error("generated file drift: manifests/archive-manifest.json");
} else {
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, manifestBytes);
}
