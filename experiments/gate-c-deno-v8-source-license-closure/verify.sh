#!/bin/sh
set -eu

experiment=$(CDPATH='' cd -- "$(dirname "$0")" && pwd)
repository=$(CDPATH='' cd -- "$experiment/../.." && pwd)
evidence=$experiment/evidence/2026-08-02

node --check "$experiment/generate-evidence.mjs"

for json in "$evidence"/*.json; do
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$json"
done

node - "$evidence" <<'NODE'
const fs = require("fs");
const directory = process.argv[2];
const read = (name) => JSON.parse(fs.readFileSync(`${directory}/${name}`, "utf8"));
const provenance = read("archive-provenance.json");
const sources = read("source-manifest.json");
const inventory = read("archive-inventory.json");
const licenses = read("license-notice-manifest.json");
const build = read("build-inputs.json");
const admission = read("admission-checklist.json");

if (provenance.crate.sha256 !== "c7f4e905df70d6c00b95e69c5f0831fd5eb5889b0116ae2b30293578c19cd1bc") process.exit(2);
if (provenance.release.asset.sha256 !== "8d91df74c8a671c23f880e64038023f49e07ca85c96e15d76a87e2aac9b20595") process.exit(2);
if (provenance.crate.vcsCommit !== "d305e6afa7736f6e298c30ae6646f7709ee9382b") process.exit(2);
if (sources.sourceIdentity.denolandV8 !== "ac1e23989121713ca642f6650b34deff7b686896") process.exit(2);
if (sources.sourceIdentity.chromiumV8Base !== "0da5ef4358784bb0af0ff5d5d7c49cdad8931d1e") process.exit(2);
if (sources.components.length !== 21 || sources.patchStack.length !== 4) process.exit(2);
if (inventory.archive.memberCount !== 1875 || inventory.mapping.embeddedSourcePathCount !== 1557) process.exit(2);
if (inventory.mapping.ambiguousComponent !== 53 || inventory.mapping.unmatched !== 264) process.exit(2);
if (licenses.status !== "incomplete" || licenses.allDiscoveredLicenseNoticeFiles.length !== 726) process.exit(2);
if (build.rebuild.attempted !== false || build.unresolvedImmutableInputs.length < 8) process.exit(2);
if (admission.decision !== "SOURCE-LICENSE-CLOSURE-NO-GO" || admission.runtimeAdmission !== false) process.exit(2);
if (admission.checks.filter((check) => check.pass).length !== 3) process.exit(2);
if (admission.checks.find((check) => check.id === "cyclonedx-composition-complete")?.pass !== false) process.exit(2);
NODE

git -C "$repository" diff --check -- \
  experiments/gate-c-deno-v8-source-license-closure \
  docs/PROJECT.md \
  docs/FEASIBILITY_SPIKES.md \
  docs/GATE_C_P0_RECONCILIATION.md \
  docs/WORKSTREAM_EVIDENCE_LEDGER.md \
  docs/adr/0003-bun-first.md

printf 'sourceLicenseClosure=SOURCE-LICENSE-CLOSURE-NO-GO\n'
printf 'runtimeAdmission=false\n'
