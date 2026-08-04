// DEVELOPMENT-ONLY hostile fixture for Gate C. Product packages must not import it.

import { dlopen, FFIType, ptr } from "bun:ffi";
import { createSocket } from "node:dgram";
import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statfsSync,
  writeSync,
} from "node:fs";
import { createConnection, createServer } from "node:net";

type Result = { probe: string; ok: boolean; detail: unknown };

function emit(probe: string, ok: boolean, detail: unknown): void {
  console.log(JSON.stringify({ probe, ok, detail } satisfies Result));
}

function text(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    return `ERROR:${String(error)}`;
  }
}

function fdInventory(): Array<{ fd: string; target: string }> {
  return readdirSync("/proc/self/fd").map((fd) => {
    try {
      return { fd, target: readlinkSync(`/proc/self/fd/${fd}`) };
    } catch (error) {
      return { fd, target: `ERROR:${String(error)}` };
    }
  });
}

async function tcp(host: string, port: number, timeoutMs = 700): Promise<string> {
  return await new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const done = (value: string) => {
      socket.destroy();
      resolve(value);
    };
    socket.once("connect", () => done("connected"));
    socket.once("error", (error) =>
      done(`error:${(error as NodeJS.ErrnoException).code ?? error.message}`),
    );
    socket.setTimeout(timeoutMs, () => done("timeout"));
  });
}

async function dnsUdp(timeoutMs = 700): Promise<string> {
  const query = Buffer.from([
    0x43, 0x43, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x07, 0x65, 0x78, 0x61,
    0x6d, 0x70, 0x6c, 0x65, 0x03, 0x63, 0x6f, 0x6d, 0x00, 0x00, 0x01, 0x00, 0x01,
  ]);
  return await new Promise((resolve) => {
    const socket = createSocket("udp4");
    const timer = setTimeout(() => {
      socket.close();
      resolve("timeout");
    }, timeoutMs);
    socket.once("message", () => {
      clearTimeout(timer);
      socket.close();
      resolve("response");
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      socket.close();
      resolve(`error:${(error as NodeJS.ErrnoException).code ?? error.message}`);
    });
    socket.send(query, 53, "1.1.1.1", (error) => {
      if (error) {
        clearTimeout(timer);
        socket.close();
        resolve(`send-error:${(error as NodeJS.ErrnoException).code ?? error.message}`);
      }
    });
  });
}

async function loopback(): Promise<string> {
  return await new Promise((resolve) => {
    const server = createServer((socket) => socket.end("ok"));
    server.once("error", (error) => resolve(`listen-error:${error.message}`));
    server.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const result =
        typeof address === "object" && address
          ? await tcp("127.0.0.1", address.port)
          : "no-address";
      server.close(() => resolve(result));
    });
  });
}

