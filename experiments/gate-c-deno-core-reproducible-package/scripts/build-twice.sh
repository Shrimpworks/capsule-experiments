#!/bin/sh
set -eu

if [ "$#" -ne 6 ]; then
  echo "usage: $0 DENO_CORE_CRATE DENO_SOURCE_ARCHIVE RUSTY_V8_ARCHIVE CARGO_SOURCE_BUNDLE BUILD_A BUILD_B" >&2
  exit 2
fi

experiment=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
physical=$(CDPATH='' cd -- "$experiment/../gate-c-deno-core-physical-omission" && pwd)
core_crate=$1
deno_source=$2
v8_archive=$3
source_bundle=$4
build_a=$5
build_b=$6
builder=rust:1.95.0-bookworm@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1
expected_binary=597baba6b9f50fc619ce667a352e19686f8c73efc6819d137b3c4081450fd6f5
expected_snapshot=ef5f1e7883bbf62a6422957ff0eea51a06d4b35cad1f47dc9c9ae137ab8dfa0b
expected_bundle=da8f755832a6fceba37078c58cc67c4136bc823acc75fe377ec4c1b98a8ef498

"$experiment/scripts/check-inputs.sh" \
  "$core_crate" "$deno_source" "$v8_archive" "$source_bundle"

for path in "$build_a" "$build_b"; do
  if [ -e "$path" ]; then
    echo "refusing to replace build directory: $path" >&2
    exit 1
  fi
  mkdir -p "$path"
done

build_one() {
  output=$1
  output=$(CDPATH='' cd -- "$output" && pwd)
  mkdir -p "$output/workspace" "$output/cargo-home" "$output/target/tmp"
  docker run --rm --platform linux/arm64 --network none --read-only \
    --cap-drop ALL --security-opt no-new-privileges --security-opt seccomp=unconfined \
    --memory 8g --cpus 4 \
    -e CARGO_HOME=/cargo-home -e CARGO_NET_OFFLINE=true \
    -e RUSTY_V8_ARCHIVE=/inputs/rusty-v8.a.gz \
    -e CARGO_TARGET_DIR=/target -e TMPDIR=/target/tmp \
    -e SOURCE_DATE_EPOCH=0 -e TZ=UTC -e LC_ALL=C -e LANG=C \
    -v "$physical:/physical:ro" -v "$experiment:/package-experiment:ro" \
    -v "$core_crate:/inputs/deno_core.crate:ro" \
    -v "$v8_archive:/inputs/rusty-v8.a.gz:ro" \
    -v "$source_bundle:/inputs/cargo-source-bundle.tar.gz:ro" \
    -v "$output/workspace:/workspace" -v "$output/cargo-home:/cargo-home" \
    -v "$output/target:/target" --entrypoint /bin/sh "$builder" -c '
      set -eu
      mkdir -p /workspace/.work /cargo-home/registry/src/index.crates.io-1949cf8c6b5b557f
      cp -a /physical/probe /workspace/probe
      cp -a /physical/fixtures /workspace/fixtures
      cp /package-experiment/cargo-config.toml /cargo-home/config.toml
      tar -xzf /inputs/deno_core.crate -C /workspace/.work
      git apply --unsafe-paths --directory=/workspace/.work/deno_core-0.409.0 \
        /physical/patches/0001-physically-allowlist-bootstrap-ops.patch
      git apply --unsafe-paths --directory=/workspace/.work/deno_core-0.409.0 \
        /physical/patches/0002-canonicalize-snapshot-module-order.patch
      tar -xzf /inputs/cargo-source-bundle.tar.gz -C /target/tmp
      cp -a /target/tmp/vendor/. /cargo-home/registry/src/index.crates.io-1949cf8c6b5b557f/
      cd /workspace/probe
      /usr/bin/setarch aarch64 -R cargo build --locked --offline --release -j1
    '

  binary=$output/target/release/capsule-deno-core-physical-omission
  snapshot=$(find "$output/target/release/build" \
    -path '*/out/capsule_core_snapshot.bin' -print -quit)
  test -f "$binary"
  test -f "$snapshot"
  mkdir -p "$output/bundle/bin" "$output/bundle/share/capsule-deno-core"
  cp "$binary" "$output/bundle/bin/capsule-deno-core-physical-omission"
  cp "$snapshot" "$output/bundle/share/capsule-deno-core/capsule_core_snapshot.bin"
  chmod 0755 "$output/bundle/bin/capsule-deno-core-physical-omission"
  chmod 0644 "$output/bundle/share/capsule-deno-core/capsule_core_snapshot.bin"
  touch -t 197001010000 "$output/bundle/bin/capsule-deno-core-physical-omission" \
    "$output/bundle/share/capsule-deno-core/capsule_core_snapshot.bin"

  docker run --rm --platform linux/arm64 --network none --read-only \
    --cap-drop ALL --security-opt no-new-privileges \
    -e TZ=UTC -e LC_ALL=C -e LANG=C \
    -v "$output/bundle:/bundle:ro" -v "$output:/out" \
    -w /bundle --entrypoint /bin/sh "$builder" \
    -c 'tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner --format=posix --pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime -cf - bin share | gzip -n -9 > /out/capsule-deno-core-runtime-bundle.tar.gz'

  (
    cd "$output/bundle"
    find bin share -type f -print | LC_ALL=C sort | while IFS= read -r file; do
      mode=$(stat -f '%Lp' "$file" 2>/dev/null || stat -c '%a' "$file")
      size=$(wc -c <"$file" | tr -d ' ')
      digest=$(shasum -a 256 "$file" | awk '{print $1}')
      printf '%s  %s  %s  %s\n' "$mode" "$size" "$digest" "$file"
    done
  ) >"$output/bundle-manifest.txt"
}

