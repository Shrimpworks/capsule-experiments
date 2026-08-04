#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
libkrun_dir=${CAPSULE_LIBKRUN_SOURCE:-/private/tmp/capsule-libkrun-v1.19.4}
libkrunfw=${CAPSULE_LIBKRUNFW_LIBRARY:-/private/tmp/capsule-libkrunfw-v5.5.0/libkrunfw/libkrunfw.5.dylib}
build_dir="$experiment_dir/.build"
library_source="$libkrun_dir/target/release/libkrun.1.19.4.dylib"
root_disk="$build_dir/alpine-3.22-root.ext4"
allowed_app="$build_dir/CapsuleKrunSpike.app"
denied_app="$build_dir/CapsuleKrunSpikeDenied.app"

if [ ! -f "$libkrun_dir/include/libkrun.h" ] || [ ! -f "$library_source" ] || \
    [ ! -f "$libkrunfw" ]; then
    printf 'missing pinned libkrun v1.19.4 build at %s\n' "$libkrun_dir" >&2
    exit 2
fi

if ! grep -q 'const KRUNFW_NAME: &str = "@rpath/libkrunfw.5.dylib";' \
    "$libkrun_dir/src/libkrun/src/lib.rs"; then
    printf 'libkrun source is missing the retained firmware rpath patch\n' >&2
    exit 2
fi

if ! grep -q 'strcmp(krun_root_options, "ro,nosuid,nodev") == 0' \
    "$libkrun_dir/src/init_blob/init/init.c"; then
    printf 'libkrun source is missing the retained read-only block-root patch\n' >&2
    exit 2
fi

mkdir -p "$build_dir/lib"
cp "$library_source" "$build_dir/lib/libkrun.1.19.4.dylib"
cp "$libkrunfw" "$build_dir/lib/libkrunfw.5.dylib"
ln -sfn libkrun.1.19.4.dylib "$build_dir/lib/libkrun.1.dylib"
ln -sfn libkrun.1.dylib "$build_dir/lib/libkrun.dylib"

clang -std=c17 -Wall -Wextra -Werror \
    -isystem "$libkrun_dir/include" \
    "$experiment_dir/src/runner.c" \
    -L "$build_dir/lib" -lkrun \
    -Wl,-rpath,@executable_path/lib \
    -o "$build_dir/capsule-krun-runner"

clang -std=c17 -Wall -Wextra -Werror \
    "$experiment_dir/src/process_identity.c" \
    -framework CoreFoundation -framework Security \
    -o "$build_dir/process-identity"

controller_cache=${CAPSULE_GO_CACHE:-/private/tmp/capsule-libkrun-go-cache}
mkdir -p "$controller_cache"
(
    cd "$experiment_dir/controller"
    GOCACHE="$controller_cache" go build -trimpath -o "$build_dir/controller" .
)

install_name_tool -id @rpath/libkrun.1.dylib \
    "$build_dir/lib/libkrun.1.19.4.dylib"
install_name_tool -id @rpath/libkrunfw.5.dylib \
    "$build_dir/lib/libkrunfw.5.dylib"
install_name_tool -change libkrun.1.dylib @rpath/libkrun.1.dylib \
    "$build_dir/capsule-krun-runner"

cp "$experiment_dir/runner-sandbox.entitlements.in" \
    "$build_dir/runner-sandbox.entitlements"
/usr/libexec/PlistBuddy -c \
    "Set :com.apple.security.temporary-exception.files.absolute-path.read-only:0 $root_disk" \
    "$build_dir/runner-sandbox.entitlements"

mkdir -p "$allowed_app/Contents/MacOS" "$denied_app/Contents/MacOS"
cp "$build_dir/capsule-krun-runner" \
    "$allowed_app/Contents/MacOS/capsule-krun-runner"
cp "$build_dir/capsule-krun-runner" \
    "$denied_app/Contents/MacOS/capsule-krun-runner"
cp -R "$build_dir/lib" "$allowed_app/Contents/MacOS/"
cp -R "$build_dir/lib" "$denied_app/Contents/MacOS/"
cp "$experiment_dir/Info.plist.in" "$allowed_app/Contents/Info.plist"
cp "$experiment_dir/Info.plist.in" "$denied_app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c \
    'Set :CFBundleIdentifier com.capsulecorp.spike.libkrun-runner-sandboxed' \
    "$allowed_app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c \
    'Set :CFBundleIdentifier com.capsulecorp.spike.libkrun-runner-sandbox-denied' \
    "$denied_app/Contents/Info.plist"

signing_identity=${CAPSULE_SIGNING_IDENTITY:--}
codesign --force --sign "$signing_identity" --options runtime \
    "$build_dir/lib/libkrunfw.5.dylib"
codesign --force --sign "$signing_identity" --options runtime \
    "$build_dir/lib/libkrun.1.19.4.dylib"
codesign --force --sign "$signing_identity" --options runtime \
    --identifier com.capsulecorp.spike.libkrun-runner \
    --entitlements "$experiment_dir/runner.entitlements" \
    "$build_dir/capsule-krun-runner"
codesign --force --sign "$signing_identity" --options runtime \
    "$allowed_app/Contents/MacOS/lib/libkrunfw.5.dylib"
codesign --force --sign "$signing_identity" --options runtime \
    "$allowed_app/Contents/MacOS/lib/libkrun.1.19.4.dylib"
codesign --force --sign "$signing_identity" --options runtime \
    --identifier com.capsulecorp.spike.libkrun-runner-sandboxed \
    --entitlements "$build_dir/runner-sandbox.entitlements" \
    "$allowed_app/Contents/MacOS/capsule-krun-runner"
codesign --force --sign "$signing_identity" --options runtime \
    --entitlements "$build_dir/runner-sandbox.entitlements" \
    "$allowed_app"
codesign --force --sign "$signing_identity" --options runtime \
    "$denied_app/Contents/MacOS/lib/libkrunfw.5.dylib"
codesign --force --sign "$signing_identity" --options runtime \
    "$denied_app/Contents/MacOS/lib/libkrun.1.19.4.dylib"
codesign --force --sign "$signing_identity" --options runtime \
    --identifier com.capsulecorp.spike.libkrun-runner-sandbox-denied \
    --entitlements "$experiment_dir/runner-sandbox-denied.entitlements" \
    "$denied_app/Contents/MacOS/capsule-krun-runner"
codesign --force --sign "$signing_identity" --options runtime \
    --entitlements "$experiment_dir/runner-sandbox-denied.entitlements" \
    "$denied_app"

codesign --verify --strict --verbose=2 "$build_dir/capsule-krun-runner"
codesign --verify --deep --strict --verbose=2 "$allowed_app"
codesign --verify --deep --strict --verbose=2 "$denied_app"
codesign --verify --strict --verbose=2 "$build_dir/lib/libkrun.1.19.4.dylib"
codesign --verify --strict --verbose=2 "$build_dir/lib/libkrunfw.5.dylib"

printf 'runner=%s\n' "$build_dir/capsule-krun-runner"
printf 'runnerSha256=%s\n' "$(shasum -a 256 "$build_dir/capsule-krun-runner" | awk '{print $1}')"
printf 'librarySha256=%s\n' "$(shasum -a 256 "$build_dir/lib/libkrun.1.19.4.dylib" | awk '{print $1}')"
printf 'firmwareSha256=%s\n' "$(shasum -a 256 "$build_dir/lib/libkrunfw.5.dylib" | awk '{print $1}')"
