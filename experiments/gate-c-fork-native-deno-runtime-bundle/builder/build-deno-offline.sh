#!/bin/sh
set -eu

test "$(pwd)" = /workspace
test "${GOVERNED_NETWORK_MODE:-}" = none
test "$(nproc)" = 1
test "$(git -C deno rev-parse HEAD)" = 9adb0b68b55bca81644827f1e7749a3acb091bed
test "$(git -C deno rev-parse 'HEAD^{tree}')" = 72edd0f7b5f83b918945860653714e344c8a303f
test -z "$(git -C deno status --porcelain)"
test "$(git -C deno-restored rev-parse HEAD)" = 9adb0b68b55bca81644827f1e7749a3acb091bed
test -n "$(git -C deno-restored status --porcelain)"
test ! -e target
test -d cache/vendor
test -f cache/cargo-home/config.toml
test -f cache/cargo-source-bundle.tar.gz
test ! -e cache/sccache
test ! -e cache/ccache

if command -v sccache >/dev/null 2>&1 || command -v ccache >/dev/null 2>&1; then
  echo "compiler object cache executable is forbidden" >&2
  exit 1
fi
if awk 'NR > 1 && $2 == "00000000" { found=1 } END { exit found ? 0 : 1 }' /proc/net/route; then
  echo "default route exists in network-disabled Deno build" >&2
  exit 1
fi

archive=inputs/rusty-v8/librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz
binding=inputs/rusty-v8/src_binding_simdutf_release_aarch64-unknown-linux-gnu.rs
test "$(sha256sum "$archive" | awk '{print $1}')" = \
  "$(awk '$2 == "librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz" {print $1}' inputs/rusty-v8/artifact-sha256sums.txt)"
test "$(sha256sum "$binding" | awk '{print $1}')" = \
  "$(awk '$2 == "src_binding_simdutf_release_aarch64-unknown-linux-gnu.rs" {print $1}' inputs/rusty-v8/artifact-sha256sums.txt)"
grep -F '"sourceCommit": "80e863ddb942a4aa2b384e794fc23e35b9d2bb15"' \
  inputs/rusty-v8/release-manifest.json >/dev/null

export CARGO_HOME=/workspace/cache/cargo-home
export CARGO_NET_OFFLINE=true
export RUSTY_V8_ARCHIVE=/workspace/$archive
export RUSTY_V8_SRC_BINDING_PATH=/workspace/$binding
export SOURCE_DATE_EPOCH=0
export TZ=UTC
export LC_ALL=C
export LANG=C
unset SCCACHE CCACHE RUSTC_WRAPPER

build_one() {
  label=$1
  manifest=$2
  target=/workspace/target
  test ! -e "$target"
  test ! -e "/workspace/target-$label"
  test ! -e "/workspace/out/build-$label"
  mkdir -p "$target/tmp"
  export CARGO_TARGET_DIR="$target"
  export TMPDIR="$target/tmp"
  /usr/bin/setarch aarch64 -R cargo build --manifest-path "$manifest" \
    --locked --offline --release -j1

  binary=$target/release/capsule-deno-core-physical-omission
  snapshot=$(find "$target/release/build" \
    -path '*/out/capsule_core_snapshot.bin' -type f -print | LC_ALL=C sort | sed -n '1p')
  test -f "$binary"
  test -f "$snapshot"

  output=/workspace/out/build-$label
  mkdir -p "$output/bundle/bin" "$output/bundle/share/capsule-deno-core"
  install -m 0755 "$binary" "$output/bundle/bin/capsule-deno-core-physical-omission"
  install -m 0644 "$snapshot" "$output/bundle/share/capsule-deno-core/capsule_core_snapshot.bin"
  touch -d @0 "$output/bundle/bin/capsule-deno-core-physical-omission" \
    "$output/bundle/share/capsule-deno-core/capsule_core_snapshot.bin"
  (
    cd "$output/bundle"
    tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner --format=posix \
      --pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime \
      -cf - bin share | gzip -n -9 > "$output/capsule-deno-core-runtime-bundle.tar.gz"
    find bin share -type f -print | LC_ALL=C sort | while IFS= read -r file; do
      printf '%s\t%s\t%s\t%s\n' \
        "$(stat -c %a "$file")" "$(stat -c %s "$file")" \
        "$(sha256sum "$file" | awk '{print $1}')" "$file"
    done > "$output/bundle-manifest.tsv"
  )
  mv "$target" "/workspace/target-$label"
}

