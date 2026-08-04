const attempts: Record<string, string> = {};

async function capture(name: string, operation: () => Promise<unknown>) {
  try {
    await operation();
    attempts[name] = "allowed";
  } catch (error) {
    attempts[name] =
      `denied:${error instanceof Error ? `${error.name}:${error.message}` : typeof error}`;
  }
}

await capture("https-import", () => import("https://example.invalid/capsule.ts"));
await capture("jsr-import", () => import("jsr:@std/assert@1.0.14"));
await capture("npm-import", () => import("npm:chalk@5.6.2"));
await capture("data-import", () => import("data:text/javascript,export default 1"));

console.log(JSON.stringify(attempts, null, 2));
