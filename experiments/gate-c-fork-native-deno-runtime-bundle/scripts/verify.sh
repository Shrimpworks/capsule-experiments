#!/bin/sh
set -eu

if [ "$#" -ne 0 ] && [ "$#" -ne 2 ]; then
  echo "usage: $0 [DENO_CHECKOUT RUSTY_V8_CHECKOUT]" >&2
  exit 2
fi

experiment=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
repository=$(CDPATH='' cd -- "$experiment/../.." && pwd)
evidence="$experiment/evidence/2026-08-04"

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

for json in \
  "$experiment/manifests/input-contract.json" \
  "$experiment/manifests/known-answers.json" \
  "$evidence/ref-verification.json" \
  "$evidence/environment.json" \
  "$evidence/known-answer-reconciliation.json" \
  "$evidence/deno-first-attempt-target-path-divergence.json" \
  "$evidence/deno-second-attempt-four-cpu-snapshot-divergence.json" \
  "$evidence/rusty-v8-prior-comparison.json" \
  "$evidence/rusty-v8-local-oracle-comparison.json" \
  "$evidence/rusty-v8-build-metadata-comparison.json" \
  "$evidence/descriptor-manifest.json" \
  "$evidence/root-entry-comparison.json" \
  "$evidence/comparison.json" \
  "$evidence/sbom.cdx.json" \
  "$evidence/source-license-closure.json" \
  "$evidence/runtime-bundle-manifest.json" \
  "$evidence/provenance.intoto.json" \
  "$evidence/result.json"
do
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$json"
done

node - "$experiment" "$evidence" <<'NODE'
const fs = require("fs");
const [experiment, evidence] = process.argv.slice(2);
const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const contract = read(`${experiment}/manifests/input-contract.json`);
const known = read(`${experiment}/manifests/known-answers.json`);
const refs = read(`${evidence}/ref-verification.json`);
const reconciliation = read(`${evidence}/known-answer-reconciliation.json`);
const oracle = read(`${evidence}/rusty-v8-local-oracle-comparison.json`);
const v8Metadata = read(`${evidence}/rusty-v8-build-metadata-comparison.json`);
const descriptor = read(`${evidence}/descriptor-manifest.json`);
const fileOpen = read(`${evidence}/file-open-summary.json`);
const rootEntries = read(`${evidence}/root-entry-comparison.json`);
const comparison = read(`${evidence}/comparison.json`);
const sbom = read(`${evidence}/sbom.cdx.json`);
const source = read(`${evidence}/source-license-closure.json`);
const bundle = read(`${evidence}/runtime-bundle-manifest.json`);
const provenance = read(`${evidence}/provenance.intoto.json`);
const result = read(`${evidence}/result.json`);
const fail = (message) => { throw new Error(message); };
const equal = (left, right, message) => {
  if (JSON.stringify(left) !== JSON.stringify(right)) fail(message);
};

const denoHead = "9adb0b68b55bca81644827f1e7749a3acb091bed";
const rustyHead = "80e863ddb942a4aa2b384e794fc23e35b9d2bb15";
const priorBinary = "597baba6b9f50fc619ce667a352e19686f8c73efc6819d137b3c4081450fd6f5";
const priorSnapshot = "ef5f1e7883bbf62a6422957ff0eea51a06d4b35cad1f47dc9c9ae137ab8dfa0b";
const priorRoot = "b0e1726171c08669c1c3bba70b1aae89c07270c306a1dd4fa6919ec69f579283";

if (contract.status !== "constructed-and-verified-not-admitted") fail("contract status mismatch");
if (contract.target.rustTarget !== "aarch64-unknown-linux-gnu" || contract.target.substitutionAllowed !== false) fail("target contract mismatch");
if (contract.forks.deno.governedHead !== denoHead || contract.forks.rustyV8.governedHead !== rustyHead) fail("fork contract mismatch");
if (contract.buildPhases.buildAndTest.network !== "disabled") fail("network boundary mismatch");
if (contract.admission.runtime001 !== "unsupported" || contract.admission.published !== false || contract.admission.signed !== false) fail("admission boundary mismatch");