function vsockConnect(cid: number, port: number): Record<string, number | string> {
  const libc = dlopen("libc.so.6", {
    socket: { args: [FFIType.i32, FFIType.i32, FFIType.i32], returns: FFIType.i32 },
    connect: { args: [FFIType.i32, FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
    close: { args: [FFIType.i32], returns: FFIType.i32 },
    fcntl: { args: [FFIType.i32, FFIType.i32, FFIType.i32], returns: FFIType.i32 },
    poll: { args: [FFIType.ptr, FFIType.u64, FFIType.i32], returns: FFIType.i32 },
    getsockopt: {
      args: [FFIType.i32, FFIType.i32, FFIType.i32, FFIType.ptr, FFIType.ptr],
      returns: FFIType.i32,
    },
  });
  const fd = libc.symbols.socket(40, 1, 0); // AF_VSOCK, SOCK_STREAM
  if (fd < 0) {
    libc.close();
    return { socket: fd, outcome: "socket-failed" };
  }
  libc.symbols.fcntl(fd, 4, 2048); // F_SETFL, O_NONBLOCK
  const address = new Uint8Array(16);
  const addressView = new DataView(address.buffer);
  addressView.setUint16(0, 40, true);
  addressView.setUint32(4, port, true);
  addressView.setUint32(8, cid, true);
  const connectResult = libc.symbols.connect(fd, ptr(address), address.byteLength);
  const pollfd = new Uint8Array(8);
  const pollView = new DataView(pollfd.buffer);
  pollView.setInt32(0, fd, true);
  pollView.setInt16(4, 4, true); // POLLOUT
  const pollResult = libc.symbols.poll(ptr(pollfd), 1, 500);
  const socketError = new Uint8Array(4);
  const socketErrorLength = new Uint8Array(4);
  new DataView(socketErrorLength.buffer).setUint32(0, 4, true);
  const getResult = libc.symbols.getsockopt(fd, 1, 4, ptr(socketError), ptr(socketErrorLength));
  const errno = new DataView(socketError.buffer).getInt32(0, true);
  libc.symbols.close(fd);
  libc.close();
  return {
    socket: fd,
    connectResult,
    pollResult,
    revents: pollView.getInt16(6, true),
    getResult,
    socketError: errno,
    outcome: pollResult > 0 && getResult === 0 && errno === 0 ? "connected" : "not-connected",
  };
}

function vsockLocalCid(): Record<string, number | string> {
  const libc = dlopen("libc.so.6", {
    open: { args: [FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
    ioctl: { args: [FFIType.i32, FFIType.u64, FFIType.ptr], returns: FFIType.i32 },
    close: { args: [FFIType.i32], returns: FFIType.i32 },
  });
  const path = Buffer.from("/dev/vsock\0");
  const fd = libc.symbols.open(ptr(path), 0);
  const value = new Uint8Array(4);
  const ioctlResult = fd >= 0 ? libc.symbols.ioctl(fd, 0x7b9, ptr(value)) : -1;
  const cid = new DataView(value.buffer).getUint32(0, true);
  if (fd >= 0) libc.symbols.close(fd);
  libc.close();
  return { fd, ioctlResult, cid };
}

async function baseline(): Promise<void> {
  emit("runtime", true, {
    bun: Bun.version,
    pid: process.pid,
    uid: process.getuid?.(),
    gid: process.getgid?.(),
  });
  emit("environment", true, {
    keys: Object.keys(process.env).sort(),
    hostMarker: process.env.CAPSULE_GATE_C_HOST_MARKER ?? null,
  });
  emit("mountinfo", true, text("/proc/self/mountinfo").split("\n").filter(Boolean));
  emit("cgroup", true, {
    membership: text("/proc/self/cgroup"),
    cpuMax: text("/sys/fs/cgroup/cpu.max"),
    memoryMax: text("/sys/fs/cgroup/memory.max"),
    pidsMax: text("/sys/fs/cgroup/pids.max"),
    memoryEvents: text("/sys/fs/cgroup/memory.events"),
  });
  emit("network-files", true, {
    dev: text("/proc/net/dev"),
    route4: text("/proc/net/route"),
    route6: text("/proc/net/ipv6_route"),
    ifInet6: text("/proc/net/if_inet6"),
    resolvConf: text("/etc/resolv.conf"),
  });
  emit("unix-inventory", true, text("/proc/net/unix"));
  const localCid = vsockLocalCid();
  emit("vsock-files", true, {
    device: existsSync("/dev/vsock"),
    proc: text("/proc/net/vsock"),
    localCid,
    host1024: vsockConnect(2, 1024),
    local1024: vsockConnect(1, 1024),
    guest1024:
      typeof localCid.cid === "number" && localCid.cid > 2
        ? vsockConnect(localCid.cid, 1024)
        : "local-cid-unavailable",
  });
  emit("fd-inheritance", true, fdInventory());
  emit("loopback-self", true, await loopback());
  emit("tcp-public", true, await tcp("1.1.1.1", 443));
  emit("tcp-default-gateway", true, await tcp("192.168.64.1", 53));
  emit("udp-dns", true, await dnsUdp());
  try {
    const addresses = await Bun.dns.lookup("example.com", { family: 0 });
    emit("dns-name", true, addresses);
  } catch (error) {
    emit("dns-name", true, `error:${String(error)}`);
  }
  try {
    const response = await fetch("http://169.254.169.254/", { signal: AbortSignal.timeout(700) });
    emit("metadata", true, `status:${response.status}`);
  } catch (error) {
    emit("metadata", true, `error:${String(error)}`);
  }
  try {
    writeSync(openSync("/capsule-root-write-probe", "w"), "unexpected");
    emit("root-read-only", false, "write-succeeded");
  } catch (error) {
    emit("root-read-only", true, `write-denied:${String(error)}`);
  }
  if (existsSync("/capsule/input/data.json")) {
    emit("input-read", true, text("/capsule/input/data.json"));
    try {
      writeSync(openSync("/capsule/input/data.json", "w"), "mutated");
      emit("input-read-only", false, "write-succeeded");
    } catch (error) {
      emit("input-read-only", true, `write-denied:${String(error)}`);
    }
  }
  for (const path of ["/capsule/scratch", "/capsule/output"]) {
    if (existsSync(path)) {
      const stats = statfsSync(path);
      emit(`filesystem-${path.split("/").at(-1)}`, true, {
        blockSize: stats.bsize,
        blocks: stats.blocks,
        freeBlocks: stats.bfree,
      });
    }
  }
}

function memoryBurn(): never {
  const retained: Uint8Array[] = [];
  for (;;) {
    const chunk = new Uint8Array(8 * 1024 * 1024);
    chunk.fill(0xa5);
    retained.push(chunk);
    if (retained.length % 4 === 0)
      emit("memory-progress", true, retained.length * chunk.byteLength);
  }
}

function cpuBurn(): never {
  let value = 1;
  for (;;) value = (value * 1664525 + 1013904223) >>> 0;
}

async function pidBurn(): Promise<void> {
  const children: Bun.Subprocess[] = [];
  for (let index = 0; index < 128; index += 1) {
    try {
      const child = Bun.spawn(["/bin/sleep", "60"], { stdout: "ignore", stderr: "ignore" });
      children.push(child);
      emit("pid-spawn", true, { index, pid: child.pid });
    } catch (error) {
      emit("pid-spawn-denied", true, { index, error: String(error) });
      break;
    }
  }
  emit("pid-total", true, children.length);
  await Bun.sleep(60_000);
}

async function stubbornTree(): Promise<void> {
  const child = Bun.spawn(["/bin/sh", "-c", "trap '' TERM; while :; do /bin/sleep 1; done"], {
    stdout: "ignore",
    stderr: "ignore",
  });
  emit("stubborn-child", true, child.pid);
  process.on("SIGTERM", () => emit("parent-sigterm-ignored", true, process.pid));
  await Bun.sleep(3_600_000);
}

function diskFill(): never {
  const fd = openSync("/capsule/output/fill.bin", "w");
  const chunk = new Uint8Array(1024 * 1024);
  chunk.fill(0x5a);
  let bytes = 0;
  for (;;) {
    try {
      bytes += writeSync(fd, chunk);
      emit("disk-progress", true, bytes);
    } catch (error) {
      emit("disk-full", true, { bytes, error: String(error) });
      closeSync(fd);
      process.exit(0);
    }
  }
}

function outputFlood(): never {
  const line = `${"x".repeat(4096)}\n`;
  for (;;) process.stdout.write(line);
}

const mode = process.argv[2] ?? "baseline";
switch (mode) {
  case "baseline":
    await baseline();
    break;
  case "memory":
    memoryBurn();
    break;
  case "cpu":
    cpuBurn();
    break;
  case "pids":
    await pidBurn();
    break;
  case "stubborn-tree":
    await stubbornTree();
    break;
  case "disk":
    diskFill();
    break;
  case "output-flood":
    outputFlood();
    break;
  default:
    throw new Error(`unknown mode: ${mode}`);
}
