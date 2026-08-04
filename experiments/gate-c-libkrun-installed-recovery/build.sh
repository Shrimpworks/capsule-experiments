#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
source_experiment="$experiment_dir/../gate-c-libkrun-hvf"
libkrun_dir=${CAPSULE_LIBKRUN_SOURCE:-/private/tmp/capsule-libkrun-v1.19.4}
libkrunfw=${CAPSULE_LIBKRUNFW_LIBRARY:-/private/tmp/capsule-libkrunfw-v5.5.0/libkrunfw/libkrunfw.5.dylib}
root_disk=${CAPSULE_ROOT_DISK:-"$source_experiment/.build/alpine-3.22-root.ext4"}
build_dir="$experiment_dir/.build"
library_source="$libkrun_dir/target/release/libkrun.1.19.4.dylib"
identifier='com.capsulecorp.spike.libkrun-installed-recovery'
expected_library_sha=fed87836b5eeaf5ba419869d2ac61f48c9696bc22096518299b285d8edf2c535
expected_firmware_sha=c2e062f87c5b5cc4777d1e1ef9ef60f0eb7d1544c9c14c6d05911572ab686d1b
expected_root_sha=${CAPSULE_EXPECTED_ROOT_DISK_SHA256:-7e75817e4f2351dd29cef77292984169d2eddef03ea1c1547635dca280d0422d}

verify_sha256() {
  expected=$1
  path=$2
  actual=$(shasum -a 256 "$path" | awk '{print $1}')
  if [ "$actual" != "$expected" ]; then
    printf 'sha256 mismatch for %s: expected %s, got %s\n' "$path" "$expected" "$actual" >&2
    exit 2
  fi
}

expected_commit=728df8125077d0db44265f6e997c72b81b65c015
test "$(git -C "$libkrun_dir" rev-parse HEAD)" = "$expected_commit"
for patch in "$source_experiment"/patches/*.patch; do
  git -C "$libkrun_dir" apply --reverse --check "$patch" >/dev/null
done
test -f "$libkrun_dir/include/libkrun.h"
test -f "$library_source"
test -f "$libkrunfw"
if [ ! -f "$root_disk" ]; then
  printf 'missing root disk: %s\n' "$root_disk" >&2
  printf 'rebuild it with gate-c-libkrun-hvf/build-guest-probe.sh and prepare-root-disk.sh\n' >&2
  exit 2
fi
verify_sha256 "$expected_library_sha" "$library_source"
verify_sha256 "$expected_firmware_sha" "$libkrunfw"
verify_sha256 "$expected_root_sha" "$root_disk"

if [ -n "${CAPSULE_SIGNING_IDENTITY:-}" ]; then
  signing_identity=$CAPSULE_SIGNING_IDENTITY
else
  matching_identities=$(security find-identity -v -p codesigning |
    sed -n 's/.*"\(Developer ID Application:[^"]*\)".*/\1/p')
  identity_count=$(printf '%s\n' "$matching_identities" |
    awk 'NF { count++ } END { print count + 0 }')
  if [ "$identity_count" -eq 1 ]; then
    signing_identity=$matching_identities
  else
    printf 'expected one Developer ID Application identity; set CAPSULE_SIGNING_IDENTITY\n' >&2
    exit 65
  fi
fi

case "$signing_identity" in
  -) timestamp_flag='--timestamp=none' ;;
  *) timestamp_flag=${CAPSULE_CODESIGN_TIMESTAMP:---timestamp} ;;
esac

mkdir -p "$build_dir/lib" "$build_dir/go-cache"
cp "$library_source" "$build_dir/lib/libkrun.1.19.4.dylib"
cp "$libkrunfw" "$build_dir/lib/libkrunfw.5.dylib"
ln -sfn libkrun.1.19.4.dylib "$build_dir/lib/libkrun.1.dylib"
ln -sfn libkrun.1.dylib "$build_dir/lib/libkrun.dylib"
install_name_tool -id @rpath/libkrun.1.dylib "$build_dir/lib/libkrun.1.19.4.dylib"
install_name_tool -id @rpath/libkrunfw.5.dylib "$build_dir/lib/libkrunfw.5.dylib"

