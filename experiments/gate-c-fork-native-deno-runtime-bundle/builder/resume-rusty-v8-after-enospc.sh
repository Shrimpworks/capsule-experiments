#!/bin/sh
set -eu

root=/workspace
cache=$root/.governed-cache-arm64
target=$root/target/governed-v150.2.0-linux-arm64
gn_out=$target/aarch64-unknown-linux-gnu/release/gn_out
rust_toolchain=$cache/rust-toolchain
cross=$cache/cross
libclang=$cache/llvm19/usr/lib/llvm-19/lib
llvm19_lib=$cache/llvm19/usr/lib/x86_64-linux-gnu
cross_host_lib=$cross/usr/lib/x86_64-linux-gnu
linker=$root/scripts/governed/link_arm64.sh
runner=$cross/usr/bin/qemu-aarch64-static
target_root=$cross/usr/aarch64-linux-gnu
readelf=$cross/usr/bin/aarch64-linux-gnu-readelf

test "$(pwd)" = /workspace
test "${GOVERNED_NETWORK_MODE:-}" = none
test "$(git rev-parse HEAD)" = 80e863ddb942a4aa2b384e794fc23e35b9d2bb15
test "$(sha256sum "$gn_out/obj/librusty_v8.a" | awk '{print $1}')" = \
  e964d6b1b3689e91f8cf488d8a9f05764a03434b2e2e8347be5067300d39a7de
test "$(find "$gn_out" -type f -name '*.o' | wc -l | tr -d ' ')" = 0
test -f governed-out/v150.2.0/linux-arm64-blocker/blocker.json
grep -F '"phase": "fixed-test-compile"' \
  governed-out/v150.2.0/linux-arm64-blocker/blocker.json >/dev/null
if awk 'NR > 1 && $2 == "00000000" { found=1 } END { exit found ? 0 : 1 }' /proc/net/route; then
  echo "default network route exists in resumed network-disabled ARM64 checks" >&2
  exit 1
fi

export PATH="$rust_toolchain/bin:$cross/usr/bin:$PATH"
export CARGO_HOME="$cache/cargo-home"
export CARGO_TARGET_DIR="$target"
export CARGO_NET_OFFLINE=true
export RUSTC="$rust_toolchain/bin/rustc"
export CLANG_BASE_PATH="$cache/clang"
export LIBCLANG_PATH="$libclang"
export LD_LIBRARY_PATH="$llvm19_lib:$cross_host_lib"
export RUSTY_V8_BINDGEN_RESOURCE_DIR="$libclang/clang/19"
export RUSTY_V8_GLIBC_SYSROOT="$target_root"
export GN="$cache/gn/gn"
export NINJA="$cache/ninja/ninja"
export V8_FROM_SOURCE=1
export PRINT_GN_ARGS=1
export SOURCE_DATE_EPOCH=1784209467
export LANG=C.UTF-8
export LC_ALL=C.UTF-8
export TZ=UTC
export NUM_JOBS=8
export CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER="$linker"
export CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_RUNNER="$runner -L $target_root"
unset SCCACHE CCACHE RUSTC_WRAPPER BINDGEN_EXTRA_CLANG_ARGS

python3 scripts/governed/verify_arm64_inputs.py --require-submodules
printf 'resumeReason=task-owned-gn-object-cleanup-after-docker-enospc\n'
printf 'governedArchiveBeforeResume=%s\n' \
  "$(sha256sum "$gn_out/obj/librusty_v8.a" | awk '{print $1}')"

"$rust_toolchain/bin/cargo" test --frozen --release \
  --target aarch64-unknown-linux-gnu --features simdutf \
  --test test_api --no-run -j8 2>&1 | tee "$target/fixed-test-compile-resume.log"

candidates=$target/fixed-test-binary-candidates.txt
find "$target/aarch64-unknown-linux-gnu/release/deps" \
  -maxdepth 1 -type f -name 'test_api-*' -perm -0100 -print | sort > "$candidates"
test "$(wc -l < "$candidates" | tr -d ' ')" = 1
test_binary=$(sed -n '1p' "$candidates")
printf '%s\n' "$test_binary" > "$target/fixed-test-binary.path"
"$readelf" -h "$test_binary" | tee "$target/fixed-test-readelf.log"
grep -Eq 'Machine:[[:space:]]+AArch64' "$target/fixed-test-readelf.log"
"$runner" -L "$target_root" "$test_binary" get_version --exact \
  2>&1 | tee "$target/fixed-verification.txt"

# The required binary has run. Reclaim only Cargo/GN intermediates from this
# task-owned target before evidence collection; preserve the archive, binding,
# Ninja databases/graph inputs, build log, and all fixed verification logs.
rm -rf \
  "$target/aarch64-unknown-linux-gnu/release/deps" \
  "$target/aarch64-unknown-linux-gnu/release/build" \
  "$target/aarch64-unknown-linux-gnu/release/.fingerprint" \
  "$target/aarch64-unknown-linux-gnu/release/incremental" \
  "$target/release/deps" \
  "$target/release/build" \
  "$target/release/.fingerprint" \
  "$target/release/incremental"
test "$(sha256sum "$gn_out/obj/librusty_v8.a" | awk '{print $1}')" = \
  e964d6b1b3689e91f8cf488d8a9f05764a03434b2e2e8347be5067300d39a7de
df -h /workspace

python3 scripts/governed/collect_arm64_evidence.py \
  2>&1 | tee "$target/evidence-collection-resume.log"
python3 scripts/governed/verify_arm64_release.py \
  governed-out/v150.2.0/linux-arm64 \
  2>&1 | tee "$target/bundle-verification-resume.log"
printf 'governedArchiveAfterResume=%s\n' \
  "$(sha256sum "$gn_out/obj/librusty_v8.a" | awk '{print $1}')"
printf 'resumeResult=all-required-fixed-tests-evidence-and-bundle-verification-passed\n'
