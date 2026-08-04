import { spawn } from "node:child_process";
import { lookup } from "node:dns/promises";
import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { Socket } from "node:net";

const mode = process.argv[2] ?? "baseline";

function read(path: string): string {
  try {
    return readFileSync(path, "utf8").trim();
  } catch (error) {
    return `unavailable:${String(error)}`;
  }
}

function statusValue(name: string): string {
  const line = read("/proc/self/status")
    .split("\n")
    .find((candidate) => candidate.startsWith(`${name}:`));
  return line?.slice(line.indexOf(":") + 1).trim() ?? "missing";
}

function emit(value: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function tcpProbe(): Promise<string> {
  return await new Promise((resolve) => {
    const socket = new Socket();
    const finish = (result: string) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1_000, () => finish("timeout"));
    socket.once("error", (error) => finish(`denied:${error.code ?? error.message}`));
    socket.connect(443, "1.1.1.1", () => finish("connected"));
  });
}

async function dnsProbe(): Promise<string> {
  try {
    await Promise.race([
      lookup("example.com"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 1_000)),
    ]);
    return "resolved";
  } catch (error) {
    return `denied:${String(error)}`;
  }
}

function usageUsec(): number {
  const line = read("/sys/fs/cgroup/cpu.stat")
    .split("\n")
    .find((candidate) => candidate.startsWith("usage_usec "));
  return Number(line?.split(/\s+/)[1] ?? 0);
}

async function runBaseline(): Promise<void> {
  let rootWrite = "allowed";
  try {
    writeFileSync("/capsule-root-write", "unexpected");
    unlinkSync("/capsule-root-write");
  } catch (error) {
    rootWrite = `denied:${(error as NodeJS.ErrnoException).code ?? String(error)}`;
  }

  emit({
    mode,
    uid: process.getuid?.(),
    gid: process.getgid?.(),
    noNewPrivs: statusValue("NoNewPrivs"),
    capEff: statusValue("CapEff"),
    capPrm: statusValue("CapPrm"),
    rootWrite,
    memoryMax: read("/sys/fs/cgroup/memory.max"),
    pidsMax: read("/sys/fs/cgroup/pids.max"),
    cpuMax: read("/sys/fs/cgroup/cpu.max"),
    interfaces: read("/proc/net/dev"),
    ipv4Routes: read("/proc/net/route"),
    unixSockets: read("/proc/net/unix"),
  });
}

async function runNetwork(): Promise<void> {
  emit({
    mode,
    tcp: await tcpProbe(),
    dns: await dnsProbe(),
    interfaces: read("/proc/net/dev"),
    ipv4Routes: read("/proc/net/route"),
  });
}

async function runStorage(): Promise<void> {
  const block = Buffer.alloc(64 * 1024, 0x41);
  let written = 0;
  let result = "completed";
  const fd = openSync("/output/blob", "w");
  try {
    while (written < 2 * 1024 * 1024) {
      written += writeSync(fd, block);
    }
  } catch (error) {
    result = `denied:${(error as NodeJS.ErrnoException).code ?? String(error)}`;
  } finally {
    closeSync(fd);
  }
  emit({ mode, written, result });
}

async function runCpu(): Promise<void> {
  const before = usageUsec();
  const started = performance.now();
  while (performance.now() - started < 1_500) {
    Math.sqrt(Math.random());
  }
  emit({
    mode,
    wallMillis: Math.round(performance.now() - started),
    usageUsec: usageUsec() - before,
    cpuMax: read("/sys/fs/cgroup/cpu.max"),
  });
}

async function runMemory(): Promise<void> {
  const retained: Uint8Array[] = [];
  for (let index = 0; index < 256; index += 1) {
    const value = new Uint8Array(4 * 1024 * 1024);
    for (let offset = 0; offset < value.length; offset += 4096) value[offset] = 0x5a;
    retained.push(value);
    if (index % 8 === 0) emit({ mode, allocatedMiB: (index + 1) * 4 });
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  emit({ mode, unexpectedCompletionMiB: retained.length * 4 });
}

async function runOutput(): Promise<void> {
  const block = "X".repeat(4096);
  for (let index = 0; index < 128; index += 1) process.stdout.write(block);
}

async function runStubborn(): Promise<void> {
  const child = spawn("/bin/sh", ["-c", "trap '' TERM INT; while :; do sleep 1; done"], {
    stdio: "ignore",
  });
  process.on("SIGTERM", () => undefined);
  emit({ mode, pid: process.pid, childPid: child.pid });
  await new Promise(() => undefined);
}

switch (mode) {
  case "baseline":
    await runBaseline();
    break;
  case "network":
    await runNetwork();
    break;
  case "storage":
    await runStorage();
    break;
  case "cpu":
    await runCpu();
    break;
  case "memory":
    await runMemory();
    break;
  case "output":
    await runOutput();
    break;
  case "stubborn":
    await runStubborn();
    break;
  default:
    throw new Error(`unknown probe mode: ${mode}`);
}