compile_runner() {
  output=$1
  variant=$2
  clang -std=c17 -Wall -Wextra -Werror \
    -DCAPSULE_RUNNER_VARIANT="\"$variant\"" \
    -isystem "$libkrun_dir/include" \
    "$experiment_dir/Sources/runner.c" \
    -L "$build_dir/lib" -lkrun \
    -Wl,-rpath,@executable_path/lib \
    -o "$output"
  install_name_tool -change libkrun.1.dylib @rpath/libkrun.1.dylib "$output"
}

compile_runner "$build_dir/runner-v1" v1
compile_runner "$build_dir/runner-v2" v2
clang -std=c17 -Wall -Wextra -Werror \
  "$experiment_dir/Sources/process_identity.c" \
  -framework CoreFoundation -framework Security \
  -o "$build_dir/process-identity"
(
  cd "$experiment_dir/supervisor"
  GOCACHE="$build_dir/go-cache" go build -trimpath -o "$build_dir/supervisor" .
)

sign_item() {
  codesign --force --sign "$signing_identity" --options runtime "$timestamp_flag" "$1"
}

package_app() {
  app=$1
  runner=$2
  disk=$3
  version=$4
  if [ -e "$app" ]; then
    printf 'refusing stale app output: %s\n' "$app" >&2
    exit 2
  fi
  mkdir -p "$app/Contents/MacOS/lib" "$app/Contents/Resources"
  cp "$runner" "$app/Contents/MacOS/capsule-krun-runner"
  cp "$build_dir/lib/libkrun.1.19.4.dylib" "$app/Contents/MacOS/lib/"
  cp "$build_dir/lib/libkrunfw.5.dylib" "$app/Contents/MacOS/lib/"
  ln -sfn libkrun.1.19.4.dylib "$app/Contents/MacOS/lib/libkrun.1.dylib"
  cp "$disk" "$app/Contents/Resources/root.ext4"
  chmod 0444 "$app/Contents/Resources/root.ext4"
  cp "$experiment_dir/Info.plist.in" "$app/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $version" "$app/Contents/Info.plist"
  sign_item "$app/Contents/MacOS/lib/libkrunfw.5.dylib"
  sign_item "$app/Contents/MacOS/lib/libkrun.1.19.4.dylib"
  codesign --force --sign "$signing_identity" --options runtime "$timestamp_flag" \
    --identifier "$identifier" --entitlements "$experiment_dir/runner.entitlements" \
    "$app/Contents/MacOS/capsule-krun-runner"
  codesign --force --sign "$signing_identity" --options runtime "$timestamp_flag" \
    --entitlements "$experiment_dir/runner.entitlements" "$app"
  codesign --verify --deep --strict --verbose=2 "$app"
}

corrupt_disk="$build_dir/corrupt-root.ext4"
dd if=/dev/zero of="$corrupt_disk" bs=1048576 count=1 2>/dev/null
chmod 0444 "$corrupt_disk"
package_app "$build_dir/CapsuleKrunInstalledRecovery.app" "$build_dir/runner-v1" "$root_disk" 1
package_app "$build_dir/CapsuleKrunInstalledRecoveryV2.app" "$build_dir/runner-v2" "$root_disk" 2
package_app "$build_dir/CapsuleKrunInstalledRecoveryCorrupt.app" "$build_dir/runner-v1" "$corrupt_disk" 1
sign_item "$build_dir/process-identity"
sign_item "$build_dir/supervisor"

codesign --verify --strict "$build_dir/process-identity"
codesign --verify --strict "$build_dir/supervisor"
printf 'signingIdentity=%s\n' "$signing_identity"
printf 'libkrunCommit=%s\n' "$expected_commit"
printf 'rootDiskSha256=%s\n' "$(shasum -a 256 "$root_disk" | awk '{print $1}')"
printf 'appV1Sha256=%s\n' "$(shasum -a 256 "$build_dir/CapsuleKrunInstalledRecovery.app/Contents/MacOS/capsule-krun-runner" | awk '{print $1}')"
printf 'appV2Sha256=%s\n' "$(shasum -a 256 "$build_dir/CapsuleKrunInstalledRecoveryV2.app/Contents/MacOS/capsule-krun-runner" | awk '{print $1}')"
