// DEVELOPMENT-ONLY hostile fixture for Gate C P0-0. Product packages must not import it.
import { Database } from "bun:sqlite";
import { execFileSync, spawnSync as nodeSpawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { $ } from "bun";

type Observation = {
  name: string;
  status: "available" | "refused" | "error";
  detail: string;
};

const observations: Observation[] = [];

async function observe(name: string, action: () => unknown | Promise<unknown>) {
  try {
    const value = await action();
    observations.push({ name, status: "available", detail: String(value) });
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    observations.push({
      name,
      status: /disabled|Cannot find package/u.test(detail) ? "refused" : "error",
      detail,
    });
  }
}

await observe("bun.spawn.direct", async () => {
  const child = Bun.spawn(["/bin/echo", "bun-spawn-direct"], { stdout: "pipe", stderr: "pipe" });
  const output = await new Response(child.stdout).text();
  const exit = await child.exited;
  return `${exit}:${output.trim()}`;
});

await observe("bun.spawn.alias", () => {
  const spawnAlias = Bun.spawnSync;
  const result = spawnAlias(["/bin/echo", "bun-spawn-alias"]);
  return `${result.exitCode}:${result.stdout.toString().trim()}`;
});

await observe("node.child_process.direct", () => {
  return execFileSync("/bin/echo", ["node-child-direct"], { encoding: "utf8" }).trim();
});

await observe("node.child_process.alias", () => {
  const spawnAlias = nodeSpawnSync;
  const result = spawnAlias("/bin/echo", ["node-child-alias"], { encoding: "utf8" });
  return `${result.status}:${result.stdout.trim()}`;
});

await observe("bun.shell", async () => {
  const result = await $`/bin/echo bun-shell`.quiet();
  return `${result.exitCode}:${result.stdout.toString().trim()}`;
});

await observe("bun.ffi.direct", async () => {
  const { dlopen } = await import("bun:ffi");
  const libc = dlopen("libc.so.6", { getpid: { args: [], returns: "int" } });
  try {
    return libc.symbols.getpid();
  } finally {
    libc.close();
  }
});

await observe("bun.ffi.alias", async () => {
  const ffi = await import("bun:ffi");
  const loadAlias = ffi.dlopen;
  const libc = loadAlias("libc.so.6", { getppid: { args: [], returns: "int" } });
  try {
    return libc.symbols.getppid();
  } finally {
    libc.close();
  }
});

await observe("bun.ffi.cc", async () => {
  const { cc } = await import("bun:ffi");
  const library = cc({
    source: "./native-marker.c",
    symbols: { capsule_native_marker: { args: [], returns: "int" } },
  });
  try {
    return library.symbols.capsule_native_marker();
  } finally {
    library.close();
  }
});

await observe("process.dlopen", () => {
  const moduleRecord = { exports: {} };
  try {
    process.dlopen(moduleRecord, "libc.so.6");
    return "loaded";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/disabled/u.test(message)) throw error;
    return `loader-reached:${message}`;
  }
});

await observe("sqlite.loadExtension", () => {
  const database = new Database(":memory:");
  try {
    database.loadExtension("libc.so.6");
    return "loaded";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `loader-reached:${message}`;
  } finally {
    database.close();
  }
});

await observe("inspector.bun_jsc", async () => {
  const { startRemoteDebugger } = await import("bun:jsc");
  startRemoteDebugger("127.0.0.1", 39230);
  return "listener-started:127.0.0.1:39230";
});

await observe("macro.registration", () => typeof Bun.registerMacro);

await observe("dynamic.local_package", async () => {
  const module = await import("capsule-local-probe");
  return module.default;
});

await observe("dynamic.missing_package", async () => {
  await import("left-pad");
  return "unexpectedly-loaded";
});

await observe("descriptor.main", () => readFileSync("/proc/self/fd/3", "utf8").trim());

await observe("worker.capabilities_and_descriptor", async () => {
  const worker = new Worker(new URL("./worker-probe.ts", import.meta.url).href);
  return await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("worker timed out"));
    }, 5_000);
    worker.onmessage = (event) => {
      clearTimeout(timer);
      resolve(JSON.stringify(event.data));
    };
    worker.onerror = (event) => {
      clearTimeout(timer);
      reject(event.error ?? new Error(event.message));
    };
  });
});

console.log(
  JSON.stringify(
    {
      bunVersion: Bun.version,
      bunRevision: Bun.revision,
      argv: process.execArgv,
      uid: process.getuid?.(),
      gid: process.getgid?.(),
      observations,
    },
    null,
    2,
  ),
);

process.exit(0);
