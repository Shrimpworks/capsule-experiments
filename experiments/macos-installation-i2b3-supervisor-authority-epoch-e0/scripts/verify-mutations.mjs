import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  cp,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function runNode(script, root) {
  return spawnSync(process.execPath, [resolve(root, "scripts", script)], {
    cwd: root,
    encoding: "utf8",
  });
}

async function withCopy(callback) {
  const temporary = await mkdtemp(resolve(tmpdir(), "capsule-e0-mutation-"));
  const root = resolve(temporary, "packet");
  try {
    await cp(sourceRoot, root, { recursive: true });
    return await callback(root);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function mutateJson(root, rel, mutate) {
  const path = resolve(root, rel);
  const value = JSON.parse(await readFile(path, "utf8"));
  mutate(value);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function expectVerifyRefusal(name, mutate, regenerate = true) {
  await withCopy(async (root) => {
    await mutate(root);
    if (regenerate) {
      const generated = runNode("generate-manifest.mjs", root);
      assert.equal(generated.status, 0, `${name}: manifest regeneration failed\n${generated.stderr}`);
    }
    const verified = runNode("verify.mjs", root);
    assert.notEqual(verified.status, 0, `${name}: mutation unexpectedly verified`);
  });
}

await expectVerifyRefusal(
  "missing retained file",
  (root) => rm(resolve(root, "sources/coordinator/main.m")),
  false,
);
await expectVerifyRefusal(
  "extra retained file",
  (root) => writeFile(resolve(root, "unexpected"), "extra\n"),
  false,
);
await expectVerifyRefusal("packet missing field", (root) =>
  mutateJson(root, "fixtures/e0-packet.json", (value) => {
    delete value.authority.supervisorEvidenceGroup;
  }),
);
await expectVerifyRefusal("packet unknown field", (root) =>
  mutateJson(root, "fixtures/e0-packet.json", (value) => {
    value.unexpected = true;
  }),
);
await expectVerifyRefusal("authority sequence zero", (root) =>
  mutateJson(root, "descriptors/supervisor-authority-descriptor-v0.input.json", (value) => {
    value.authoritySequence = 0;
  }),
);
await expectVerifyRefusal("authority sequence two", (root) =>
  mutateJson(root, "descriptors/supervisor-authority-descriptor-v0.input.json", (value) => {
    value.authoritySequence = 2;
  }),
);
await expectVerifyRefusal("stable Supervisor substitution", (root) =>
  mutateJson(root, "descriptors/supervisor-authority-descriptor-v0.input.json", (value) => {
    value.supervisor.signingIdentifier = "com.capsulecorp.capsule.supervisor";
  }),
);
await expectVerifyRefusal("wildcard signing identifier", (root) =>
  mutateJson(root, "descriptors/supervisor-authority-descriptor-v0.input.json", (value) => {
    value.supervisor.signingIdentifier = "com.capsulecorp.capsule.supervisor.*";
  }),
);
await expectVerifyRefusal("wrong Team", (root) =>
  mutateJson(root, "fixtures/e0-packet.json", (value) => {
    value.authority.teamIdentifier = "WRONGTEAM0";
  }),
);
await expectVerifyRefusal("wrong group", (root) =>
  mutateJson(root, "fixtures/e0-packet.json", (value) => {
    value.authority.bootstrapApplicationGroup = "3DDR84M4JS.wrong.group";
  }),
);
await expectVerifyRefusal("mixed Coordinator group", (root) =>
  mutateJson(root, "descriptors/supervisor-authority-descriptor-v0.input.json", (value) => {
    value.groups.supervisorBootstrapAnchor = value.groups.coordinatorInstallationRoot;
  }),
);
await expectVerifyRefusal("wrong service", (root) =>
  mutateJson(root, "fixtures/e0-packet.json", (value) => {
    value.authority.bootstrapMachService = "3DDR84M4JS.wrong.service";
  }),
);
await expectVerifyRefusal("path-bearing descriptor", (root) =>
  mutateJson(root, "descriptors/supervisor-authority-descriptor-v0.input.json", (value) => {
    value.supervisor.privateContainer.selection = "/Users/example/Library/Containers/guessed";
  }),
);
await expectVerifyRefusal("descriptor unknown field", (root) =>
  mutateJson(root, "descriptors/supervisor-authority-descriptor-v0.input.json", (value) => {
    value.unexpected = "field";
  }),
);
await expectVerifyRefusal("materialized current profile", (root) =>
  mutateJson(root, "profile-requests/current-supervisor.json", (value) => {
    value.profileUuid = "00000000-0000-0000-0000-000000000000";
  }),
);
await expectVerifyRefusal("process launch claim", (root) =>
  mutateJson(root, "fixtures/e0-packet.json", (value) => {
    value.constructionBoundary.processLaunched = true;
  }),
);
await expectVerifyRefusal("Coordinator launch allowance", (root) =>
  mutateJson(root, "fixtures/e0-packet.json", (value) => {
    value.bundleInventory[2].launchAllowedInE0 = true;
  }),
);
await expectVerifyRefusal("unsafe entitlement", async (root) => {
  const path = resolve(root, "entitlements/current-supervisor.plist");
  const bytes = await readFile(path, "utf8");
  await writeFile(
    path,
    bytes.replace(
      "</dict>",
      "  <key>com.apple.security.network.client</key>\n  <true/>\n</dict>",
    ),
  );
});
await expectVerifyRefusal("active LaunchAgent", async (root) => {
  const path = resolve(root, "service-management/current-supervisor-LaunchAgent.plist");
  const bytes = await readFile(path, "utf8");
  await writeFile(
    path,
    bytes.replace("<key>RunAtLoad</key>\n  <false/>", "<key>RunAtLoad</key>\n  <true/>"),
  );
});
await expectVerifyRefusal("substituted current artifact", async (root) => {
  await copyFile(
    resolve(root, "dist/CapsuleSupervisorLegacyProbe.app/Contents/MacOS/CapsuleSupervisorLegacyProbe"),
    resolve(root, "dist/CapsuleSupervisorAuthorityE1Probe.app/Contents/MacOS/CapsuleSupervisorAuthorityE1Probe"),
  );
});
await expectVerifyRefusal("descriptor cap plus one", (root) =>
  writeFile(
    resolve(root, "descriptors/supervisor-authority-descriptor-v0.input.json"),
    Buffer.alloc(65_537, 0x20),
  ),
);

await withCopy(async (root) => {
  await symlink("fixtures/e0-packet.json", resolve(root, "unexpected-link"));
  const generated = runNode("generate-manifest.mjs", root);
  assert.notEqual(generated.status, 0, "symbolic link unexpectedly entered manifest");
});

await withCopy(async (root) => {
  for (let index = 0; index < 65; index += 1) {
    await writeFile(resolve(root, `unexpected-${index.toString().padStart(2, "0")}`), "x");
  }
  const generated = runNode("generate-manifest.mjs", root);
  assert.notEqual(generated.status, 0, "closed file cap plus one unexpectedly generated");
});

console.log(JSON.stringify({ status: "PASSED", mutationRefusals: 23 }, null, 2));
