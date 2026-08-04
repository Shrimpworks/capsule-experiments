// DEVELOPMENT-ONLY hostile fixture for Gate C P0-0. Product packages must not import it.
import { readFileSync } from "node:fs";

const results: Record<string, string> = {};

try {
  const result = Bun.spawnSync(["/bin/echo", "worker-spawn"]);
  results.spawn = `${result.exitCode}:${result.stdout.toString().trim()}`;
} catch (error) {
  results.spawn = `refused:${error}`;
}

try {
  const { dlopen } = await import("bun:ffi");
  const libc = dlopen("libc.so.6", { getpid: { args: [], returns: "int" } });
  try {
    results.ffi = String(libc.symbols.getpid());
  } finally {
    libc.close();
  }
} catch (error) {
  results.ffi = `refused:${error}`;
}

try {
  results.fd3 = readFileSync("/proc/self/fd/3", "utf8").trim();
} catch (error) {
  results.fd3 = `refused:${error}`;
}

postMessage(results);
