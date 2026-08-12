#!/usr/bin/env node
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const mutations = [
  ["native-contract-byte", async (copy) => {
    const path = resolve(copy, "fixtures/authenticated-local-ipc-v0/native-xpc-v0.contract.json");
    const text = await readFile(path, "utf8");
    await writeFile(path, text.replace("passive-unwired-no-listener", "passive-unwired-no-listeneX"));
  }],
  ["promote-c4-method", async (copy) => {
    const path = resolve(copy, "experiment-profile.json");
    const value = JSON.parse(await readFile(path, "utf8"));
    value.methodScope.executable.push("SubmitApprovalV0");
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  }],
  ["canonical-alias-reuse", async (copy) => {
    const path = resolve(copy, "experiment-profile.json");
    const value = JSON.parse(await readFile(path, "utf8"));
    value.serviceAliases[0].experimental = value.serviceAliases[0].canonical;
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  }],
  ["activate-listener-claim", async (copy) => {
    const path = resolve(copy, "experiment-profile.json");
    const value = JSON.parse(await readFile(path, "utf8"));
    value.activation.serviceRegistration = true;
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  }],
  ["generated-c4-method-row", async (copy) => {
    const path = resolve(copy, "generated/capsule_c2b0_contract.generated.h");
    await writeFile(path, `${await readFile(path, "utf8")}\n/* \"SubmitApprovalV0\" */\n`);
  }],
  ["requirement-after-resume", async (copy) => {
    const path = resolve(copy, "src/server.m");
    const text = await readFile(path, "utf8");
    await writeFile(path, text.replace(
      "if (xpc_connection_set_peer_code_signing_requirement(context->listener, requirement_text) != 0) {",
      "xpc_connection_resume(context->listener);\n    if (xpc_connection_set_peer_code_signing_requirement(context->listener, requirement_text) != 0) {",
    ));
  }],
  ["remove-server-gate", async (copy) => {
    const path = resolve(copy, "src/server.m");
    const text = await readFile(path, "utf8");
    await writeFile(path, text.replace("capsule_c2b0_execution_gate(argc, argv)", "true"));
  }],
  ["build-script-launchctl", async (copy) => {
    const path = resolve(copy, "scripts/build-unsigned.sh");
    await writeFile(path, `${await readFile(path, "utf8")}\nlaunchctl print gui/0/example\n`);
  }],
  ["body-fixture-byte", async (copy) => {
    const path = resolve(copy, "fixtures/body/main.mjs");
    const bytes = await readFile(path);
    bytes[0] ^= 1;
    await writeFile(path, bytes);
  }],
  ["evidence-effect", async (copy) => {
    const path = resolve(copy, "evidence/2026-08-11/construction-result.json");
    const value = JSON.parse(await readFile(path, "utf8"));
    value.observedEffects.listenerActivated = true;
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  }],
  ["execution-plan-c4", async (copy) => {
    const path = resolve(copy, "generated/execution-plan.json");
    const value = JSON.parse(await readFile(path, "utf8"));
    value.executableCases.push({ method: "SubmitApprovalV0" });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  }],
  ["manifest-omission", async (copy) => {
    const path = resolve(copy, "manifest.json");
    const value = JSON.parse(await readFile(path, "utf8"));
    value.files.pop();
    value.fileCount--;
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  }, false],
];

for (const [name, mutate, refreshManifest = true] of mutations) {
  const parent = await mkdtemp(resolve(tmpdir(), "capsule-c2b0-mutation-"));
  const copy = resolve(parent, "experiment");
  try {
    await cp(root, copy, { recursive: true, filter: (path) => !path.includes("/.build") });
    await mutate(copy);
    if (refreshManifest) {
      const update = spawnSync(process.execPath, [resolve(copy, "scripts/update-manifest.mjs"), "--write"], {
        cwd: copy,
        encoding: "utf8",
      });
      if (update.status !== 0) throw new Error(`${name}: could not refresh mutation manifest`);
    }
    const result = spawnSync(process.execPath, [resolve(copy, "scripts/verify.mjs"), "--root", copy], {
      cwd: copy,
      encoding: "utf8",
    });
    if (result.status === 0) throw new Error(`${name}: verifier accepted mutation`);
    console.log(`PASS ${name}`);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({ status: "PASSED", mutations: mutations.length }));
