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
    -ffile-prefix-map="$root"=/capsule/c5b5-effect-adapter \
    -c "$root/source/effect_adapter.c" \
    -o "$destination"
}

build_one "$root/dist/effect-adapter-a.o"
build_one "$root/dist/effect-adapter-b.o"
cmp "$root/dist/effect-adapter-a.o" "$root/dist/effect-adapter-b.o"

echo 'C5b5 effect adapter deterministic A/B object build: PASSED'
echo 'No object was linked, loaded, or executed.'
