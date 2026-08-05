#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: $0 STAGE" >&2
  exit 2
fi

stage=$(CDPATH='' cd -- "$1" && pwd)
test "${CAPSULE_BUILD_NETWORK_MODE:-}" = none
test ! -e "$stage/target-macos"
test ! -e "$stage/out/macos"
test "$(git -C "$stage/libkrun" rev-parse HEAD)" = \
  cf0333cdba478cc34a8570a65b38412da7fd3ecc
test "$(git -C "$stage/libkrun" rev-parse 'HEAD^{tree}')" = \
  ffa4131ddcc6ec66edd623381dae94189ccd3fee
test -z "$(git -C "$stage/libkrun" status --porcelain)"
test "$(shasum -a 256 "$stage/libkrun/Cargo.lock" | awk '{print $1}')" = \
  9d5dc785636a264794a396ab478821c4ed33acae91650db8d72e8a35733f288c
test "$(shasum -a 256 "$stage/inputs/libkrunfw/kernel.c" | awk '{print $1}')" = \
  96561a4e5dccec0364a28ac32c5668e13e31180d083f412c9f8be7599380c70d

mkdir -p "$stage/cargo-home" "$stage/target-macos" "$stage/out/macos/evidence"
cp "$stage/inputs/cargo-config.toml" "$stage/cargo-home/config.toml"

export CARGO_HOME="$stage/cargo-home"
export CARGO_NET_OFFLINE=true
export CARGO_TARGET_DIR="$stage/target-macos"
export MACOSX_DEPLOYMENT_TARGET=14.0
export SOURCE_DATE_EPOCH=0
export TZ=UTC
export LC_ALL=C
export LANG=C
export RUSTFLAGS="-Cdebuginfo=0 --remap-path-prefix=$stage=/usr/src/capsule-c2b-no-guest-artifact-closure"
unset SCCACHE CCACHE RUSTC_WRAPPER

cargo build \
  --manifest-path "$stage/libkrun/Cargo.toml" \
  --package libkrun \
  --release \
  --locked \
  --offline \
  --no-default-features \
  --features blk

install -m 0755 "$stage/target-macos/release/libkrun.dylib" \
  "$stage/out/macos/libkrun.1.dylib"

MACOSX_DEPLOYMENT_TARGET=14.0 make -C "$stage/inputs/libkrunfw"
install -m 0755 "$stage/inputs/libkrunfw/libkrunfw.5.dylib" \
  "$stage/out/macos/libkrunfw.5.dylib"

clang -std=c17 -Wall -Wextra -Werror \
  "$stage/harness/source/extract-krunfw-kernel.c" \
  "$stage/out/macos/libkrunfw.5.dylib" \
  -Wl,-rpath,@executable_path \
  -o "$stage/out/macos/extract-krunfw-kernel"
DYLD_LIBRARY_PATH="$stage/out/macos" \
  "$stage/out/macos/extract-krunfw-kernel" \
  "$stage/out/macos/linux-6.12.91-arm64.bin" \
  > "$stage/out/macos/evidence/kernel-extraction.txt"

clang -std=c17 -Wall -Wextra -Werror -Wno-comment \
  -I "$stage/libkrun/include" \
  "$stage/harness/source/host-runner-preflight.c" \
  "$stage/out/macos/libkrun.1.dylib" \
  -Wl,-rpath,@executable_path \
  -o "$stage/out/macos/capsule-host-runner-preflight"
clang -std=c17 -Wall -Wextra -Werror \
  "$stage/harness/source/run-host-runner-preflight-tests.c" \
  -o "$stage/out/macos/run-host-runner-preflight-tests"
"$stage/out/macos/run-host-runner-preflight-tests" \
  "$stage/out/macos/capsule-host-runner-preflight" \
  > "$stage/out/macos/evidence/preflight-mutations.txt"

(
  cd "$stage/out/macos"
  otool -l libkrun.1.dylib > evidence/libkrun-macho.txt
  otool -l libkrunfw.5.dylib > evidence/libkrunfw-macho.txt
  otool -L capsule-host-runner-preflight > evidence/runner-loads.txt
  nm -gU libkrun.1.dylib > evidence/libkrun-exports.txt
  file capsule-host-runner-preflight extract-krunfw-kernel \
    run-host-runner-preflight-tests \
    libkrun.1.dylib libkrunfw.5.dylib linux-6.12.91-arm64.bin \
    > evidence/file.txt
)
(
  cd "$stage/out/macos"
  find . -maxdepth 1 -type f ! -name 'SHA256SUMS' -print \
    | LC_ALL=C sort \
    | while IFS= read -r file; do
        printf '%s  %s\n' "$(shasum -a 256 "$file" | awk '{print $1}')" "$file"
      done > SHA256SUMS
)
