#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
clang=$(xcrun --find clang)
sdkroot=$(xcrun --sdk macosx --show-sdk-path)
mkdir -p "$root/dist"
test_binary="${TMPDIR:-/tmp}/capsule-c5b8-test-double.$$"
trap 'rm -f "$test_binary"' EXIT

build_one() {
  destination=$1
  "$clang" \
    -target arm64-apple-macos14 \
    -isysroot "$sdkroot" \
    -std=c17 -Os -Wall -Wextra -Werror -Wpedantic \
    -fno-ident -fno-common -fno-stack-protector -fno-builtin -fvisibility=hidden \
    -ffile-prefix-map="$root"=/capsule/c5b8-controlled-test-effects \
    -c "$root/source/controlled_effects.c" \
    -o "$destination"
}

build_one "$root/dist/controlled-effects-a.o"
build_one "$root/dist/controlled-effects-b.o"
cmp "$root/dist/controlled-effects-a.o" "$root/dist/controlled-effects-b.o"

"$clang" \
  -isysroot "$sdkroot" \
  -std=c17 -O1 -Wall -Wextra -Werror -Wpedantic \
  -DC5B8_TEST_DOUBLE=1 \
  -DC5B8_FIXTURE_ROOT=\"$root/inputs/c5b0/fixtures\" \
  "$root/inputs/c5b3/controller_core.c" \
  "$root/inputs/c5b5/source/effect_adapter.c" \
  "$root/source/controlled_effects.c" \
  "$root/source/test_double.c" \
  -o "$test_binary"

"$test_binary"

echo 'C5b8 deterministic production-object A/B build: PASSED'
echo 'The production objects were not linked, loaded, or executed.'
echo 'The executed binary used the fixed controlled-test operation double only.'
