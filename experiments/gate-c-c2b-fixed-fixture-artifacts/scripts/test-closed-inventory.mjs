import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const source = resolve(process.argv[2] ?? "");
if (!process.argv[2] || basename(source) !== "c2b-fixture") {
  throw new Error("usage: test-closed-inventory.mjs DENO_C2B_FIXTURE_DIR");
}

const positive = spawnSync("node", [join(source, "verify.mjs")], {
  encoding: "utf8",
});
if (positive.status !== 0) {
  throw new Error(`positive inventory verification failed: ${positive.stderr}`);
}

const temporary = mkdtempSync(join(tmpdir(), "capsule-c2b-inventory-"));
const copy = join(temporary, "c2b-fixture");
try {
  cpSync(source, copy, { recursive: true });
  writeFileSync(join(copy, "UNAUTHORIZED.txt"), "inventory refusal probe\n");
  const negative = spawnSync("node", [join(copy, "verify.mjs")], {
    encoding: "utf8",
  });
  if (
    negative.status === 0 ||
    !negative.stderr.includes("fixed-fixture inventory mismatch") ||
    !negative.stderr.includes("UNAUTHORIZED.txt")
  ) {
    throw new Error("extra-file inventory mutation was not refused");
  }
  console.log("closedInventory.retainedFiles=10");
  console.log("closedInventory.positive=pass");
  console.log("closedInventory.extraFile=refused");
  console.log("closedInventory.extraFileName=UNAUTHORIZED.txt");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
