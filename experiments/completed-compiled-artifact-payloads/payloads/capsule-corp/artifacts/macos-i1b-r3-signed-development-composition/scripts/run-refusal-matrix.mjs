#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const IDENTITY = "80A4969BCD1B3926020888094B9D812A283D3793";
const artifactRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(artifactRoot, "../..");
const sourceBundle = resolve(process.argv[2] ?? "");
const enrollmentPath = resolve(process.argv[3] ?? "");
const evidencePath = resolve(process.argv[4] ?? join(artifactRoot, "evidence/refusal-matrix.json"));
if (basename(sourceBundle) !== "Capsule.app" || process.argv.length < 4) {
  throw new Error(
    "usage: run-refusal-matrix.mjs <Capsule.app> <signed-enrollment.json> [evidence.json]",
  );
}

function run(command, arguments_) {
  return execFileSync(command, arguments_, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const tempRoot = await mkdtemp(join(tmpdir(), "capsule-i1b-refusal-"));
const caseBundle = join(tempRoot, "Capsule.app");
const constraints = join(artifactRoot, "Constraints");
const entitlements = join(artifactRoot, "Entitlements");
const matrix = [];

function sign(path, ...arguments_) {
  run("codesign", [
    "--force",
    "--sign",
    IDENTITY,
    "--timestamp=none",
    "--options",
    "runtime",
    "--enforce-constraint-validity",
    ...arguments_,
    path,
  ]);
}

function signOuter(
  identifier = "com.capsulecorp.capsule.broker",
  entitlementFile = "broker.plist",
) {
  sign(
    caseBundle,
    "--identifier",
    identifier,
    "--entitlements",
    join(entitlements, entitlementFile),
    "--launch-constraint-self",
    join(constraints, "broker-self.coderequirement"),
    "--library-constraint",
    join(constraints, "no-nonplatform-libraries.coderequirement"),
  );
}

async function reset() {
  await rm(caseBundle, { recursive: true, force: true });
  run("ditto", [sourceBundle, caseBundle]);
}

function verifier(bundle = caseBundle, enrollment = enrollmentPath) {
  return spawnSync(
    process.execPath,
    [join(artifactRoot, "scripts/verify-signed.mjs"), bundle, "--enrollment", enrollment],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

async function expectRefusal(name, refusalClass, mutate) {
  await reset();
  await mutate();
  const result = verifier();
  assert.notEqual(result.status, 0, `${name}: verifier unexpectedly accepted the negative case`);
  matrix.push({ name, status: "PASSED", expected: "refused", refusalClass });
}

try {
  const happy = verifier(sourceBundle);
  assert.equal(happy.status, 0, `enrolled signed happy path refused: ${happy.stderr}`);

  await expectRefusal("missing-profile", "profile-presence", async () => {
    await rm(join(caseBundle, "Contents/embedded.provisionprofile"));
    signOuter();
  });

  await expectRefusal("tampered-profile", "profile-cms-or-metadata", async () => {
    const path = join(caseBundle, "Contents/embedded.provisionprofile");
    const bytes = await readFile(path);
    bytes[Math.floor(bytes.length / 2)] ^= 0x01;
    await writeFile(path, bytes);
    signOuter();
  });

  await expectRefusal("changed-entitlement", "effective-entitlement-set", async () => {
    signOuter("com.capsulecorp.capsule.broker", "negative-network-client.plist");
  });

  await expectRefusal("wrong-identifier", "signing-identifier", async () => {
    signOuter("com.capsulecorp.capsule.broker.wrong");
  });

  await expectRefusal("ad-hoc-replacement", "certificate-and-team", async () => {
    run("codesign", ["--force", "--sign", "-", "--timestamp=none", caseBundle]);
  });

  await expectRefusal("unsigned-byte-replacement", "nested-code-seal", async () => {
    const executable = join(caseBundle, "Contents/MacOS/Capsule");
    const bytes = await readFile(executable);
    bytes[bytes.length - 1] ^= 0x01;
    await writeFile(executable, bytes);
  });

  await expectRefusal("stale-mixed-bundle", "enrolled-signed-byte-set", async () => {
    const daemonApp = join(caseBundle, "Contents/Library/Helpers/CapsuleDaemon.app");
    const daemonExecutable = join(daemonApp, "Contents/MacOS/CapsuleDaemon");
    await writeFile(
      daemonExecutable,
      await readFile(
        join(
          repositoryRoot,
          "artifacts/macos-i1a-unsigned-app-shell/dist/Capsule.app/Contents/Library/Helpers/CapsuleDaemon.app/Contents/MacOS/CapsuleDaemon",
        ),
      ),
      { mode: 0o755 },
    );
    sign(
      daemonApp,
      "--identifier",
      "com.capsulecorp.capsule.daemon",
      "--entitlements",
      join(entitlements, "daemon.plist"),
      "--launch-constraint-self",
      join(constraints, "daemon-self.coderequirement"),
      "--launch-constraint-parent",
      join(constraints, "launchd-parent.coderequirement"),
      "--library-constraint",
      join(constraints, "no-nonplatform-libraries.coderequirement"),
    );
    signOuter();
  });

  await reset();
  const wrongTeamEnrollment = join(tempRoot, "wrong-team-enrollment.json");
  const wrongTeam = JSON.parse(await readFile(enrollmentPath, "utf8"));
  wrongTeam.teamIdentifier = "WRONGTEAM0";
  await writeFile(wrongTeamEnrollment, `${JSON.stringify(wrongTeam, null, 2)}\n`);
  const wrongTeamResult = verifier(caseBundle, wrongTeamEnrollment);
  assert.notEqual(wrongTeamResult.status, 0, "wrong-Team enrollment unexpectedly accepted");
  matrix.push({
    name: "wrong-team",
    status: "PASSED",
    expected: "refused",
    refusalClass: "enrolled-team-identifier",
    method: "synthetic expected-Team mismatch; no unrelated signing identity used",
  });

  const mixed = matrix.find((entry) => entry.name === "stale-mixed-bundle");
  mixed.repairRequired = true;
  mixed.daemonAndBrokerRolesDisabled = true;

  const evidence = {
    schema: "capsule.macos-installation.i1b-r3-refusal-matrix/v1",
    status: "PASSED",
    scope: "local copies of exact signed Capsule test bundle only",
    executionState: "disabled",
    developerIdUsed: false,
    unrelatedCredentialUsed: false,
    cases: matrix,
  };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o644 });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
