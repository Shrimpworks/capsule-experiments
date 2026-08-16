#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const check = process.argv.includes("--check");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = resolve(root, "..", "..");
const generated = new Map();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const retain = (path, bytes) => {
  const exact = Buffer.from(bytes);
  generated.set(path, exact);
  return { path, bytes: exact.length, sha256: sha256(exact) };
};
const directRef = async (path) => {
  const bytes = await readFile(join(repository, path));
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
};

const paths = {
  c5b9Profile: "experiments/typed-guest-transport-c5b9-immutable-no-run-composite/contracts/composite-profile.json",
  c5b9Plan: "experiments/typed-guest-transport-c5b9-immutable-no-run-composite/contracts/no-run-composite.json",
  hostRunnerSource: "experiments/typed-guest-transport-c5b2-governed-input-closure/inputs/c2b-v4/capsule-host-runner.c",
  hostRunner: "experiments/typed-guest-transport-c5b2-governed-input-closure/inputs/c2b-v4/capsule-host-runner",
  rootBoundEffects: "experiments/typed-guest-transport-c5b8-c5b7-root-binding-successor/dist/controlled-effects-root-bound-a.o",
  effectAdapter: "experiments/typed-guest-transport-c5b8-c5b7-root-binding-successor/generated/historical_adapter_local.c",
  operationHeader: "experiments/typed-guest-transport-c5b8-c5b7-root-binding-successor/inputs/c5b8/source/controlled_effects_internal.h",
};
const components = Object.fromEntries(await Promise.all(
  Object.entries(paths).map(async ([name, path]) => [name, await directRef(path)]),
));
const c5b9 = JSON.parse(await readFile(join(repository, paths.c5b9Profile), "utf8"));
const runnerSource = await readFile(join(repository, paths.hostRunnerSource), "utf8");
const adapterSource = await readFile(join(repository, paths.effectAdapter), "utf8");

const runnerRootBytes = Number(runnerSource.match(/CAPSULE_ROOT_BYTES UINT64_C\((\d+)\)/u)?.[1]);
const digestBody = runnerSource.match(/capsule_root_sha256\[[^\]]+\] = \{([^}]+)\}/su)?.[1] ?? "";
const runnerRootSha256 = [...digestBody.matchAll(/0x([0-9a-f]{2})/gu)].map((match) => match[1]).join("");
const startRunnerBlock = adapterSource.slice(
  adapterSource.indexOf("if ((controller_actions & C5B3_ACTION_START_RUNNER)"),
  adapterSource.indexOf("if ((controller_actions & C5B3_ACTION_WRITE_SOURCE)"),
);
const startRunnerEffects = [...startRunnerBlock.matchAll(/APPEND\((C5B5_EFFECT_[A-Z0-9_]+)/gu)]
  .map((match) => match[1]);
const startEnterWithinStartRunnerOrdinal = startRunnerEffects.indexOf("C5B5_EFFECT_KRUN_START_ENTER") + 1;
const nominalEffects = [...adapterSource.matchAll(/APPEND\((C5B5_EFFECT_[A-Z0-9_]+)/gu)]
  .map((match) => match[1]);
const startEnterNominalOrdinal = nominalEffects.indexOf("C5B5_EFFECT_KRUN_START_ENTER") + 1;
const sourceWriteNominalOrdinal = nominalEffects.indexOf("C5B5_EFFECT_WRITE_SOURCE") + 1;
const inputWriteNominalOrdinal = nominalEffects.indexOf("C5B5_EFFECT_WRITE_INPUT") + 1;

const profile = {
  objectType: "capsule.c5b.controlled-harness-preflight",
  objectVersion: 1,
  identity: "capsule.c5b.controlled-harness-preflight/2026-08-16",
  status: "build-only-no-run",
  components,
  authorization: {
    ownerConfirmedHost: {
      hostname: "Dylans-MacBook-Pro.local",
      architecture: "Apple silicon",
      operatingSystem: "macOS 26.5.2 (25F84)",
    },
    ownedDisposableGuest: {
      platform: "Linux/arm64",
      freshPerAttempt: true,
      builtSolelyFromMerge: "3965e6b5cc87d476da7f431d7ed8a5758011a1b8",
    },
    preparationAuthorized: true,
    executionAuthorized: false,
    finalManifestAuthorizationRequired: true,
  },
  exactCandidate: {
    disposition: "NO_GO",
    operationProviderSymbol: "_c5b8_controlled_test_operation",
    contradictions: [
      "root-identity-mismatch",
      "execution-order-mismatch",
      "operation-protocol-mismatch",
      "duplicate-libkrun-ownership",
    ],
  },
  observedBindings: {
    c5b9Merge: "3965e6b5cc87d476da7f431d7ed8a5758011a1b8",
    c5b9RootBytes: c5b9.components.runtimeRoot.bytes,
    c5b9RootSha256: c5b9.components.runtimeRoot.sha256,
    hostRunnerRootBytes: runnerRootBytes,
    hostRunnerRootSha256: runnerRootSha256,
    startEnterWithinStartRunnerOrdinal,
    startEnterNominalOrdinal,
    sourceWriteNominalOrdinal,
    inputWriteNominalOrdinal,
  },
  requiredSuccessor: {
    singleLibkrunOwner: "fixed-host-runner-process",
    operationSurface: [
      "create-fixed-endpoints",
      "spawn-fixed-runner",
      "verify-ready-byte",
      "write-source-frame",
      "write-input-frame",
      "close-input-writers",
      "send-start-byte",
      "drain-and-validate-completion",
      "join-terminal-state",
      "prove-absence",
      "remove-fixed-root",
      "commit-before-delivery",
    ],
    callerSelectedAuthority: false,
  },
  effects: {
    libkrunLoaded: false,
    hvfCalled: false,
    runnerStarted: false,
    vmStarted: false,
    guestStarted: false,
    networkAccessed: false,
    credentialsAccessed: false,
    productStateMutated: false,
  },
};
retain("contracts/preflight.json", json(profile));
retain("evidence/2026-08-16/construction.json", json({
  workItem: "C5b controlled-harness build-only preflight",
  scopedStatus: "PASSED",
  directBindingCandidate: "NO_GO",
  parentControlledExecution: "BLOCKED",
  observation: "The retained C5b9 inputs cannot be truthfully joined by implementing only the fixed C5b8 operation symbol.",
  inference: "A successor adapter must make the fixed host-runner process the sole libkrun owner and expose process/transport effects in controller order.",
  effects: profile.effects,
}));
retain("evidence/2026-08-16/mutation-dispositions.json", json({
  status: "PASSED",
  cases: [
    "execution-authorization", "host-root-size", "host-root-digest", "start-enter-order",
    "candidate-disposition", "contradiction-removal", "caller-authority", "guest-effect",
    "component-substitution", "closed-inventory-extra",
  ],
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
  files.push({ path: relative(root, absolute), bytes: bytes.length, sha256: sha256(bytes) });
}
const manifestBytes = json({
  objectType: "capsule.experiment-archive-manifest",
  objectVersion: 1,
  identity: "capsule.c5b.controlled-harness-preflight/2026-08-16",
  manifestSelfExcluded: true,
  files,
});
if (check) {
  if (!(await readFile(manifestPath)).equals(manifestBytes)) throw new Error("generated file drift: manifests/archive-manifest.json");
} else {
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, manifestBytes);
}
