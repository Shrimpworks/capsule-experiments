import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const archiveRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const includedRoots = ["payloads", "source-bindings"];

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function walk(root, current = root) {
  const result = [];
  for (const name of (await readdir(current)).sort()) {
    const path = join(current, name);
    const stat = await lstat(path);
    assert.equal(stat.isSymbolicLink(), false, `${relative(root, path)}: symlink forbidden`);
    if (stat.isDirectory()) result.push(...(await walk(root, path)));
    else {
      assert.equal(stat.isFile(), true, `${relative(root, path)}: regular files only`);
      result.push({ path, mode: stat.mode & 0o777, bytes: stat.size });
    }
  }
  return result;
}

async function inventory() {
  const entries = [];
  for (const name of includedRoots) {
    const root = join(archiveRoot, name);
    for (const entry of await walk(archiveRoot, root)) {
      entries.push({
        path: relative(archiveRoot, entry.path),
        mode: entry.mode,
        bytes: entry.bytes,
        sha256: await sha256(entry.path),
      });
    }
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

function sourceFilesBytes(entries) {
  return `${entries.map((entry) => `${entry.mode.toString(8).padStart(3, "0")} ${entry.bytes} ${entry.path}`).join("\n")}\n`;
}

function sha256SumsBytes(entries) {
  return `${entries.map((entry) => `${entry.sha256}  ${entry.path}`).join("\n")}\n`;
}

const payloadRoot = join(archiveRoot, "payloads/capsule-corp/artifacts");
const expectedMachO = new Map([
  ["mjs-source-validator-v1/dist/capsule-mjs-source-validator-aarch64-apple-darwin", [1146656, "ba2a6b38be6b4eea8c067887cf80988756e2f4a551d128bf2dabdaf7f2ecb600"]],
  ["mjs-source-validator-r2/dist/CapsuleSourceValidatorDaemon.xpc/Contents/MacOS/CapsuleSourceValidatorDaemonLauncher", [35464, "4bc270c84f166dfb077d84458940411073f3c70a7f70db2e4af48601500b36cc"]],
  ["mjs-source-validator-r2/dist/CapsuleSourceValidatorDaemon.xpc/Contents/Resources/capsule-mjs-source-validator-daemon", [1146560, "f54c349e3a61b06e0b4d482bc1ed28924ffe712a7ff2531f504e7b57917defc7"]],
  ["mjs-source-validator-r2/dist/CapsuleSourceValidatorBroker.xpc/Contents/MacOS/CapsuleSourceValidatorBrokerLauncher", [35464, "81284de5ba54e2288602bee4e9aca4e4513211b560bacfd1286b7ab57c922613"]],
  ["mjs-source-validator-r2/dist/CapsuleSourceValidatorBroker.xpc/Contents/Resources/capsule-mjs-source-validator-approval-broker", [1146560, "7abac7da99f4b9edef77bb5ecfff135e8b752e5ed656664632272079b5408577"]],
  ["macos-i1a-unsigned-app-shell/dist/Capsule.app/Contents/MacOS/Capsule", [59928, "365b8ebb5bb7dbd8823db7cc292c1b5807baa0fda4d09ba2d2905df7bee3cd5f"]],
]);

const crossCopies = new Map([
  ["macos-i1a-unsigned-app-shell/dist/Capsule.app/Contents/Library/Helpers/CapsuleDaemon.app/Contents/XPCServices/CapsuleSourceValidatorDaemon.xpc/Contents/MacOS/CapsuleSourceValidatorDaemonLauncher", "mjs-source-validator-r2/dist/CapsuleSourceValidatorDaemon.xpc/Contents/MacOS/CapsuleSourceValidatorDaemonLauncher"],
  ["macos-i1a-unsigned-app-shell/dist/Capsule.app/Contents/Library/Helpers/CapsuleDaemon.app/Contents/XPCServices/CapsuleSourceValidatorDaemon.xpc/Contents/Resources/capsule-mjs-source-validator-daemon", "mjs-source-validator-r2/dist/CapsuleSourceValidatorDaemon.xpc/Contents/Resources/capsule-mjs-source-validator-daemon"],
  ["macos-i1a-unsigned-app-shell/dist/Capsule.app/Contents/XPCServices/CapsuleSourceValidatorBroker.xpc/Contents/MacOS/CapsuleSourceValidatorBrokerLauncher", "mjs-source-validator-r2/dist/CapsuleSourceValidatorBroker.xpc/Contents/MacOS/CapsuleSourceValidatorBrokerLauncher"],
  ["macos-i1a-unsigned-app-shell/dist/Capsule.app/Contents/XPCServices/CapsuleSourceValidatorBroker.xpc/Contents/Resources/capsule-mjs-source-validator-approval-broker", "mjs-source-validator-r2/dist/CapsuleSourceValidatorBroker.xpc/Contents/Resources/capsule-mjs-source-validator-approval-broker"],
  ["macos-i2b2-unsigned-installation-bundle/dist/Capsule.app/Contents/MacOS/Capsule", "macos-i1a-unsigned-app-shell/dist/Capsule.app/Contents/MacOS/Capsule"],
  ["macos-i2b2-unsigned-installation-bundle/dist/Capsule.app/Contents/Library/Helpers/CapsuleDaemon.app/Contents/XPCServices/CapsuleSourceValidatorDaemon.xpc/Contents/MacOS/CapsuleSourceValidatorDaemonLauncher", "mjs-source-validator-r2/dist/CapsuleSourceValidatorDaemon.xpc/Contents/MacOS/CapsuleSourceValidatorDaemonLauncher"],
  ["macos-i2b2-unsigned-installation-bundle/dist/Capsule.app/Contents/Library/Helpers/CapsuleDaemon.app/Contents/XPCServices/CapsuleSourceValidatorDaemon.xpc/Contents/Resources/capsule-mjs-source-validator-daemon", "mjs-source-validator-r2/dist/CapsuleSourceValidatorDaemon.xpc/Contents/Resources/capsule-mjs-source-validator-daemon"],
  ["macos-i2b2-unsigned-installation-bundle/dist/Capsule.app/Contents/XPCServices/CapsuleSourceValidatorBroker.xpc/Contents/MacOS/CapsuleSourceValidatorBrokerLauncher", "mjs-source-validator-r2/dist/CapsuleSourceValidatorBroker.xpc/Contents/MacOS/CapsuleSourceValidatorBrokerLauncher"],
  ["macos-i2b2-unsigned-installation-bundle/dist/Capsule.app/Contents/XPCServices/CapsuleSourceValidatorBroker.xpc/Contents/Resources/capsule-mjs-source-validator-approval-broker", "mjs-source-validator-r2/dist/CapsuleSourceValidatorBroker.xpc/Contents/Resources/capsule-mjs-source-validator-approval-broker"],
]);

const policyCopies = new Map([
  ["macos-i1a-unsigned-app-shell/dist/Capsule.app/Contents/Library/Helpers/CapsuleDaemon.app/Contents/XPCServices/CapsuleSourceValidatorDaemon.xpc/Contents/Resources/resource-policy-inactive.bin", "mjs-source-validator-r2/dist/CapsuleSourceValidatorDaemon.xpc/Contents/Resources/resource-policy-inactive.bin"],
  ["macos-i1a-unsigned-app-shell/dist/Capsule.app/Contents/XPCServices/CapsuleSourceValidatorBroker.xpc/Contents/Resources/resource-policy-inactive.bin", "mjs-source-validator-r2/dist/CapsuleSourceValidatorBroker.xpc/Contents/Resources/resource-policy-inactive.bin"],
  ["macos-i2b2-unsigned-installation-bundle/dist/Capsule.app/Contents/Library/Helpers/CapsuleDaemon.app/Contents/XPCServices/CapsuleSourceValidatorDaemon.xpc/Contents/Resources/resource-policy-inactive.bin", "mjs-source-validator-r2/dist/CapsuleSourceValidatorDaemon.xpc/Contents/Resources/resource-policy-inactive.bin"],
  ["macos-i2b2-unsigned-installation-bundle/dist/Capsule.app/Contents/XPCServices/CapsuleSourceValidatorBroker.xpc/Contents/Resources/resource-policy-inactive.bin", "mjs-source-validator-r2/dist/CapsuleSourceValidatorBroker.xpc/Contents/Resources/resource-policy-inactive.bin"],
]);

async function verifyPayloadClosure() {
  for (const [path, [bytes, digest]] of expectedMachO) {
    const fullPath = join(payloadRoot, path);
    const stat = await lstat(fullPath);
    assert.equal(stat.isFile(), true, `${path}: missing compiled payload`);
    assert.equal(stat.size, bytes, `${path}: byte length changed`);
    assert.notEqual(stat.mode & 0o111, 0, `${path}: executable mode missing`);
    assert.equal(await sha256(fullPath), digest, `${path}: payload digest changed`);
  }
  for (const [copy, source] of [...crossCopies, ...policyCopies]) {
    const copyPath = join(payloadRoot, copy);
    const sourcePath = join(payloadRoot, source);
    assert.equal(await sha256(copyPath), await sha256(sourcePath), `${copy}: cross-artifact copy changed`);
    assert.equal((await lstat(copyPath)).size, (await lstat(sourcePath)).size, `${copy}: cross-artifact length changed`);
  }
  const r3 = JSON.parse(await readFile(join(payloadRoot, "macos-i1b-r3-signed-development-composition/evidence/signed-enrollment.json"), "utf8"));
  assert.equal(r3.status, "PASSED");
  assert.equal(r3.developerIdUsed, false);
  assert.equal(r3.notarizationUsed, false);
  assert.equal(r3.signedComponents.length, 7);
  assert.equal(r3.signedComponents.every((item) => /^[0-9a-f]{64}$/.test(item.signedExecutableSha256)), true);
  const r3RootEntries = await readdir(join(payloadRoot, "macos-i1b-r3-signed-development-composition"));
  assert.equal(r3RootEntries.includes("dist"), false, "R3 signed payloads were not tracked and must not be invented");
  assert.equal(expectedMachO.size + crossCopies.size, 15, "tracked Mach-O placement closure changed");
}

const entries = await inventory();
if (process.argv.includes("--write")) {
  await writeFile(join(archiveRoot, "SOURCE_FILES.txt"), sourceFilesBytes(entries));
  await writeFile(join(archiveRoot, "SHA256SUMS"), sha256SumsBytes(entries));
}

assert.equal(await readFile(join(archiveRoot, "SOURCE_FILES.txt"), "utf8"), sourceFilesBytes(entries), "SOURCE_FILES.txt changed or inventory is open");
assert.equal(await readFile(join(archiveRoot, "SHA256SUMS"), "utf8"), sha256SumsBytes(entries), "SHA256SUMS changed or payload bytes changed");
assert.equal(entries.length, 210, "copied file count changed");
await verifyPayloadClosure();

console.log(`verified ${entries.length} copied files, 15 Mach-O placements, six unique compiled identities, V2's V1-dependent harness, and closed cross-artifact copies`);
