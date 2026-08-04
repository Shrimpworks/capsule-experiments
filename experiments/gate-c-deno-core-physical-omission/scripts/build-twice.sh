#!/bin/sh
set -eu

if [ "$#" -ne 4 ]; then
  echo "usage: $0 RUSTY_V8_ARCHIVE CARGO_REGISTRY TARGET_A TARGET_B" >&2
  exit 2
fi

experiment=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
v8_archive=$1
cargo_registry=$2
target_a=$3
target_b=$4
image=sha256:b8483b5baafc8f085feb4a48ef34993b182de50d86ed03fd13b98b166e7a0ad6
expected_binary=597baba6b9f50fc619ce667a352e19686f8c73efc6819d137b3c4081450fd6f5
expected_snapshot=ef5f1e7883bbf62a6422957ff0eea51a06d4b35cad1f47dc9c9ae137ab8dfa0b

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

test "$(sha256 "$v8_archive")" = \
  8d91df74c8a671c23f880e64038023f49e07ca85c96e15d76a87e2aac9b20595
test -d "$cargo_registry"
test -d "$experiment/.work/deno_core-0.409.0"

actual_image=$(docker image inspect "$image" --format '{{.Id}}')
test "$actual_image" = "$image"

cargo_home=$(mktemp -d "${TMPDIR:-/tmp}/capsule-deno-cargo.XXXXXX")
trap 'rm -rf "$cargo_home"' EXIT

build_one() {
  target=$1
  if [ -e "$target" ]; then
    echo "refusing to replace target directory: $target" >&2
    exit 1
  fi
  mkdir -p "$target/tmp"
  target=$(CDPATH='' cd -- "$target" && pwd)

  docker run --rm --platform linux/arm64 --network none --read-only \
    --cap-drop ALL --security-opt no-new-privileges --security-opt seccomp=unconfined \
    --memory 8g --cpus 4 \
    -e CARGO_HOME=/cargo-home -e CARGO_NET_OFFLINE=true \
    -e RUSTY_V8_ARCHIVE=/rusty-v8.a.gz -e CARGO_TARGET_DIR=/target \
    -e TMPDIR=/target/tmp -e SOURCE_DATE_EPOCH=0 -e TZ=UTC \
    -e LC_ALL=C -e LANG=C \
    -v "$experiment:/workspace:ro" \
    -v "$cargo_home:/cargo-home" \
    -v "$cargo_registry:/cargo-home/registry:ro" \
    -v "$target:/target" \
    -v "$v8_archive:/rusty-v8.a.gz:ro" \
    -w /workspace/probe --entrypoint /usr/bin/setarch "$image" \
    aarch64 -R cargo build --locked --offline --release -j1
}

build_one "$target_a"
build_one "$target_b"

binary_a=$target_a/release/capsule-deno-core-physical-omission
binary_b=$target_b/release/capsule-deno-core-physical-omission
snapshot_a=$(find "$target_a/release/build" -path '*/out/capsule_core_snapshot.bin' -print -quit)
snapshot_b=$(find "$target_b/release/build" -path '*/out/capsule_core_snapshot.bin' -print -quit)

cmp "$binary_a" "$binary_b"
cmp "$snapshot_a" "$snapshot_b"
test "$(sha256 "$binary_a")" = "$expected_binary"
test "$(sha256 "$snapshot_a")" = "$expected_snapshot"

symbols=$(nm -C --defined-only "$binary_a" \
  | rg -o 'deno_core::ops_builtin(?:_types|_v8)?::op_[A-Za-z0-9_]+' \
  | sort -u)
expected_symbols='deno_core::ops_builtin_v8::op_get_ext_import_meta_proto
deno_core::ops_builtin_v8::op_get_extras_binding_object
deno_core::ops_builtin_v8::op_set_captured_bootstrap'
test "$symbols" = "$expected_symbols"

printf 'binary.sha256=%s\nsnapshot.sha256=%s\n%s\n' \
  "$expected_binary" "$expected_snapshot" "$symbols"
