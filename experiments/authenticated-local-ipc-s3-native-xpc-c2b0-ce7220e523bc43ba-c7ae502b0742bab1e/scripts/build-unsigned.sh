#!/bin/sh
set -eu

experiment_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
build_root="$experiment_dir/.build"
build_a="$build_root/a"
build_b="$build_root/b"

mkdir -p "$build_a" "$build_b"

build_once() {
  destination=$1
  common_flags="-std=c17 -fblocks -Wall -Wextra -Werror -Os -fvisibility=hidden -ffile-prefix-map=$experiment_dir=."
  link_flags="-Wl,-no_uuid -Wl,-no_adhoc_codesign"
  includes="-I$experiment_dir/include -I$experiment_dir/generated"

  # shellcheck disable=SC2086
  xcrun clang $common_flags $includes $link_flags \
    "$experiment_dir/src/contract.c" "$experiment_dir/src/server.m" \
    -framework CoreFoundation -framework Security \
    -o "$destination/capsule-c2s3-e7220e523bc4-7ae502b0742b-server"

  build_client() {
    output=$1
    role=$2
    tag=$3
    # shellcheck disable=SC2086
    xcrun clang $common_flags $includes $link_flags \
      "-DCAPSULE_C2B0_CLIENT_ROLE=\"$role\"" \
      "-DCAPSULE_C2B0_CLIENT_ALLOWED_TAG=$tag" \
      "$experiment_dir/src/contract.c" "$experiment_dir/src/client.m" \
      -framework CoreFoundation -framework Security \
      -o "$destination/$output"
  }

  build_client capsule-c2s3-e7220e523bc4-7ae502b0742b-client-cli internal-alpha-cli 1
  build_client capsule-c2s3-e7220e523bc4-7ae502b0742b-client-daemon daemon 2
  build_client capsule-c2s3-e7220e523bc4-7ae502b0742b-client-broker broker 3
  build_client capsule-c2s3-e7220e523bc4-7ae502b0742b-client-negative negative 0
}

build_once "$build_a"
build_once "$build_b"

for file_a in "$build_a"/*; do
  name=${file_a##*/}
  file_b="$build_b/$name"
  cmp "$file_a" "$file_b"
  if otool -l "$file_a" | grep -Eq 'LC_UUID|LC_CODE_SIGNATURE'; then
    echo "unexpected UUID or code-signature load command: $name" >&2
    exit 1
  fi
  if nm -u "$file_a" | grep -Eq '_system$|_popen$|_posix_spawn$|_execv|_fork$'; then
    echo "unexpected process-launch import: $name" >&2
    exit 1
  fi
  shasum -a 256 "$file_a"
done

echo 'PASSED: two clean unsigned builds are byte-identical; no UUID/signature load command exists'
