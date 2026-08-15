#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
clang=$(xcrun --find clang)
sdkroot=$(xcrun --sdk macosx --show-sdk-path)
test_binary="${TMPDIR:-/tmp}/capsule-c5b8-root-binding-test.$$"
trap 'rm -f "$test_binary"' EXIT

node "$root/scripts/generate-profile.mjs"
mkdir -p "$root/dist"

common_flags="-target arm64-apple-macos14 -isysroot $sdkroot -std=c17 -Os -Wall -Wextra -Werror -Wpedantic -fno-ident -fno-common -fno-stack-protector -fno-builtin -fvisibility=hidden"

build_successor() {
  destination=$1
  # shellcheck disable=SC2086
  "$clang" $common_flags \
    -ffile-prefix-map="$root"=/capsule/c5b8-c5b7-root-binding-successor \
    -c "$root/source/root_binding_successor.c" \
    -o "$destination"
}

combine() {
  successor=$1
  destination=$2
  "$clang" -target arm64-apple-macos14 -isysroot "$sdkroot" -nostdlib -r \
    -Wl,-keep_private_externs \
    "$root/inputs/c5b8/controlled-effects.o" "$successor" \
    -o "$destination"
}

build_successor "$root/dist/root-binding-successor-a.o"
build_successor "$root/dist/root-binding-successor-b.o"
cmp "$root/dist/root-binding-successor-a.o" "$root/dist/root-binding-successor-b.o"

combine "$root/dist/root-binding-successor-a.o" \
  "$root/dist/controlled-effects-root-bound-a.o"
combine "$root/dist/root-binding-successor-b.o" \
  "$root/dist/controlled-effects-root-bound-b.o"
cmp "$root/dist/controlled-effects-root-bound-a.o" \
  "$root/dist/controlled-effects-root-bound-b.o"

"$clang" \
  -isysroot "$sdkroot" \
  -std=c17 -O1 -Wall -Wextra -Werror -Wpedantic \
  -DC5B8_FIXTURE_ROOT=\"$root/fixtures\" \
  "$root/inputs/c5b8/inputs/c5b3/controller_core.c" \
  "$root/inputs/c5b8/controlled-effects.o" \
  "$root/dist/root-binding-successor-a.o" \
  "$root/source/test_double.c" \
  -o "$test_binary"

for case_name in \
  success \
  historical-profile \
  historical-size \
  descriptor-size \
  historical-profile-digest \
  plan-substitution \
  authority-field
do
  "$test_binary" "$case_name"
done

echo 'C5b8/C5b7 deterministic root-binding objects and test doubles: PASSED'
echo 'The retained C5b8 object was statically composed only; no retained dylib or runtime artifact was loaded.'
