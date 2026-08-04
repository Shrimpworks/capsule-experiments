import { spawnSync } from "node:child_process";
import fs from "node:fs";

if (process.argv.length !== 5) {
  console.error("usage: node measure-startup.mjs IMAGE OUTPUT COUNT");
  process.exit(2);
}
const [image, output, countText] = process.argv.slice(2);
const count = Number(countText);
const samples = [];
for (let index = 0; index < count; index += 1) {
  const start = process.hrtime.bigint();
  const result = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "--platform",
      "linux/arm64",
      "--network",
      "none",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges:true",
      "--pids-limit",
      "32",
      "--memory",
      "512m",
      "--cpus",
      "1",
      "--entrypoint",
      "/lib/ld-linux-aarch64.so.1",
      image,
      "--inhibit-cache",
      "--library-path",
      "/lib/aarch64-linux-gnu",
      "/bin/capsule-deno-core-physical-omission",
      "--source",
      "/fixtures/nominal.js",
      "--input",
      "/fixtures/input.json",
    ],
    { encoding: "utf8" },
  );
  const elapsed = Number(process.hrtime.bigint() - start);
  if (
    result.status !== 0 ||
    result.stdout.trim() !== '{"count":3,"label":"capsule-owned","sum":6}'
  ) {
    throw new Error(`startup sample failed: ${result.status} ${result.stderr}`);
  }
  samples.push(elapsed);
}
const sorted = [...samples].sort((a, b) => a - b);
const mean = Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length);
const lines = [
  "date=2026-08-03",
  "measurement=host-observed docker CLI plus fresh scratch-container plus governed process start and fixed fixture",
  "environment=owned Apple M1 Max; Docker Desktop 4.81.0; LinuxKit 6.12.76; native Linux/arm64; sequential",
  "limitation=supporting same-host warm-cache measurement; not libkrun, cold-host, guest, or production latency",
  ...samples.map((value, index) => `sample.${index + 1}.ns=${value}`),
  `count=${samples.length}`,
  `min.ns=${sorted[0]}`,
  `p50.ns=${sorted[Math.floor((sorted.length - 1) / 2)]}`,
  `mean.ns=${mean}`,
  `max.ns=${sorted[sorted.length - 1]}`,
];
fs.writeFileSync(output, `${lines.join("\n")}\n`);