if (refs.capsuleExperiments.staleBaseRejected !== true) fail("stale Capsule base not rejected");
if (refs.deno.head !== denoHead || refs.deno.merge !== "ea18b9dc21ff8ebd19347be7095f47937ee14ec2") fail("Deno ref evidence mismatch");
if (refs.rustyV8.head !== rustyHead || refs.rustyV8.merge !== "cbf56de2e1156b1cf1561fdbaea7172a0aa056f4") fail("rusty_v8 ref evidence mismatch");
if (refs.rustyV8.profile !== "linux-arm64-release-simdutf-v1" || refs.rustyV8.gitlinks !== 20 || refs.rustyV8.crossPackages !== 22) fail("rusty_v8 profile evidence mismatch");
if (refs.oracle.role !== "comparison-only-not-reconstruction-input") fail("oracle role mismatch");

if (known.status !== "comparison-oracles-only-not-fork-native-output") fail("known-answer role mismatch");
if (known.physicalOmission.binary.sha256 !== priorBinary) fail("prior binary mismatch");
if (known.physicalOmission.snapshot.sha256 !== priorSnapshot) fail("prior snapshot mismatch");
if (known.standaloneRoot.entryCount !== 22 || known.standaloneRoot.gzip.sha256 !== priorRoot) fail("prior root mismatch");
if (reconciliation.suppliedByCurrentTask !== priorRoot || reconciliation.canonicalRuntimeRootResult.rootGzipSha256 !== priorRoot || reconciliation.normalizationOrArtifactRewrite !== false) fail("root known-answer reconciliation mismatch");

if (result.decision !== "PASSED-EXACT-CLEAN-CONSTRUCTION-ONLY" || result.runtimeSelectionAdmission !== "IN_PROGRESS-UNSUPPORTED") fail("result boundary mismatch");
if (bundle.status !== "constructed-and-verified-not-admitted" || bundle.target !== "aarch64-unknown-linux-gnu") fail("bundle status mismatch");
equal(bundle.forks, {
  deno: { head: denoHead, merge: "ea18b9dc21ff8ebd19347be7095f47937ee14ec2", upstream: "14eea3160ae5834476aa3b9d317b8d41d991b982" },
  rustyV8: { head: rustyHead, merge: "cbf56de2e1156b1cf1561fdbaea7172a0aa056f4", upstream: "d305e6afa7736f6e298c30ae6646f7709ee9382b" },
}, "bundle fork identities mismatch");
if (bundle.runtime.rootEntries !== 22 || result.rootEntries !== 22) fail("root entry count mismatch");
if (bundle.runtime.regularFileBytes > bundle.caps.runtimeRootRegularFileBytes) fail("root regular-byte cap exceeded");
for (const [name, observation] of Object.entries(result.reproducibility)) {
  if (observation.result !== "byte-equal" || observation.buildA.sha256 !== observation.buildB.sha256 || observation.buildA.size !== observation.buildB.size) fail(`reproduction mismatch: ${name}`);
}

equal(descriptor.builtinOps, known.physicalOmission.builtinOps, "three-op registry mismatch");
if (descriptor.moduleLoader !== "none" || descriptor.inspector !== false || descriptor.extensions.length !== 0) fail("runtime construction surface mismatch");
equal(descriptor.hostSeal.inheritedDescriptors, [0, 1, 2], "descriptor closure mismatch");
if (fileOpen.result !== "pass" || fileOpen.environmentVariablesAtExec !== 0 || fileOpen.forbiddenBookwormConfigOrDataPathsObserved !== false || fileOpen.processExecCount !== 1 || fileOpen.socketSyscallsObserved !== false || fileOpen.executableMappingAfterHostSeal !== false) fail("file-open closure mismatch");
equal(result.fixedResult, { count: 3, label: "capsule-owned", sum: 6 }, "fixed result mismatch");
if (result.verification.sameHostDenoBuildAB !== "byte-equal" || result.verification.sameHostRootBuildAB !== "byte-equal") fail("same-host equality mismatch");
if (result.verification.syscallSeal !== "pass" || result.verification.fileOpenClosure !== "pass" || result.verification.restorationMutations !== "pass") fail("runtime verification mismatch");

