#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
clang=$(xcrun --find clang)
mkdir -p "$root/dist"

build_one() {
  destination=$1
  "$clang" \
    -target arm64-apple-macos14 \
    -std=c17 -Os -Wall -Wextra -Werror -Wpedantic \
    -fno-ident -fno-common -fno-stack-protector -fvisibility=hidden \
    -ffile-prefix-map="$root"=/capsule/c5b3-controller \
    -c "$root/source/controller_core.c" \
    -o "$destination"
}

build_one "$root/dist/controller-core-a.o"
build_one "$root/dist/controller-core-b.o"
cmp "$root/dist/controller-core-a.o" "$root/dist/controller-core-b.o"

echo 'C5b3 controller core deterministic A/B object build: PASSED'
echo 'No object was linked or executed.'
