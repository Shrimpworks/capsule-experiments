#!/bin/sh
set -eu

if [ "$#" -ne 0 ] && [ "$#" -ne 2 ]; then
  echo "usage: $0 [DENO_CHECKOUT RUSTY_V8_CHECKOUT]" >&2
  exit 2
fi

experiment=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
repository=$(CDPATH='' cd -- "$experiment/../.." && pwd)
contract="$experiment/manifests/input-contract.json"
answers="$experiment/manifests/known-answers.json"
evidence="$experiment/evidence/2026-08-03/ref-verification.json"

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

for json in "$contract" "$answers" "$evidence"; do
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$json"
done

node - "$contract" "$answers" "$evidence" <<'NODE'
const fs = require("fs");
const [contractPath, answersPath, evidencePath] = process.argv.slice(2);
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const answers = JSON.parse(fs.readFileSync(answersPath, "utf8"));
const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
const fail = (message) => { throw new Error(message); };
if (contract.status !== "blocked-arm64-builder-absent") fail("contract must remain blocked");
if (contract.target.architecture !== "arm64" || contract.target.substitutionAllowed !== false) fail("target substitution changed");
if (contract.forks.deno.governedHead !== evidence.deno.head) fail("Deno head mismatch");
if (contract.forks.rustyV8.governedHead !== evidence.rustyV8.head) fail("rusty_v8 head mismatch");
if (contract.forks.rustyV8.rejectedTerminalHead !== evidence.rustyV8.rejectedTerminalHead) fail("stale head mismatch");
if (contract.admission.runtime001 !== "unsupported" || contract.admission.published !== false || contract.admission.signed !== false) fail("admission boundary changed");
if (evidence.rustyV8.supportedTarget !== "x86_64-unknown-linux-gnu" || evidence.rustyV8.requestedProfileSupported !== false) fail("architecture blocker changed");
if (evidence.build.attempted !== false || evidence.build.amd64Substituted !== false || evidence.build.newArtifactIdentities.length !== 0) fail("blocked build evidence changed");
if (answers.status !== "comparison-oracles-only-not-fork-native-output") fail("known-answer role changed");
if (answers.physicalOmission.binary.sha256 !== "597baba6b9f50fc619ce667a352e19686f8c73efc6819d137b3c4081450fd6f5") fail("binary oracle changed");
if (answers.physicalOmission.snapshot.sha256 !== "ef5f1e7883bbf62a6422957ff0eea51a06d4b35cad1f47dc9c9ae137ab8dfa0b") fail("snapshot oracle changed");
if (answers.standaloneRoot.gzip.sha256 !== "b0e17261c513f1d16e350055c5b4809063b038783cb6b4c68937217458f79283") fail("root oracle changed");
if (answers.typescriptBoundary.emitted.sha256 !== "f91911dd606409fed94c214381533f5ece3e2ae23ea861a3a55192cefad884cd") fail("TypeScript oracle changed");
NODE

test "$(sha256 "$repository/experiments/gate-c-deno-core-runtime-root/manifests/runtime-root-files.tsv")" = \
  94132c7b77200c7ba343b44e1f66ee404fba32c6227268d63a9cc70831179623
test "$(sha256 "$repository/experiments/gate-c-deno-core-runtime-root/manifests/package-sources.json")" = \
  f19971dd4c264fc12558cfb893a4e8af1dbb4314313742f9d92fcb45017540e6
test "$(sha256 "$repository/experiments/gate-c-deno-core-runtime-root/evidence/2026-08-03/sbom.cdx.json")" = \
  80b86726178494d1a06e5cde9fedd788cfad042b35cb3b9d95d6155a665f5fd5
test "$(sha256 "$repository/experiments/typescript-approved-byte-boundary/transformer-profile.json")" = \
  3bc25a01c3059776070a5354e7c6560d06f031ef0336c6a96d34c41f5577aec5
test "$(sha256 "$repository/experiments/typescript-approved-byte-boundary/options.json")" = \
  cbd7337986e8145ff812da60b79703c7b7a31929d5c9212fae48e4568249de7b
