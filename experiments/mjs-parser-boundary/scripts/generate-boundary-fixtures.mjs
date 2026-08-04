import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cases = resolve(root, "fixtures", "cases");
await mkdir(cases, { recursive: true });
await writeFile(resolve(cases, "allow-cap-exact.mjs"), Buffer.alloc(262_144, 0x20));
await writeFile(resolve(cases, "deny-cap-plus-one.mjs"), Buffer.alloc(262_145, 0x20));
await writeFile(resolve(cases, "deny-invalid-utf8.mjs"), Buffer.from([0xc3, 0x28]));
