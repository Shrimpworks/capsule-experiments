#!/bin/sh
set -eu

if [ "$#" -ne 7 ]; then
  echo "usage: $0 STAGE HARNESS LIBKRUN VENDOR LIBKRUNFW_RELEASE RUNTIME ROOT_INPUTS" >&2
  exit 2
fi

stage=$1
harness=$(CDPATH='' cd -- "$2" && pwd)
libkrun=$(CDPATH='' cd -- "$3" && pwd)
vendor=$(CDPATH='' cd -- "$4" && pwd)
libkrunfw=$(CDPATH='' cd -- "$5" && pwd)
runtime=$(CDPATH='' cd -- "$6" && pwd)
root_inputs=$(CDPATH='' cd -- "$7" && pwd)

test ! -e "$stage"
test "$(git -C "$libkrun" rev-parse HEAD)" = \
  cf0333cdba478cc34a8570a65b38412da7fd3ecc
test "$(git -C "$libkrun" rev-parse 'HEAD^{tree}')" = \
  ffa4131ddcc6ec66edd623381dae94189ccd3fee
test "$(git -C "$libkrun" rev-parse HEAD^2)" = \
  8a2c91943793668f31a1cf7af431933be935bb58
test -z "$(git -C "$libkrun" status --porcelain)"

mkdir -p "$stage/harness" "$stage/inputs/libkrunfw" \
  "$stage/inputs/runtime" "$stage/inputs/root"
git clone --quiet --no-local "$libkrun" "$stage/libkrun"
git -C "$stage/libkrun" checkout --quiet --detach \
  cf0333cdba478cc34a8570a65b38412da7fd3ecc

cp "$harness/Cargo.toml" "$harness/Cargo.lock" "$stage/harness/"
cp -R "$harness/crates" "$harness/fixtures" "$harness/source" \
  "$harness/scripts" "$harness/config" "$stage/harness/"
cp -R "$vendor" "$stage/vendor"

sed "s|@VENDOR_DIRECTORY@|$stage/vendor|g" \
  "$harness/config/cargo-vendor.toml.in" \
  > "$stage/inputs/cargo-config.toml"

cp "$libkrunfw/kernel.c" "$libkrunfw/Makefile" \
  "$libkrunfw/bin2cbundle.py" "$libkrunfw/LICENSE-GPL-2.0-only" \
  "$libkrunfw/LICENSE-LGPL-2.1-only" "$stage/inputs/libkrunfw/"
cp "$runtime/bin/capsule-deno-core-c2b-fixed-fixture" \
  "$stage/inputs/runtime/"
cp "$runtime/share/capsule-deno-core/capsule_core_snapshot.bin" \
  "$stage/inputs/runtime/"
cp "$root_inputs/libc6_2.36-9+deb12u14_arm64.deb" \
  "$root_inputs/libgcc-s1_12.2.0-14+deb12u1_arm64.deb" \
  "$stage/inputs/root/"

chmod 0555 "$stage/harness/scripts/"*.sh
find "$stage" -exec touch -h -t 200001010000 {} +

test "$(shasum -a 256 "$stage/inputs/runtime/capsule-deno-core-c2b-fixed-fixture" | awk '{print $1}')" = \
  e781a90236cdf1272a9a16189c6be033164fa25a5aa9e52376ef998982ec0a77
test "$(shasum -a 256 "$stage/inputs/runtime/capsule_core_snapshot.bin" | awk '{print $1}')" = \
  4e8965217d5a6675a880326eee6f690bbeec7e7cb243decf2f3e9f453a871a2c
test "$(shasum -a 256 "$stage/inputs/libkrunfw/kernel.c" | awk '{print $1}')" = \
  96561a4e5dccec0364a28ac32c5668e13e31180d083f412c9f8be7599380c70d
