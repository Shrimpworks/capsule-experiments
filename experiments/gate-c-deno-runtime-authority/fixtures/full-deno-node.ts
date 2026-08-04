import { spawnSync as aliasedSpawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as inspector from "node:inspector";
import process from "node:process";
import { Worker as NodeWorker } from "node:worker_threads";

const attempts: Record<string, string> = {};

function capture(name: string, operation: () => unknown) {
  try {
    const value = operation();
    attempts[name] = `allowed:${String(value)}`;
  } catch (error) {
    attempts[name] =
      `denied:${error instanceof Error ? `${error.name}:${error.message}` : typeof error}`;
  }
}

capture("node-child-process-alias", () => aliasedSpawnSync("/bin/echo", ["probe"]).status);
capture("node-fs-read", () => fs.readFileSync("/etc/hostname", "utf8"));
capture("node-fs-write", () => fs.writeFileSync("/work/probe", "x"));
capture("node-process-load-env", () => process.loadEnvFile("/fixtures/dot-env"));
capture("node-inspector-open", () => {
  inspector.open(0, "127.0.0.1", false);
  const url = inspector.url();
  inspector.close();
  return url ? "listener-opened" : "no-url";
});
capture("node-worker", () => {
  const worker = new NodeWorker("", { eval: true });
  return worker.terminate();
});
capture("process-binding-fs", () => typeof process.binding("fs"));
capture("process-dlopen-native-addon", () => process.dlopen({}, "/fixtures/fake.node"));

console.log(JSON.stringify(attempts, null, 2));
