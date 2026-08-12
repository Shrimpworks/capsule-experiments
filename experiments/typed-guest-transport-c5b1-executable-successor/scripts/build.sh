#!/bin/sh
set -eu

experiment_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
build_root=${TMPDIR:-/tmp}/capsule-c5b1-build
build_a=$build_root/a
build_b=$build_root/b

case "$experiment_dir" in
  *" "*) printf '%s\n' 'experiment path with spaces is unsupported' >&2; exit 2 ;;
esac

rm -rf "$build_root"
mkdir -p "$build_a" "$build_b" "$experiment_dir/dist"

node "$experiment_dir/scripts/sync-inputs.mjs"

build_once() {
  destination=$1
  cargo_target=$destination/cargo
  CARGO_NET_OFFLINE=true \
  CARGO_TARGET_DIR="$cargo_target" \
  CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_LINKER="$experiment_dir/scripts/aarch64-linux-linker.sh" \
  SOURCE_DATE_EPOCH=0 \
  RUSTFLAGS="--remap-path-prefix=$experiment_dir=/capsule/c5b1 -C link-arg=-Wl,--build-id=none" \
    cargo build --manifest-path "$experiment_dir/Cargo.toml" \
      --release --locked --target aarch64-unknown-linux-musl

  cp "$cargo_target/aarch64-unknown-linux-musl/release/capsule-init-krun" "$destination/trusted-init"
  cp "$cargo_target/aarch64-unknown-linux-musl/release/capsule-launcher" "$destination/trusted-launcher"
  chmod 0755 "$destination/trusted-init" "$destination/trusted-launcher"

  node "$experiment_dir/scripts/build-root.mjs" \
    "$destination/trusted-init" \
    "$destination/trusted-launcher" \
    "$experiment_dir/inputs/c5b0/main.mjs" \
    "$experiment_dir/inputs/c5b0/source-manifest.cbor" \
    "$experiment_dir/inputs/c5b0/input.json" \
    "$destination/runtime-root.ext4"

  root_sha=$(shasum -a 256 "$destination/runtime-root.ext4" | awk '{print $1}')
  /usr/bin/clang -arch arm64 -std=c17 -O2 -Wall -Wextra -Werror \
    -Wno-deprecated-declarations -Wl,-no_uuid -Wl,-no_adhoc_codesign \
    -DC5B1_ROOT_SHA256=\"$root_sha\" \
    "$experiment_dir/source/host-runner.c" -o "$destination/host-runner"
  /usr/bin/clang -arch arm64 -std=c17 -O2 -Wall -Wextra -Werror \
    -Wl,-no_uuid -Wl,-no_adhoc_codesign \
    "$experiment_dir/source/controller.c" -o "$destination/controller"
  chmod 0755 "$destination/host-runner" "$destination/controller"
}

build_once "$build_a"
build_once "$build_b"

for artifact in trusted-init trusted-launcher runtime-root.ext4 host-runner controller; do
  cmp "$build_a/$artifact" "$build_b/$artifact"
  cp "$build_a/$artifact" "$experiment_dir/dist/$artifact"
done
chmod 0755 "$experiment_dir/dist/trusted-init" "$experiment_dir/dist/trusted-launcher" \
  "$experiment_dir/dist/host-runner" "$experiment_dir/dist/controller"
chmod 0644 "$experiment_dir/dist/runtime-root.ext4"

printf '%s\n' 'C5b1 deterministic build PASSED; no artifact was executed'
