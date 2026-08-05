#!/bin/sh
set -eu

test "$(pwd)" = /workspace
test "$(sed -n 's/^commit=//p' inputs/source-ref.txt)" = \
  da10f70f0bbb83e0c2b45df50761c557e1e6f43f
test ! -e target
test ! -e out
test ! -e cache

mkdir -p cache/cargo-home cache/vendor cache/tmp
export CARGO_HOME=/workspace/cache/cargo-home
export TMPDIR=/workspace/cache/tmp

cargo fetch --locked --manifest-path probe/Cargo.toml
cargo vendor --locked --offline --versioned-dirs \
  --manifest-path probe/Cargo.toml /workspace/cache/vendor \
  > cache/vendor-config.toml
cp cache/vendor-config.toml cache/cargo-home/config.toml
cat >> cache/cargo-home/config.toml <<'EOF'

[net]
offline = true
EOF

package_count=$(find cache/vendor -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
test "$package_count" = 189
tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner --format=posix \
  --pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime \
  -cf - -C cache vendor | gzip -n -9 > cache/cargo-source-bundle.tar.gz

printf 'cargoRegistrySourcePackages=%s\n' "$package_count"
printf 'cargoSourceBundle.size=%s\n' "$(stat -c %s cache/cargo-source-bundle.tar.gz)"
printf 'cargoSourceBundle.sha256=%s\n' \
  "$(sha256sum cache/cargo-source-bundle.tar.gz | awk '{print $1}')"
