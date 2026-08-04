#!/bin/sh
set -eu

experiment=$(CDPATH='' cd -- "$(dirname "$0")" && pwd)
repository=$(CDPATH='' cd -- "$experiment/../.." && pwd)
physical=$repository/experiments/gate-c-deno-core-physical-omission

for script in "$experiment"/*.sh "$experiment"/scripts/*.sh; do
  sh -n "$script"
done
node --check "$experiment/generate-evidence.mjs"

for json in "$experiment"/evidence/2026-08-02/*.json; do
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$json"
done

node - "$experiment/evidence/2026-08-02" <<'NODE'
const fs = require("fs");
const path = process.argv[2];
const read = (name) => JSON.parse(fs.readFileSync(`${path}/${name}`, "utf8"));
const bom = read("sbom.cdx.json");
const source = read("source-bundle-inventory.json");
const license = read("license-and-source.json");
const bundle = read("runtime-bundle-manifest.json");
const provenance = read("provenance.intoto.json");
const reproducibility = read("reproducibility.json");
const checklist = read("admission-checklist.json");
if (bom.bomFormat !== "CycloneDX" || bom.specVersion !== "1.6") process.exit(2);
if (source.cargoLock.packages !== 193 || source.crates.length !== 191) process.exit(2);
if (source.crates.some((item) => !item.cratesIoSha256 || !item.licenseExpression)) process.exit(2);
if (license.status !== "blocked") process.exit(2);
if (bundle.files.length !== 2 || bundle.dynamicRuntimeRoot.standalone !== false) process.exit(2);
if (provenance._type !== "https://in-toto.io/Statement/v1") process.exit(2);
if (reproducibility.result !== "all-declared-package-bytes-equal") process.exit(2);
if (checklist.decision !== "no-go-for-runtime-selection-adr") process.exit(2);
const refs = new Set(bom.components.map((component) => component["bom-ref"]));
refs.add(bom.metadata.component["bom-ref"]);
if (bom.dependencies.some((item) => !refs.has(item.ref))) process.exit(2);
if (bom.dependencies.some((item) => item.dependsOn.some((ref) => !refs.has(ref)))) process.exit(2);
NODE

test "$(shasum -a 256 "$physical/probe/Cargo.lock" | awk '{print $1}')" = \
  a039052af6c8f0afba2fb210a984f36e3e5693dbcf6aaf60c3c2fda76932c014
test "$(shasum -a 256 "$physical/patches/0001-physically-allowlist-bootstrap-ops.patch" | awk '{print $1}')" = \
  f45fda69db3875dbd730aa9568cb88ff6cc35a25c8d82edb5fa3b521c19bac37
test "$(shasum -a 256 "$physical/patches/0002-canonicalize-snapshot-module-order.patch" | awk '{print $1}')" = \
  9dd33fd423ce98f030d80eba5cb386d5236b7ca103aa45b58ce5b36125d8061e
test "$(shasum -a 256 "$physical/patches/mutations/restore-op-print.patch" | awk '{print $1}')" = \
  e0e98557b709437d464464922a3c4d4cc45af1832d32108d584cfe771125ee40

git -C "$repository" diff --check -- \
  experiments/gate-c-deno-core-reproducible-package \
  experiments/gate-c-deno-core-physical-omission/scripts/prepare-source.sh
printf 'packageEvidence=valid\n'
printf 'runtimeSelectionDecision=no-go\n'