build_one "$build_a"
build_one "$build_b"

cmp "$build_a/bundle-manifest.txt" "$build_b/bundle-manifest.txt"
cmp "$build_a/capsule-deno-core-runtime-bundle.tar.gz" \
  "$build_b/capsule-deno-core-runtime-bundle.tar.gz"
while read -r mode size digest path; do
  test "$mode" = "$(awk -v wanted="$path" '$4 == wanted {print $1}' "$build_b/bundle-manifest.txt")"
  cmp "$build_a/bundle/$path" "$build_b/bundle/$path"
done <"$build_a/bundle-manifest.txt"

binary=$build_a/bundle/bin/capsule-deno-core-physical-omission
symbols=$(docker run --rm --platform linux/arm64 --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges \
  -v "$binary:/probe:ro" --entrypoint /bin/sh "$builder" \
  -c "nm -C --defined-only /probe | grep -oE 'deno_core::ops_builtin(_types|_v8)?::op_[A-Za-z0-9_]+' | sort -u")
expected_symbols='deno_core::ops_builtin_v8::op_get_ext_import_meta_proto
deno_core::ops_builtin_v8::op_get_extras_binding_object
deno_core::ops_builtin_v8::op_set_captured_bootstrap'
test "$symbols" = "$expected_symbols"

binary_sha=$(shasum -a 256 "$binary" | awk '{print $1}')
snapshot_sha=$(shasum -a 256 \
  "$build_a/bundle/share/capsule-deno-core/capsule_core_snapshot.bin" | awk '{print $1}')
bundle_sha=$(shasum -a 256 \
  "$build_a/capsule-deno-core-runtime-bundle.tar.gz" | awk '{print $1}')
test "$binary_sha" = "$expected_binary"
test "$snapshot_sha" = "$expected_snapshot"
test "$bundle_sha" = "$expected_bundle"
printf 'reproducibility.level=same-host-independent-clean-containers\n'
printf 'binary.sha256=%s\nsnapshot.sha256=%s\nbundle.sha256=%s\n%s\n' \
  "$binary_sha" "$snapshot_sha" "$bundle_sha" "$symbols"
