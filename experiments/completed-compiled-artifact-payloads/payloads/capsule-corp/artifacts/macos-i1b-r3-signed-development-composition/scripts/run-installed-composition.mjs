#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { lstat, mkdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const artifactRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceBundle = resolve(process.argv[2] ?? "");
const enrollment = resolve(process.argv[3] ?? "");
const evidencePath = resolve(
  process.argv[4] ?? join(artifactRoot, "evidence/installed-composition.json"),
);
if (basename(sourceBundle) !== "Capsule.app" || process.argv.length < 4) {
  throw new Error(
    "usage: run-installed-composition.mjs <Capsule.app> <signed-enrollment.json> [evidence.json]",
  );
}

const installPath = "/Users/dsteele/Applications/Capsule.app";
const userDomain = `gui/${process.getuid()}`;
const serviceLabels = ["com.capsulecorp.capsule.daemon", "com.capsulecorp.capsule.supervisor"];
const containerIdentifiers = [
  "com.capsulecorp.capsule.broker",
  "com.capsulecorp.capsule.daemon",
  "com.capsulecorp.capsule.supervisor",
  "com.capsulecorp.capsule.source-validator.daemon.v1",
  "com.capsulecorp.capsule.source-validator.approval-broker.v1",
  "com.capsulecorp.capsule.source-validator-parser.daemon.v1",
  "com.capsulecorp.capsule.source-validator-parser.approval-broker.v1",
];
const containerPaths = containerIdentifiers.map((identifier) =>
  join("/Users/dsteele/Library/Containers", identifier),
);
const processPaths = [
  join(installPath, "Contents/MacOS/Capsule"),
  join(installPath, "Contents/Library/Helpers/CapsuleDaemon.app/Contents/MacOS/CapsuleDaemon"),
  join(
    installPath,
    "Contents/Library/Helpers/CapsuleSupervisor.app/Contents/MacOS/CapsuleSupervisor",
  ),
  join(
    installPath,
    "Contents/Library/Helpers/CapsuleDaemon.app/Contents/XPCServices/CapsuleSourceValidatorDaemon.xpc/Contents/MacOS/CapsuleSourceValidatorDaemonLauncher",
  ),
  join(
    installPath,
    "Contents/XPCServices/CapsuleSourceValidatorBroker.xpc/Contents/MacOS/CapsuleSourceValidatorBrokerLauncher",
  ),
  join(
    installPath,
    "Contents/Library/Helpers/CapsuleDaemon.app/Contents/XPCServices/CapsuleSourceValidatorDaemon.xpc/Contents/Resources/capsule-mjs-source-validator-daemon",
  ),
  join(
    installPath,
    "Contents/XPCServices/CapsuleSourceValidatorBroker.xpc/Contents/Resources/capsule-mjs-source-validator-approval-broker",
  ),
];

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function call(command, arguments_, allowFailure = false) {
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(
      `${command} refused (${result.status}): ${(result.stderr || result.stdout).trim()}`,
    );
  }
  return result;
}

function jsonCommand(command, arguments_) {
  return JSON.parse(call(command, arguments_).stdout.trim());
}

function serviceRegistered(label) {
  return call("launchctl", ["print", `${userDomain}/${label}`], true).status === 0;
}

function serviceReadback(label) {
  const output = call("launchctl", ["print", `${userDomain}/${label}`]).stdout;
  const lastExit = output.match(/^\s*last exit code = (-?\d+)\s*$/m);
  return {
    registered: true,
    lastExitCode: lastExit ? Number(lastExit[1]) : null,
  };
}

function matchingProcesses() {
  const output = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
  const matches = [];
  for (const line of output.split("\n")) {
    const match = line.match(/^\s*(\d+)\s+(.+)$/);
    if (!match) continue;
    for (const executable of processPaths) {
      if (match[2] === executable || match[2].startsWith(`${executable} `)) {
        matches.push({ pid: Number(match[1]), executable });
      }
    }
  }
  return matches;
}

