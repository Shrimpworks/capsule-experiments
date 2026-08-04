#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: $0 DENO_V2_9_4_SOURCE_ROOT" >&2
  exit 2
fi

source_root=$1
test -f "$source_root/Cargo.toml"
test -f "$source_root/Cargo.lock"
test -f "$source_root/rust-toolchain.toml"

rg -q '^channel = "1\.95\.0"' "$source_root/rust-toolchain.toml"
rg -q '^deno_core = \{ version = "0\.409\.0"' "$source_root/Cargo.toml"
rg -q '^v8 = \{ version = "150\.2\.0"' "$source_root/Cargo.toml"
rg -q '^deno_ast = \{ version = "=0\.53\.3"' "$source_root/Cargo.toml"
rg -q '^const TYPESCRIPT: &str = "6\.0\.3";' "$source_root/cli/lib/version.rs"

for relative in \
  Cargo.toml \
  Cargo.lock \
  rust-toolchain.toml \
  libs/core/ops_builtin.rs \
  libs/core/runtime/jsruntime.rs \
  cli/lib/worker.rs \
  cli/lib/version.rs \
  cli/tsc/00_typescript.js \
  runtime/ops/worker_host.rs \
  ext/webstorage/lib.rs \
  ext/cache/sqlite.rs
do
  test -f "$source_root/$relative"
  shasum -a 256 "$source_root/$relative"
done

find "$source_root/libs/core" -type f | LC_ALL=C sort | wc -l | awk '{print "libs/core files: " $1}'
find "$source_root/libs/core" -type f \( -name '*.rs' -o -name '*.js' \) -print0 |
  xargs -0 wc -l | tail -1 | awk '{print "libs/core Rust+JavaScript lines: " $1}'
