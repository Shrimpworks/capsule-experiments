#!/bin/sh
set -eu

test "$(pwd)" = /workspace
test "$(git -C deno rev-parse HEAD)" = 9adb0b68b55bca81644827f1e7749a3acb091bed
test "$(git -C deno rev-parse 'HEAD^{tree}')" = 72edd0f7b5f83b918945860653714e344c8a303f
test -z "$(git -C deno status --porcelain)"
test ! -e target-a
test ! -e target-b
test ! -e target-restored
test ! -e out
test ! -e cache

mkdir -p cache/cargo-home cache/vendor cache/tmp
export CARGO_HOME=/workspace/cache/cargo-home
export TMPDIR=/workspace/cache/tmp

cargo fetch --locked --manifest-path probe/Cargo.toml
cargo fetch --locked --manifest-path probe-restored/Cargo.toml
cargo vendor --locked --offline --versioned-dirs \
  --manifest-path probe/Cargo.toml /workspace/cache/vendor \
  > cache/vendor-config.toml

cat cache/vendor-config.toml > cache/cargo-home/config.toml
cat >> cache/cargo-home/config.toml <<'CONFIG'

[net]
offline = true
CONFIG

test "$(find cache/vendor -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')" = 189
tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner --format=posix \
  --pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime \
  -cf - -C cache vendor | gzip -n -9 > cache/cargo-source-bundle.tar.gz

printf 'cargoRegistrySourcePackages=189\n'
printf 'cargoSourceBundle.sha256=%s\n' \
  "$(sha256sum cache/cargo-source-bundle.tar.gz | awk '{print $1}')"