async function waitFor(predicate, timeoutMilliseconds) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  return false;
}

const containersBefore = Object.fromEntries(
  await Promise.all(containerPaths.map(async (path) => [path, await exists(path)])),
);
const servicesBefore = Object.fromEntries(
  serviceLabels.map((label) => [label, serviceRegistered(label)]),
);
const processesBefore = matchingProcesses();
assert.equal(await exists(installPath), false, `${installPath}: pre-existing install refused`);
assert.deepEqual(servicesBefore, {
  "com.capsulecorp.capsule.daemon": false,
  "com.capsulecorp.capsule.supervisor": false,
});
assert.deepEqual(processesBefore, []);

let installed = false;
let workStatus = "IN_PROGRESS — TRENDING_GOOD";
let blocker;
const observations = {};
try {
  await mkdir(dirname(installPath), { recursive: true });
  call("ditto", [sourceBundle, installPath]);
  installed = true;
  call(process.execPath, [
    join(artifactRoot, "scripts/verify-signed.mjs"),
    installPath,
    "--enrollment",
    enrollment,
  ]);

  const broker = join(installPath, "Contents/MacOS/Capsule");
  observations.brokerStatus = jsonCommand(broker, ["--print-disabled-status"]);
  assert.equal(observations.brokerStatus.execution, "disabled");
  assert.equal(observations.brokerStatus.privateScratchCleanup, "passed");

  call("open", ["-n", installPath]);
  const appStarted = await waitFor(
    () => matchingProcesses().some((process) => process.executable === broker),
    5000,
  );
  assert.equal(appStarted, true, "containing status app did not start");
  observations.statusAppStarted = true;
  for (const entry of matchingProcesses().filter((entry) => entry.executable === broker)) {
    process.kill(entry.pid, "SIGTERM");
  }
  assert.equal(
    await waitFor(
      () => !matchingProcesses().some((process) => process.executable === broker),
      5000,
    ),
    true,
    "status app did not stop",
  );

  observations.registration = jsonCommand(broker, ["--register-services"]);
  if (
    observations.registration.daemon === "requires-approval" ||
    observations.registration.supervisor === "requires-approval"
  ) {
    workStatus = "BLOCKED";
    blocker = "macOS Login Items approval required for exact per-user SMAppService agents";
  } else {
    assert.equal(observations.registration.daemon, "enabled");
    assert.equal(observations.registration.supervisor, "enabled");
    observations.serviceStatus = jsonCommand(broker, ["--service-status"]);

    for (const label of serviceLabels) {
      call("launchctl", ["kickstart", `${userDomain}/${label}`]);
    }
    assert.equal(
      await waitFor(
        () => serviceLabels.every((label) => serviceReadback(label).lastExitCode !== null),
        5000,
      ),
      true,
      "registered services did not publish an exit result",
    );
    observations.registeredServiceLaunch = Object.fromEntries(
      serviceLabels.map((label) => [label, serviceReadback(label)]),
    );
    assert.equal(
      await waitFor(() => matchingProcesses().length === 0, 5000),
      true,
      "registered service processes did not exit",
    );
    assert.equal(
      observations.registeredServiceLaunch["com.capsulecorp.capsule.daemon"].lastExitCode,
      0,
      "daemon's closed private-validator matrix refused",
    );
    assert.equal(
      observations.registeredServiceLaunch["com.capsulecorp.capsule.supervisor"].lastExitCode,
      0,
      "Supervisor placeholder launch refused",
    );

    observations.brokerPrivateValidator = jsonCommand(broker, ["--probe-source-validator"]);
    for (const result of [observations.brokerPrivateValidator]) {
      assert.equal(
        ["connection-invalid", "connection-interrupted"].includes(result.own_service_cold_start),
        true,
      );
      assert.equal(result.own_service, "connection-interrupted");
      assert.equal(result.wrong_method, "connection-interrupted");
      assert.equal(result.tampered_request, "connection-interrupted");
      assert.equal(result.wrong_service, "connection-invalid");
      assert.equal(result.parser_spawn, "prohibited-by-inactive-policy");
      assert.equal(result.execution, "disabled");
    }
    observations.daemonPrivateValidator = {
      evidence:
        "signed daemon exits zero only after private-scratch cleanup and own/cross-role/method/tamper closed matrix",
      lastExitCode:
        observations.registeredServiceLaunch["com.capsulecorp.capsule.daemon"].lastExitCode,
    };
    await waitFor(() => matchingProcesses().length === 0, 5000);
    observations.processesAfterProbes = matchingProcesses();
    assert.deepEqual(observations.processesAfterProbes, []);
    workStatus = "PASSED";
  }
} catch (error) {
  if (workStatus !== "BLOCKED") {
    workStatus = "NO_GO";
    blocker =
      "the exact installed role-private composition refused; no shared/global fallback attempted";
  }
  observations.refusal = {
    name: error.name,
    message: error.message,
  };
} finally {
  if (installed) {
    const broker = join(installPath, "Contents/MacOS/Capsule");
    if (await exists(broker)) call(broker, ["--unregister-services"], true);
    for (const entry of matchingProcesses()) {
      process.kill(entry.pid, "SIGTERM");
    }
    await waitFor(() => matchingProcesses().length === 0, 5000);
    await rm(installPath, { recursive: true, force: true });
  }
}