if (comparison.attribution.outputRewriteOrNormalization !== false) fail("comparison normalization detected");
if (comparison.decision !== "comparison-closed" || comparison.unexplainedDifferences.length !== 0) fail("comparison attribution is not closed");
if (comparison.denoBinary.current !== result.artifacts.denoBinary.sha256 || comparison.denoBinary.prior !== priorBinary) fail("binary comparison mismatch");
if (comparison.denoSnapshot.current !== result.artifacts.denoSnapshot.sha256 || comparison.denoSnapshot.prior !== priorSnapshot) fail("snapshot comparison mismatch");
if (comparison.runtimeRootGzip.current !== result.artifacts.runtimeRootGzip.sha256 || comparison.runtimeRootGzip.prior !== priorRoot) fail("root comparison mismatch");
for (const name of ["denoBinary", "denoSnapshot", "runtimeRootGzip"]) {
  const item = comparison[name];
  const expected = item.current === item.prior ? "equal" : "different";
  if (item.result !== expected) fail(`untruthful comparison result: ${name}`);
}
if (comparison.attribution.versionedInputs.length < 5) fail("comparison attribution incomplete");
if (rootEntries.priorEntryCount !== 22 || rootEntries.currentEntryCount !== 22 || rootEntries.equalEntryCount + rootEntries.differentEntryCount !== 22) fail("root entry comparison closure mismatch");
if (rootEntries.differences.some((item) => !["bin/capsule-deno-core-physical-omission", "share/capsule-deno-core/capsule_core_snapshot.bin"].includes(item.path))) fail("unattributed root entry difference");
equal(comparison.runtimeRootEntries, rootEntries, "embedded root entry comparison mismatch");

if (oracle.expectedFileCount !== 11 || oracle.equalCount + oracle.differentCount !== 11 || oracle.normalizationApplied !== false || oracle.decision !== "comparison-closed" || oracle.unexplainedFiles.length !== 0) fail("V8 oracle comparison closure mismatch");
if (oracle.oracle.role !== "comparison-only-never-a-construction-input" || oracle.local.role !== "clean-reconstruction-consumed-by-deno-build") fail("V8 oracle role mismatch");
const v8Archive = oracle.files["librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz"];
if (v8Archive.local.sha256 !== comparison.rustyV8Archive.current || v8Archive.oracle.sha256 !== comparison.rustyV8Archive.prior || v8Archive.result !== "byte-equal") fail("V8 archive did not reproduce oracle");
if (v8Metadata.decision !== "comparison-closed" || v8Metadata.unexplained.length !== 0 || v8Metadata.normalizationApplied !== false || v8Metadata.equalCount + v8Metadata.differentCount !== v8Metadata.memberCount) fail("V8 build-metadata attribution incomplete");

if (source.result !== "closed-for-declared-build-and-runtime-materials" || source.unsigned !== true || source.published !== false) fail("source/license closure mismatch");
if (source.cargo.packages !== 193 || source.cargo.registrySources !== 189 || source.cargo.registrySourcesWithLicenseExpression !== 189) fail("Cargo source closure mismatch");
if (source.cargo.lockSha256 !== "4dd8f08c8b223adbf3468fce5fe9e0468dfe9f4a255129cc304cb604fa0d389d") fail("direct-workspace Cargo lock mismatch");
if (sbom.bomFormat !== "CycloneDX" || sbom.specVersion !== "1.6" || sbom.components.length !== 193) fail("SBOM closure mismatch");
if (sbom.compositions.length !== 1 || sbom.compositions[0].aggregate !== "complete") fail("SBOM composition mismatch");
if (provenance._type !== "https://in-toto.io/Statement/v1" || provenance.predicateType !== "https://slsa.dev/provenance/v1") fail("provenance type mismatch");
if (!provenance.predicate.buildDefinition.externalParameters.networkBoundary.includes("network-none")) fail("provenance network boundary mismatch");
if (provenance.predicate.runDetails.limitations.length < 5) fail("provenance limitations missing");
if (bundle.admission.runtime001 !== "unsupported" || bundle.admission.runtimeProfileSelected !== false || bundle.admission.signed !== false || bundle.admission.published !== false) fail("bundle admission mismatch");
NODE

test "$(cat "$evidence/final-link-symbols.txt")" = 'deno_core::ops_builtin_v8::op_get_ext_import_meta_proto
deno_core::ops_builtin_v8::op_get_extras_binding_object
deno_core::ops_builtin_v8::op_set_captured_bootstrap'
grep -Fx 'networkMode=none' "$evidence/build-boundary.txt" >/dev/null
grep -Fx 'compilerCache=absent' "$evidence/build-boundary.txt" >/dev/null
grep -Fx 'snapshotBuilderLogicalCpus=1' "$evidence/build-boundary.txt" >/dev/null
grep -Fx 'snapshotBuilderCpuSet=0' "$evidence/build-boundary.txt" >/dev/null
grep -Fx 'fixedResult=pass' "$evidence/runtime-verification.txt" >/dev/null
grep -Fx 'staticModuleRequest=refused' "$evidence/runtime-verification.txt" >/dev/null
grep -Fx 'dynamicModuleRequest=refused' "$evidence/runtime-verification.txt" >/dev/null
grep -Fx 'syscallRestoration=refused' "$evidence/runtime-verification.txt" >/dev/null
grep -Fx 'restoredOpPrintBinary=refused-four-op-registry' "$evidence/runtime-verification.txt" >/dev/null
test "$(wc -l < "$evidence/syscall-restoration-results.jsonl" | tr -d ' ')" = 4
test "$(tail -n +2 "$evidence/root-mutation-results.tsv" | wc -l | tr -d ' ')" = 14
grep -F 'rustyV8OracleEqual=' "$evidence/rusty-v8-oracle-comparison.log" >/dev/null
grep -F 'sameHostBuildAB=byte-equal' "$evidence/deno-build.log" >/dev/null
grep -F 'sameHostRootAB=byte-equal' "$evidence/root-build.log" >/dev/null
grep -F 'loaderFileOpenClosure=pass' "$evidence/root-test.log" >/dev/null

