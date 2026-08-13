#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
clang=$(xcrun --find clang)
sdkroot=$(xcrun --sdk macosx --show-sdk-path)
mkdir -p "$root/dist"

build_one() {
  destination=$1
  "$clang" \
    -target arm64-apple-macos14 \
    -isysroot "$sdkroot" \
    -std=c17 -Os -Wall -Wextra -Werror -Wpedantic \
    -fno-ident -fno-common -fno-stack-protector -fvisibility=hidden \
    -ffile-prefix-map="$root"=/capsule/c5b7-effect-implementation \
    -c "$root/source/effect_implementation.c" \
    -o "$destination"
}

build_one "$root/dist/effect-implementation-a.o"
build_one "$root/dist/effect-implementation-b.o"
cmp "$root/dist/effect-implementation-a.o" "$root/dist/effect-implementation-b.o"

"$root/scripts/test-double.sh"

echo 'C5b7 deterministic production-object A/B build: PASSED'
echo 'The production objects were not linked, loaded, or executed.'
echo 'The executed test double contains no real libkrun implementation or linkage.'