await waitFor(() => serviceLabels.every((label) => !serviceRegistered(label)), 5000);

const servicesAfter = Object.fromEntries(
  serviceLabels.map((label) => [label, serviceRegistered(label)]),
);
const processesAfter = matchingProcesses();
const containersAfter = Object.fromEntries(
  await Promise.all(containerPaths.map(async (path) => [path, await exists(path)])),
);
const installRemoved = !(await exists(installPath));
const cleanupPassed =
  installRemoved &&
  JSON.stringify(servicesAfter) === JSON.stringify(servicesBefore) &&
  processesAfter.length === 0 &&
  observations.brokerStatus?.privateScratchCleanup === "passed" &&
  observations.registeredServiceLaunch?.["com.capsulecorp.capsule.daemon"]?.lastExitCode === 0 &&
  observations.registeredServiceLaunch?.["com.capsulecorp.capsule.supervisor"]?.lastExitCode === 0;
if (!cleanupPassed) {
  workStatus = "BLOCKED";
  blocker =
    "mandatory exact install/service/process/non-platform-private-scratch cleanup did not pass";
}

const evidence = {
  schema: "capsule.macos-installation.i1b-r3-installed-composition/v1",
  status: workStatus,
  blocker,
  authorizedEnvironment: "user-owned local Mac; exact Capsule test components only",
  installPath,
  serviceLabels,
  executionState: "disabled",
  attemptsEnabled: false,
  approvalKeyOperation: false,
  authorityStoreMutation: false,
  runtimeAction: false,
  backendAction: false,
  guestAction: false,
  appGroupUsed: false,
  sharedResultCacheContainerUsed: false,
  observations,
  cleanup: {
    status: cleanupPassed ? "PASSED" : "BLOCKED",
    installRemoved,
    servicesBefore,
    servicesAfter,
    processesBefore,
    processesAfter,
    containersBefore,
    containersAfter,
    platformManagedContainerRootsRetained: Object.entries(containersAfter)
      .filter(([, present]) => present)
      .map(([path]) => path),
    nonPlatformPrivateScratch: cleanupPassed ? "removed" : "unproven",
  },
};
await mkdir(dirname(evidencePath), { recursive: true });
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o644 });
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
if (workStatus === "BLOCKED") process.exitCode = 75;
if (workStatus === "NO_GO") process.exitCode = 76;