case "${GOVERNED_BUILD_STEP:-}" in
  a)
    test ! -e target-a
    test ! -e target-b
    test ! -e target-restored
    test ! -e out
    build_one a /workspace/probe/Cargo.toml
    exit 0
    ;;
  b)
    test -d target-a
    test -d out/build-a
    test ! -e target-b
    test ! -e target-restored
    test ! -e out/build-b
    build_one b /workspace/probe/Cargo.toml
    exit 0
    ;;
  compare-test)
    test -d target-a
    test -d target-b
    test -d out/build-a
    test -d out/build-b
    test ! -e target-restored
    test ! -e out/build-restored
    build_restored=yes
    ;;
  runtime-test)
    test -d target-a
    test -d target-b
    test -d target-restored
    test -d out/build-a
    test -d out/build-b
    test -d out/build-restored
    build_restored=no
    ;;
  *)
    echo "GOVERNED_BUILD_STEP must be a, b, compare-test, or runtime-test" >&2
    exit 2
    ;;
esac

cmp out/build-a/bundle-manifest.tsv out/build-b/bundle-manifest.tsv
cmp out/build-a/bundle/bin/capsule-deno-core-physical-omission \
  out/build-b/bundle/bin/capsule-deno-core-physical-omission
cmp out/build-a/bundle/share/capsule-deno-core/capsule_core_snapshot.bin \
  out/build-b/bundle/share/capsule-deno-core/capsule_core_snapshot.bin
cmp out/build-a/capsule-deno-core-runtime-bundle.tar.gz \
  out/build-b/capsule-deno-core-runtime-bundle.tar.gz

binary=out/build-a/bundle/bin/capsule-deno-core-physical-omission
snapshot=out/build-a/bundle/share/capsule-deno-core/capsule_core_snapshot.bin
bundle=out/build-a/capsule-deno-core-runtime-bundle.tar.gz
test "$(stat -c %s "$binary")" -le 104857600
test "$(stat -c %s "$snapshot")" -le 2097152
test "$(stat -c %s "$bundle")" -le 134217728
test "$(stat -c %s cache/cargo-source-bundle.tar.gz)" -le 268435456

nm -C --defined-only "$binary" \
  | grep -oE 'deno_core::ops_builtin(_types|_v8)?::op_[A-Za-z0-9_]+' \
  | sort -u > out/final-link-symbols.txt
expected='deno_core::ops_builtin_v8::op_get_ext_import_meta_proto
deno_core::ops_builtin_v8::op_get_extras_binding_object
deno_core::ops_builtin_v8::op_set_captured_bootstrap'
test "$(cat out/final-link-symbols.txt)" = "$expected"
readelf -h -l -d -V "$binary" > out/elf-proof.txt

if [ "$build_restored" = yes ]; then
  build_one restored /workspace/probe-restored/Cargo.toml
fi
binary=out/build-a/bundle/bin/capsule-deno-core-physical-omission
snapshot=out/build-a/bundle/share/capsule-deno-core/capsule_core_snapshot.bin
bundle=out/build-a/capsule-deno-core-runtime-bundle.tar.gz
restored=out/build-restored/bundle/bin/capsule-deno-core-physical-omission
/workspace/scripts/verify-deno-runtime.sh "$binary" "$restored" \
  /workspace/fixtures /workspace/out/runtime-evidence \
  > /workspace/out/runtime-verification.txt

rustc -Vv > out/rustc-version.txt
cargo -Vv > out/cargo-version.txt
{
  printf 'networkMode=none\n'
  printf 'compilerCache=absent\n'
  printf 'snapshotBuilderLogicalCpus=1\n'
  printf 'snapshotBuilderCpuSet=0\n'
  printf 'targetAExistedBeforeBuild=false\n'
  printf 'targetBExistedBeforeBuild=false\n'
  printf 'outputExistedBeforeBuild=false\n'
} > out/build-boundary.txt
printf 'binary.size=%s\n' "$(stat -c %s "$binary")"
printf 'binary.sha256=%s\n' "$(sha256sum "$binary" | awk '{print $1}')"
printf 'snapshot.size=%s\n' "$(stat -c %s "$snapshot")"
printf 'snapshot.sha256=%s\n' "$(sha256sum "$snapshot" | awk '{print $1}')"
printf 'bundle.size=%s\n' "$(stat -c %s "$bundle")"
printf 'bundle.sha256=%s\n' "$(sha256sum "$bundle" | awk '{print $1}')"
printf 'sameHostBuildAB=byte-equal\n'
