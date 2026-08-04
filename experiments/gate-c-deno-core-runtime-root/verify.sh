#!/bin/sh
set -eu

experiment=$(CDPATH='' cd -- "$(dirname "$0")" && pwd)
repository=$(CDPATH='' cd -- "$experiment/../.." && pwd)

for script in "$experiment"/*.sh "$experiment"/scripts/*.sh; do sh -n "$script"; done
for script in "$experiment"/*.mjs "$experiment"/scripts/*.mjs; do node --check "$script"; done
for json in "$experiment"/manifests/*.json "$experiment"/evidence/2026-08-03/*.json; do
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$json"
done

test "$(wc -l <"$experiment/manifests/runtime-root-files.tsv" | tr -d ' ')" -eq 23
node - "$experiment" <<'NODE'
const fs = require("fs");
const path = process.argv[2];
const root = JSON.parse(fs.readFileSync(`${path}/evidence/2026-08-03/root-result.json`, "utf8"));
const sources = JSON.parse(fs.readFileSync(`${path}/manifests/package-sources.json`, "utf8"));
const sbom = JSON.parse(fs.readFileSync(`${path}/evidence/2026-08-03/sbom.cdx.json`, "utf8"));
const mutations = JSON.parse(fs.readFileSync(`${path}/evidence/2026-08-03/mutation-results.json`, "utf8"));
if (root.decision !== "standalone-dynamic-root-pass-no-runtime-admission") process.exit(2);
if (root.entryCount !== 22 || root.entryCap !== 22) process.exit(2);
if (root.normalizedRootTar.sha256 !== "d1f600b4f88fcb369cd6d851bd55c7bed670898fad6cb7f7449a76a106c6d925") process.exit(2);
if (sources.packages.length !== 3 || sources.sourceArtifacts.length !== 2) process.exit(2);
if (sbom.bomFormat !== "CycloneDX" || sbom.specVersion !== "1.6") process.exit(2);
if (mutations.result !== "pass" || mutations.cases.length !== 15) process.exit(2);
NODE

test "$(sha256sum "$repository/experiments/gate-c-deno-core-physical-omission/patches/0001-physically-allowlist-bootstrap-ops.patch" | awk '{print $1}')" = \
  f45fda69db3875dbd730aa9568cb88ff6cc35a25c8d82edb5fa3b521c19bac37
test "$(sha256sum "$repository/experiments/gate-c-deno-core-physical-omission/patches/0002-canonicalize-snapshot-module-order.patch" | awk '{print $1}')" = \
  9dd33fd423ce98f030d80eba5cb386d5236b7ca103aa45b58ce5b36125d8061e
test "$(sha256sum "$repository/experiments/gate-c-deno-core-physical-omission/patches/mutations/restore-op-print.patch" | awk '{print $1}')" = \
  e0e98557b709437d464464922a3c4d4cc45af1832d32108d584cfe771125ee40

git -C "$repository" diff --check
printf 'runtimeRootEvidence=valid\nruntimeAdmission=none\nruntime001=unsupported\n'
