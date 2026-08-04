const attempts: Record<string, string> = {};

async function capture(name: string, operation: () => unknown | Promise<unknown>) {
  try {
    const value = await operation();
    attempts[name] = `allowed:${String(value)}`;
  } catch (error) {
    attempts[name] = `denied:${error instanceof Error ? error.name : typeof error}`;
  }
}

await capture("read", () => Deno.readTextFile("/etc/hostname"));
await capture("write", () => Deno.writeTextFile("/work/probe", "x"));
await capture("env", () => Deno.env.toObject());
await capture("sys", () => Deno.systemMemoryInfo());
await capture("run", () => new Deno.Command("/bin/echo", { args: ["probe"] }).output());
await capture("net", () => fetch("http://127.0.0.1:9"));
await capture("listen", () => Deno.listen({ hostname: "127.0.0.1", port: 0 }).close());
await capture("ffi", () => Deno.dlopen("/lib/aarch64-linux-gnu/libc.so.6", {}));
await capture(
  "permission-query-read",
  async () => (await Deno.permissions.query({ name: "read" })).state,
);
await capture(
  "permission-request-read",
  async () => (await Deno.permissions.request({ name: "read" })).state,
);
await capture("dynamic-local-import", () => import("./secondary.js"));
await capture("worker", () =>
  new Worker(new URL("./secondary.js", import.meta.url), { type: "module" }).terminate(),
);
await capture("local-storage", () => localStorage.setItem("capsule", "persistent"));
await capture("cache-storage", () => caches.open("capsule"));
await capture("kv", () => Deno.openKv());

console.log(JSON.stringify(attempts, null, 2));