test "$(sha256 "$repository/experiments/typescript-approved-byte-boundary/evidence/2026-08-03/ordinary.js")" = \
  f91911dd606409fed94c214381533f5ece3e2ae23ea861a3a55192cefad884cd

if [ "$#" -eq 2 ]; then
  deno=$1
  rusty=$2
  test "$(git -C "$deno" rev-parse HEAD)" = 9adb0b68b55bca81644827f1e7749a3acb091bed
  test "$(git -C "$deno" rev-parse HEAD^{tree})" = 72edd0f7b5f83b918945860653714e344c8a303f
  test "$(git -C "$deno" show -s --format=%P ea18b9dc21ff8ebd19347be7095f47937ee14ec2)" = \
    "14eea3160ae5834476aa3b9d317b8d41d991b982 9adb0b68b55bca81644827f1e7749a3acb091bed"
  git -C "$deno" merge-base --is-ancestor \
    14eea3160ae5834476aa3b9d317b8d41d991b982 9adb0b68b55bca81644827f1e7749a3acb091bed
  test "$(sha256 "$deno/docs/capsule/governed-deno-core.md")" = \
    da22a7856b49bc06a1fb4921f1f97eb1c8951d80572ec0f4efcc55d586da8f32
  test "$(sha256 "$deno/tools/capsule/governed-deno-core/verify.mjs")" = \
    a880c599ee538b655c614d7da4111b05e62cb66a9bcca4cd4ddae1cc44c47aaa
  node "$deno/tools/capsule/governed-deno-core/verify.mjs"

  test "$(git -C "$rusty" rev-parse HEAD)" = a43ee7486c3e05bce5d6e5db586b3e2e688c33cf
  test "$(git -C "$rusty" rev-parse HEAD)" != 17698caedb8721c132a3e2f08f7ab0ae212f313a
  test "$(git -C "$rusty" rev-parse HEAD^{tree})" = 0e9be42766efb165119aaa4f13a4a43693d251e4
  test "$(git -C "$rusty" show -s --format=%P a31b8f39dc6933d5635367e8ccb67d70f2cc2385)" = \
    "ab3413d0bc878601f75bf14a56e2faf635c19b9a a43ee7486c3e05bce5d6e5db586b3e2e688c33cf"
  git -C "$rusty" merge-base --is-ancestor \
    d305e6afa7736f6e298c30ae6646f7709ee9382b a43ee7486c3e05bce5d6e5db586b3e2e688c33cf
  test "$(sha256 "$rusty/governance/v150.2.0/builder.lock.json")" = \
    5f0e9d571cd711ff2efda0ca5f4a6e85d5f2644ff11793cedadd6dc71638c913
  test "$(sha256 "$rusty/governance/v150.2.0/source.lock.json")" = \
    df1630e159dfec398ca8d71305431d441b6953efc910de63f4c0e6e28f251855
  test "$(sha256 "$rusty/governance/v150.2.0/expected-outputs.json")" = \
    337126870c88d0111476aa9d665f844097fc8a32dae2963d52c02acfefbe765b
  (
    cd "$rusty"
    python3 scripts/governed/verify_inputs.py
  )
  rg -q 'linux/amd64' "$rusty/governance/v150.2.0/README.md" "$rusty/scripts/governed/run-builder.sh"
  rg -q 'x86_64-unknown-linux-gnu' \
    "$rusty/governance/v150.2.0/builder.lock.json" "$rusty/scripts/governed/build-offline.sh"
  if rg -q 'linuxArm64Digest|aarch64-unknown-linux-gnu' \
    "$rusty/governance/v150.2.0/builder.lock.json" "$rusty/scripts/governed/build-offline.sh"
  then
    echo "retained blocker is stale: an arm64 builder field now exists" >&2
    exit 1
  fi
fi

git -C "$repository" diff --check -- \
  experiments/gate-c-fork-native-deno-runtime-bundle \
  docs

printf 'forkRefs=verified\n'
printf 'requestedTarget=linux-arm64\n'
printf 'construction=blocked-arm64-builder-absent\n'
printf 'buildAttempted=false\n'
printf 'runtime001=unsupported\n'
