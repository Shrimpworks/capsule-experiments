import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const verify = join(root, "scripts", "verify.mjs");
const cases = [
  ["manifest-byte", "manifests/archive-manifest.json"],
  ["container-boundary", "evidence/2026-08-12/container-boundary.json"],
  ["comparison", "evidence/2026-08-12/same-host-comparison.json"],
  ["provenance", "evidence/2026-08-12/provenance.intoto.json"],
  ["source-notice", "evidence/2026-08-12/source-notice-closure.json"],
  ["release-manifest", "inputs/release-manifest.json"],
  ["binding", "inputs/src_binding_simdutf_release_aarch64-unknown-linux-gnu.rs"],
  ["runtime-bundle", "artifacts/capsule-deno-core-c2b-runtime-bundle.tar.gz"],
];

for (const [name, relative] of cases) {
  const task = mkdtempSync(join(tmpdir(), `capsule-c5b6-${name}.`));
  const target = join(root, relative);
  const backup = join(task, basename(relative));
  copyFileSync(target, backup);
  try {
    const bytes = readFileSync(target);
    const changed = Buffer.from(bytes);
    changed[Math.floor(changed.length / 2)] ^= 1;
    writeFileSync(target, changed);
    const result = spawnSync(process.execPath, [verify], { cwd: root, encoding: "utf8" });
    if (result.status === 0) throw new Error(`${name} mutation unexpectedly passed`);
    console.log(`${name}=refused`);
  } finally {
    copyFileSync(backup, target);
    rmSync(task, { recursive: true, force: true });
  }
}
