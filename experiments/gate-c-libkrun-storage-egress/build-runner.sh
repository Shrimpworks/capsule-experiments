#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
libkrun_dir=${CAPSULE_LIBKRUN_SOURCE:-/private/tmp/capsule-libkrun-v1.19.4}
libkrunfw=${CAPSULE_LIBKRUNFW_LIBRARY:-/private/tmp/capsule-libkrunfw-v5.5.0/libkrunfw/libkrunfw.5.dylib}
build_dir="$experiment_dir/.build"
library_source="$libkrun_dir/target/release/libkrun.1.19.4.dylib"
allowed_app="$build_dir/CapsuleStorageSpike.app"
denied_app="$build_dir/CapsuleStorageSpikeDenied.app"

if [ ! -f "$libkrun_dir/include/libkrun.h" ] || [ ! -f "$library_source" ] || \
    [ ! -f "$libkrunfw" ]; then
    printf 'missing retained libkrun/libkrunfw build inputs\n' >&2
    exit 2
fi
if ! grep -q 'ImageType::Raw' "$libkrun_dir/src/libkrun/src/lib.rs"; then
    printf 'retained libkrun source no longer demonstrates raw-only krun_add_disk\n' >&2
    exit 2
fi

mkdir -p "$build_dir/lib"
cp "$library_source" "$build_dir/lib/libkrun.1.19.4.dylib"
cp "$libkrunfw" "$build_dir/lib/libkrunfw.5.dylib"
ln -sfn libkrun.1.19.4.dylib "$build_dir/lib/libkrun.1.dylib"
ln -sfn libkrun.1.dylib "$build_dir/lib/libkrun.dylib"

clang -std=c17 -Wall -Wextra -Werror \
    -isystem "$libkrun_dir/include" "$experiment_dir/src/runner.c" \
    -L "$build_dir/lib" -lkrun -Wl,-rpath,@executable_path/lib \
    -o "$build_dir/capsule-storage-runner"
install_name_tool -id @rpath/libkrun.1.dylib "$build_dir/lib/libkrun.1.19.4.dylib"
install_name_tool -id @rpath/libkrunfw.5.dylib "$build_dir/lib/libkrunfw.5.dylib"
install_name_tool -change libkrun.1.dylib @rpath/libkrun.1.dylib \
    "$build_dir/capsule-storage-runner"

sandbox_scratch="$build_dir/sandbox-scratch.ext4"
cp "$experiment_dir/runner-sandbox.entitlements.in" "$build_dir/runner-sandbox.entitlements"
/usr/libexec/PlistBuddy -c "Set :com.apple.security.temporary-exception.files.absolute-path.read-only:0 $build_dir/root.ext4" "$build_dir/runner-sandbox.entitlements"
/usr/libexec/PlistBuddy -c "Set :com.apple.security.temporary-exception.files.absolute-path.read-only:1 $build_dir/source.ext4" "$build_dir/runner-sandbox.entitlements"
/usr/libexec/PlistBuddy -c "Set :com.apple.security.temporary-exception.files.absolute-path.read-only:2 $build_dir/input.ext4" "$build_dir/runner-sandbox.entitlements"
/usr/libexec/PlistBuddy -c "Set :com.apple.security.temporary-exception.files.absolute-path.read-write:0 $sandbox_scratch" "$build_dir/runner-sandbox.entitlements"

rm -rf "$allowed_app" "$denied_app"
for app in "$allowed_app" "$denied_app"; do
    mkdir -p "$app/Contents/MacOS"
    cp "$build_dir/capsule-storage-runner" "$app/Contents/MacOS/capsule-storage-runner"
    cp -R "$build_dir/lib" "$app/Contents/MacOS/"
    cp "$experiment_dir/Info.plist" "$app/Contents/Info.plist"
done
/usr/libexec/PlistBuddy -c 'Set :CFBundleIdentifier com.capsulecorp.spike.libkrun-storage-denied' "$denied_app/Contents/Info.plist"

signing_identity=${CAPSULE_SIGNING_IDENTITY:--}
codesign --force --sign "$signing_identity" --options runtime "$build_dir/lib/libkrunfw.5.dylib"
codesign --force --sign "$signing_identity" --options runtime "$build_dir/lib/libkrun.1.19.4.dylib"
codesign --force --sign "$signing_identity" --options runtime \
    --identifier com.capsulecorp.spike.libkrun-storage \
    --entitlements "$experiment_dir/runner.entitlements" "$build_dir/capsule-storage-runner"

for app in "$allowed_app" "$denied_app"; do
    codesign --force --sign "$signing_identity" --options runtime "$app/Contents/MacOS/lib/libkrunfw.5.dylib"
    codesign --force --sign "$signing_identity" --options runtime "$app/Contents/MacOS/lib/libkrun.1.19.4.dylib"
done
codesign --force --sign "$signing_identity" --options runtime \
    --identifier com.capsulecorp.spike.libkrun-storage \
    --entitlements "$build_dir/runner-sandbox.entitlements" "$allowed_app/Contents/MacOS/capsule-storage-runner"
codesign --force --sign "$signing_identity" --options runtime \
    --entitlements "$build_dir/runner-sandbox.entitlements" "$allowed_app"
codesign --force --sign "$signing_identity" --options runtime \
    --identifier com.capsulecorp.spike.libkrun-storage-denied \
    --entitlements "$experiment_dir/runner-sandbox-denied.entitlements" "$denied_app/Contents/MacOS/capsule-storage-runner"
codesign --force --sign "$signing_identity" --options runtime \
    --entitlements "$experiment_dir/runner-sandbox-denied.entitlements" "$denied_app"

codesign --verify --strict --verbose=2 "$build_dir/capsule-storage-runner"
codesign --verify --deep --strict --verbose=2 "$allowed_app"
codesign --verify --deep --strict --verbose=2 "$denied_app"
printf 'runnerSha256=%s\n' "$(shasum -a 256 "$build_dir/capsule-storage-runner" | awk '{print $1}')"
printf 'libkrunSha256=%s\n' "$(shasum -a 256 "$build_dir/lib/libkrun.1.19.4.dylib" | awk '{print $1}')"
printf 'libkrunfwSha256=%s\n' "$(shasum -a 256 "$build_dir/lib/libkrunfw.5.dylib" | awk '{print $1}')"
