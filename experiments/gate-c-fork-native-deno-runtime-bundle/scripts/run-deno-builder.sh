#!/bin/sh
set -eu

if [ "$#" -ne 4 ]; then
  echo "usage: $0 {prepare|prefetch|build|all} DENO_CHECKOUT RUSTY_V8_BUNDLE STAGE_DIR" >&2
  exit 2
fi

mode=$1
deno=$(CDPATH='' cd -- "$2" && pwd)
rusty_bundle=$(CDPATH='' cd -- "$3" && pwd)
stage=$4
experiment=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
physical=$(CDPATH='' cd -- "$experiment/../gate-c-deno-core-physical-omission" && pwd)
builder='rust:1.95.0-bookworm@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1'

case "$stage" in
  /private/tmp/capsule-fork-native-deno-*) ;;
  *) echo "stage must be a fresh task-owned /private/tmp/capsule-fork-native-deno-* path" >&2; exit 1 ;;
esac

verify_sources() {
  test "$(git -C "$deno" rev-parse HEAD)" = 9adb0b68b55bca81644827f1e7749a3acb091bed
  test "$(git -C "$deno" rev-parse 'HEAD^{tree}')" = 72edd0f7b5f83b918945860653714e344c8a303f
  test -z "$(git -C "$deno" status --porcelain)"
  grep -F '"sourceCommit": "80e863ddb942a4aa2b384e794fc23e35b9d2bb15"' \
    "$rusty_bundle/release-manifest.json" >/dev/null
  while read -r digest name; do
    test "$(shasum -a 256 "$rusty_bundle/$name" | awk '{print $1}')" = "$digest"
  done < "$rusty_bundle/artifact-sha256sums.txt"
}

prepare() {
  verify_sources
  if [ -e "$stage" ]; then
    echo "refusing to replace Deno stage: $stage" >&2
    exit 1
  fi
  mkdir -p "$stage/inputs/rusty-v8" "$stage/probe/src" "$stage/probe-restored/src" \
    "$stage/scripts"
  cp -a "$deno/." "$stage/deno"
  cp -a "$deno/." "$stage/deno-restored"
  cp -a "$rusty_bundle/." "$stage/inputs/rusty-v8"
  cp "$experiment/builder/Cargo.lock" "$stage/probe/Cargo.lock"
  cp "$physical/probe/build.rs" "$stage/probe/build.rs"
  cp "$physical/probe/src/main.rs" "$stage/probe/src/main.rs"
  cp "$experiment/builder/Cargo.toml" "$stage/probe/Cargo.toml"
  cp "$stage/probe/Cargo.lock" "$stage/probe-restored/Cargo.lock"
  cp "$stage/probe/build.rs" "$stage/probe-restored/build.rs"
  cp "$stage/probe/src/main.rs" "$stage/probe-restored/src/main.rs"
  cp "$experiment/builder/Cargo-restored.toml" "$stage/probe-restored/Cargo.toml"
  cp -a "$physical/fixtures" "$stage/fixtures"
  cp "$experiment/builder/prefetch-deno.sh" "$stage/scripts/prefetch-deno.sh"
  cp "$experiment/builder/build-deno-offline.sh" "$stage/scripts/build-deno-offline.sh"
  cp "$experiment/builder/verify-deno-runtime.sh" "$stage/scripts/verify-deno-runtime.sh"
  chmod 0755 "$stage/scripts/"*.sh
  git -C "$stage/deno-restored" apply --directory=libs/core \
    "$stage/deno-restored/tools/capsule/governed-deno-core/patches/mutations/restore-op-print.patch"
  test -n "$(git -C "$stage/deno-restored" status --porcelain)"
  git -C "$stage/deno" archive --format=tar \
    --prefix=Shrimpworks-deno-9adb0b68b55b/ HEAD \
    | gzip -n -9 > "$stage/inputs/Shrimpworks-deno-9adb0b68b55b-source.tar.gz"
  printf 'deno.head=%s\n' "$(git -C "$stage/deno" rev-parse HEAD)"
  printf 'deno.tree=%s\n' "$(git -C "$stage/deno" rev-parse 'HEAD^{tree}')"
  printf 'deno.sourceArchive.sha256=%s\n' \
    "$(shasum -a 256 "$stage/inputs/Shrimpworks-deno-9adb0b68b55b-source.tar.gz" | awk '{print $1}')"
  printf 'rustyV8.archive.sha256=%s\n' \
    "$(shasum -a 256 "$stage/inputs/rusty-v8/librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz" | awk '{print $1}')"
}

prefetch() {
  test -d "$stage"
  docker run --rm --platform linux/arm64 --read-only \
    --cap-drop ALL --security-opt no-new-privileges --memory 4g --cpus 2 \
    --tmpfs /tmp:rw,nosuid,nodev -v "$stage:/workspace" -w /workspace \
    "$builder" sh scripts/prefetch-deno.sh
  printf 'builder.image=%s\n' "$builder"
  printf 'builder.platformImageId=%s\n' \
    "$(docker image inspect "$builder" --format '{{.Id}}')"
}

build() {
  test -d "$stage/cache"
  for step in a b compare-test; do
    docker run --rm --platform linux/arm64 --network none --read-only \
      --cap-drop ALL --security-opt no-new-privileges --security-opt seccomp=unconfined \
      --memory 10g --cpus 1 --cpuset-cpus 0 --tmpfs /tmp:rw,nosuid,nodev \
      -e GOVERNED_NETWORK_MODE=none -e GOVERNED_BUILD_STEP="$step" \
      -v "$stage:/workspace" -w /workspace \
      "$builder" sh scripts/build-deno-offline.sh
  done
}

case "$mode" in
  prepare) prepare ;;
  prefetch) prefetch ;;
  build) build ;;
  all) prepare; prefetch; build ;;
  *) echo "usage: $0 {prepare|prefetch|build|all} DENO_CHECKOUT RUSTY_V8_BUNDLE STAGE_DIR" >&2; exit 2 ;;
esac
