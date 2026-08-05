#!/bin/sh
set -eu

artifact_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
repository=$(CDPATH='' cd -- "$artifact_dir/../.." && pwd)
work_root=$(mktemp -d /private/tmp/capsule-mjs-validator-v1.XXXXXX)
trap 'rm -rf "$work_root"' EXIT INT TERM

copy_source() {
    destination=$1
    mkdir -p "$destination/src"
    cp "$artifact_dir/Cargo.toml" "$destination/Cargo.toml"
    cp "$artifact_dir/Cargo.lock" "$destination/Cargo.lock"
    cp "$artifact_dir/rust-toolchain.toml" "$destination/rust-toolchain.toml"
    cp "$artifact_dir/src/lib.rs" "$destination/src/lib.rs"
    cp "$artifact_dir/src/main.rs" "$destination/src/main.rs"
}

build_one() {
    source_dir=$1
    target_dir=$2
    env \
        CARGO_INCREMENTAL=0 \
        CARGO_NET_OFFLINE=true \
        MACOSX_DEPLOYMENT_TARGET=14.0 \
        SOURCE_DATE_EPOCH=0 \
        RUSTFLAGS="--remap-path-prefix=$source_dir=/usr/src/capsule-mjs-source-validator" \
        cargo +1.95.0 build \
            --manifest-path "$source_dir/Cargo.toml" \
            --release \
            --locked \
            --offline \
            --target aarch64-apple-darwin \
            --target-dir "$target_dir"
}

copy_source "$work_root/source-a"
copy_source "$work_root/source-b"
build_one "$work_root/source-a" "$work_root/target-a"
build_one "$work_root/source-b" "$work_root/target-b"

binary_a="$work_root/target-a/aarch64-apple-darwin/release/capsule-mjs-source-validator"
binary_b="$work_root/target-b/aarch64-apple-darwin/release/capsule-mjs-source-validator"
cmp "$binary_a" "$binary_b"

mkdir -p "$artifact_dir/dist" "$artifact_dir/evidence"
cp "$binary_a" "$artifact_dir/dist/capsule-mjs-source-validator-aarch64-apple-darwin"

digest_a=$(shasum -a 256 "$binary_a" | awk '{print $1}')
digest_b=$(shasum -a 256 "$binary_b" | awk '{print $1}')
size=$(stat -f '%z' "$binary_a")
lock_digest=$(shasum -a 256 "$artifact_dir/Cargo.lock" | awk '{print $1}')
rustc_version=$(rustc +1.95.0 --version)
cargo_version=$(cargo +1.95.0 --version)
host_version=$(sw_vers -productVersion)
host_build=$(sw_vers -buildVersion)

node - "$artifact_dir/evidence/reproduction.json" \
    "$digest_a" "$digest_b" "$size" "$lock_digest" \
    "$rustc_version" "$cargo_version" "$host_version" "$host_build" <<'NODE'
const [output, digestA, digestB, size, lockDigest, rustc, cargo, hostVersion, hostBuild] =
  process.argv.slice(2);
const evidence = {
  schema: "capsule.source-validator.reproduction/v1",
  method: "two clean copied source directories and two distinct Cargo target directories",
  network: "offline",
  independentBuilder: false,
  sameHost: true,
  target: "aarch64-apple-darwin",
  macosDeploymentTarget: "14.0",
  rustc,
  cargo,
  cargoLockSha256: lockDigest,
  rustflags:
    "--remap-path-prefix=<source>=/usr/src/capsule-mjs-source-validator",
  sourceDateEpoch: 0,
  artifactA: { bytes: Number(size), sha256: digestA },
  artifactB: { bytes: Number(size), sha256: digestB },
  byteIdentical: digestA === digestB,
  hostObservation: { macosVersion: hostVersion, build: hostBuild },
  limitation:
    "Same-host deterministic reproduction is not independent-builder or clean-host provenance.",
};
require("node:fs").writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
NODE

node "$artifact_dir/scripts/generate-evidence.mjs"
node "$artifact_dir/scripts/verify-evidence.mjs"
printf 'artifactSha256=%s\nartifactBytes=%s\n' "$digest_a" "$size"
