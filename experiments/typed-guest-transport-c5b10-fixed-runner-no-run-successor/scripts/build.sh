#!/bin/sh
set -eu

experiment_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
repository_dir=$(CDPATH= cd -- "$experiment_dir/../.." && pwd)
capsule_build_root=$(mktemp -d "${TMPDIR:-/tmp}/capsule-c5b10-build.XXXXXX")
trap 'rm -rf "$capsule_build_root"' EXIT HUP INT TERM

mkdir -p "$capsule_build_root/a" "$capsule_build_root/b" "$experiment_dir/dist"

build_once() {
  destination=$1
  /usr/bin/clang -arch arm64 -std=c17 -O2 -Wall -Wextra -Werror \
    -Wno-deprecated-declarations -fno-ident \
    -I"$repository_dir/experiments/typed-guest-transport-c5b2-governed-input-closure/inputs/c2b-v4" \
    -c "$experiment_dir/source/fixed_runner.c" \
    -o "$destination/fixed-runner.o"
  /usr/bin/clang -arch arm64 -std=c17 -O2 -Wall -Wextra -Werror \
    -fno-ident -I"$experiment_dir/source" \
    -c "$experiment_dir/source/supervisor_effect_driver.c" \
    -o "$destination/supervisor-effect-driver.o"
}

build_once "$capsule_build_root/a"
build_once "$capsule_build_root/b"

for artifact in fixed-runner.o supervisor-effect-driver.o; do
  cmp "$capsule_build_root/a/$artifact" "$capsule_build_root/b/$artifact"
  cp "$capsule_build_root/a/$artifact" "$experiment_dir/dist/$artifact"
  chmod 0644 "$experiment_dir/dist/$artifact"
done

printf '%s\n' 'C5b10 deterministic object construction PASSED; no artifact was linked, loaded, or executed'
