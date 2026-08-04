import { spawn, spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = resolve(root, "fixtures", "cases", "allow-cap-exact.mjs");
const bins = {
  oxc: resolve(root, "target", "release", "capsule-mjs-oxc-probe"),
  denoAst: resolve(root, "target", "release", "capsule-mjs-deno-ast-probe"),
  treeSitter: resolve(root, "target", "release", "capsule-mjs-tree-sitter-control"),
  v8: resolve(root, "target", "release", "capsule-mjs-v8-compile-control"),
};

const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
};

function timed(binary, paths) {
  const start = performance.now();
  const result = spawnSync(binary, paths, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const elapsed = performance.now() - start;
  if (result.status !== 0) throw new Error(`${binary} failed: ${result.stderr}`);
  return elapsed;
}

function memory(binary) {
  const result = spawnSync("/usr/bin/time", ["-lp", binary, fixture], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`time failed: ${result.stderr}`);
  return {
    maximumResidentBytes: Number(result.stderr.match(/\s(\d+)\s+maximum resident set size/)?.[1]),
    peakMemoryFootprintBytes: Number(result.stderr.match(/\s(\d+)\s+peak memory footprint/)?.[1]),
    raw: result.stderr,
  };
}

async function fault(binary, option) {
  const start = performance.now();
  const child = spawn(binary, [option], { stdio: "ignore" });
  let killedByDeadline = false;
  const timer = setTimeout(() => {
    killedByDeadline = child.kill("SIGKILL");
  }, 100);
  const close = await new Promise((done) =>
    child.on("close", (code, signal) => done({ code, signal })),
  );
  clearTimeout(timer);
  return { ...close, killedByDeadline, elapsedMs: performance.now() - start };
}

const result = {};
for (const [name, binary] of Object.entries(bins)) {
  const cold = Array.from({ length: 20 }, () => timed(binary, [fixture]));
  const warm = Array.from({ length: 10 }, () => timed(binary, Array(20).fill(fixture)) / 20);
  result[name] = {
    inputBytes: 262_144,
    coldProcessMs: { median: percentile(cold, 0.5), p95: percentile(cold, 0.95) },
    warmAmortizedMs: { median: percentile(warm, 0.5), p95: percentile(warm, 0.95) },
    memory: memory(binary),
    hangFault: await fault(binary, "--fault=hang"),
    abortFault: await fault(binary, "--fault=abort"),
  };
}
await writeFile(
  resolve(root, "evidence", "measurements.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(JSON.stringify(result, null, 2));
