#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
clang=$(xcrun --find clang)
sdkroot=$(xcrun --sdk macosx --show-sdk-path)
test_double=$(mktemp "${TMPDIR:-/tmp}/capsule-c5b7-test-double.XXXXXX")
trap 'rm -f "$test_double"' EXIT

"$clang" \
  -target arm64-apple-macos14 \
  -isysroot "$sdkroot" \
  -std=c17 -O0 -g0 -Wall -Wextra -Werror -Wpedantic \
  -fno-ident -fno-common -fno-stack-protector \
  -ffile-prefix-map="$root"=/capsule/c5b7-effect-implementation \
  -DC5B7_TEST_DOUBLE \
  "$root/inputs/c5b5/source/effect_adapter.c" \
  "$root/inputs/c5b3/controller_core.c" \
  "$root/source/effect_implementation.c" \
  "$root/source/test_double.c" \
  -o "$test_double"

imports=$(nm -u "$test_double")
case "$imports" in
  *'_krun_'*|*'_dlopen'*|*'_dlsym'*)
    echo 'test double resolved a forbidden real-library symbol' >&2
    exit 1
    ;;
esac
"$test_double"
