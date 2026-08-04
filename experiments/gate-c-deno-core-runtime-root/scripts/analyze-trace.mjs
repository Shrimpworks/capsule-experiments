import fs from "node:fs";

if (process.argv.length !== 4) {
  console.error("usage: node analyze-trace.mjs TRACE OUTPUT_JSON");
  process.exit(2);
}

const [tracePath, outputPath] = process.argv.slice(2);
const text = fs.readFileSync(tracePath, "utf8");
const lines = text.trimEnd().split("\n");
const initialExec = lines.find((line) =>
  line.includes('execve("/candidate/lib/ld-linux-aarch64.so.1"'),
);
if (!initialExec?.includes("/* 0 vars */"))
  throw new Error("trace does not prove an empty environment");

const forbiddenNames = [
  "/etc/ld.so.cache",
  "/etc/nsswitch.conf",
  "/etc/resolv.conf",
  "/etc/hosts",
  "/etc/localtime",
  "/etc/timezone",
  "/usr/lib/locale",
  "/usr/share/locale",
  "/usr/share/zoneinfo",
  "/var/cache",
  "/var/lib/dpkg",
  "libnss_",
];
for (const name of forbiddenNames) {
  if (text.includes(name)) throw new Error(`forbidden runtime path observed: ${name}`);
}

const successfulFilePaths = [];
for (const line of lines) {
  if (
    !/(openat|statx|newfstatat|readlinkat|faccessat)\(/.test(line) ||
    !/ = (0|[1-9][0-9]*<)/.test(line)
  )
    continue;
  const matches = [...line.matchAll(/"(\/[^"\\]*)"/g)].map((match) => match[1]);
  for (const path of matches) {
    if (path === "") continue;
    successfulFilePaths.push(path);
    const allowed =
      path.startsWith("/candidate/") ||
      path.startsWith("/proc/") ||
      path.startsWith("/sys/fs/cgroup/") ||
      path === "/dev/urandom";
    if (!allowed) throw new Error(`successful undeclared file route: ${path}`);
  }
}

const preload = lines.filter((line) => line.includes('"/etc/ld.so.preload"'));
if (preload.length !== 1 || !preload[0].includes("ENOENT")) {
  throw new Error("ld.so.preload must be one expected-negative ENOENT observation");
}
if (/\b(socket|socketpair)\(/.test(text)) throw new Error("socket syscall observed");
const execs = lines.filter((line) => /\bexecve(at)?\(/.test(line));
if (execs.length !== 1) throw new Error(`unexpected executable route count: ${execs.length}`);
const clones = lines.filter((line) => /\bclone3?\(/.test(line));
if (clones.length !== 1 || !clones[0].includes("CLONE_THREAD")) {
  throw new Error("expected exactly one V8 worker-thread clone and no process clone");
}

const executableMappings = lines.filter(
  (line) => /mmap\(.*PROT_READ\|PROT_EXEC/.test(line) && / = /.test(line),
);
for (const line of executableMappings) {
  if (!line.includes("/candidate/")) throw new Error(`executable mapping outside root: ${line}`);
}
const sealIndex = lines.findIndex(
  (line) => line.includes("seccomp(SECCOMP_SET_MODE_FILTER") && line.endsWith("= 0"),
);
if (sealIndex < 0) throw new Error("host seal activation not observed");
if (lines.slice(sealIndex + 1).some((line) => /PROT_EXEC/.test(line) && / = (0|0x)/.test(line))) {
  throw new Error("successful executable mapping observed after host seal");
}

const unique = (values) => [...new Set(values)].sort();
const summary = {
  schema: "capsule.deno-core-runtime-root-file-open.v0",
  result: "pass",
  environmentVariablesAtExec: 0,
  successfulFilePaths: unique(successfulFilePaths),
  expectedNegativePaths: [
    "/etc/ld.so.preload",
    "/candidate/lib/aarch64-linux-gnu/{tls,aarch64,atomics hwcap variants}",
    "/sys/devices/system/cpu/online after descriptor seal",
    "/proc/stat after descriptor seal",
  ],
  forbiddenBookwormConfigOrDataPathsObserved: false,
  processExecCount: execs.length,
  v8WorkerThreadCloneCount: clones.length,
  socketSyscallsObserved: false,
  executableMappings: executableMappings.map((line) => line.replace(/^\d+\s+/, "")),
  executableMappingAfterHostSeal: false,
  limitations: [
    "procfs, cgroupfs, and /dev/urandom are declared Linux kernel/device inputs, not runtime-root package bytes",
    "the trace harness is an owned Docker Desktop Linux/arm64 container, not the future libkrun guest",
    "strace runs only in the evidence harness and is not a runtime-root member",
  ],
};
fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