if [ "$#" -eq 2 ]; then
  deno=$1
  rusty=$2
  test "$(git -C "$deno" rev-parse HEAD)" = 9adb0b68b55bca81644827f1e7749a3acb091bed
  test "$(git -C "$deno" rev-parse 'HEAD^{tree}')" = 72edd0f7b5f83b918945860653714e344c8a303f
  test "$(git -C "$deno" show -s --format=%P ea18b9dc21ff8ebd19347be7095f47937ee14ec2)" = \
    '14eea3160ae5834476aa3b9d317b8d41d991b982 9adb0b68b55bca81644827f1e7749a3acb091bed'
  git -C "$deno" merge-base --is-ancestor \
    14eea3160ae5834476aa3b9d317b8d41d991b982 \
    9adb0b68b55bca81644827f1e7749a3acb091bed
  test "$(sha256 "$deno/docs/capsule/governed-deno-core.md")" = \
    da22a7856b49bc06a1fb4921f1f97eb1c8951d80572ec0f4efcc55d586da8f32
  test "$(sha256 "$deno/tools/capsule/governed-deno-core/verify.mjs")" = \
    a880c599ee538b655c614d7da4111b05e62cb66a9bcca4cd4ddae1cc44c47aaa
  node "$deno/tools/capsule/governed-deno-core/verify.mjs"

  test "$(git -C "$rusty" rev-parse HEAD)" = 80e863ddb942a4aa2b384e794fc23e35b9d2bb15
  test "$(git -C "$rusty" rev-parse 'HEAD^{tree}')" = d8950a7a1ee907761720b23d24eaa9b63aa33b10
  test "$(git -C "$rusty" show -s --format=%P cbf56de2e1156b1cf1561fdbaea7172a0aa056f4)" = \
    'eddede228a9214c4dfb6a85aeca22abc0679100d 80e863ddb942a4aa2b384e794fc23e35b9d2bb15'
  git -C "$rusty" merge-base --is-ancestor \
    d305e6afa7736f6e298c30ae6646f7709ee9382b \
    80e863ddb942a4aa2b384e794fc23e35b9d2bb15
  test "$(sha256 "$rusty/governance/v150.2.0/builder-linux-arm64.lock.json")" = \
    da45206bfdea87b0dc3ddb9ec31babdce264862174ec30450baddee2d8c1f70b
  test "$(sha256 "$rusty/governance/v150.2.0/expected-outputs-linux-arm64.json")" = \
    da5543735995f960bfd1a22489b242e706c8c4a2aa7392c2644004a6e464b17d
  test "$(sha256 "$rusty/governance/v150.2.0/source.lock.json")" = \
    df1630e159dfec398ca8d71305431d441b6953efc910de63f4c0e6e28f251855
  (
    cd "$rusty"
    python3 scripts/governed/verify_inputs.py --require-submodules
    python3 scripts/governed/verify_arm64_inputs.py --require-submodules
  )
fi

for shell_script in "$experiment"/builder/*.sh "$experiment"/scripts/*.sh; do
  sh -n "$shell_script"
done
node --check "$experiment/generate-evidence.mjs"
node --check "$experiment/scripts/compare-rusty-v8-oracle.mjs"
node --check "$experiment/scripts/compare-rusty-v8-build-metadata.mjs"
git -C "$repository" diff --check -- experiments/gate-c-fork-native-deno-runtime-bundle

printf 'question=exact-clean-fork-native-linux-arm64-reconstruction\n'
printf 'construction=passed-exact-clean-construction-only\n'
printf 'runtimeSelectionAdmission=in-progress-unsupported\n'
printf 'runtime001=unsupported\n'
