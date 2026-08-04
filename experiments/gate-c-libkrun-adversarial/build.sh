#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
cd "$experiment_dir"
base_experiment="$experiment_dir/../gate-c-libkrun-hvf"
libkrun_dir=${CAPSULE_LIBKRUN_SOURCE:-/private/tmp/capsule-libkrun-v1.19.4}
libkrunfw=${CAPSULE_LIBKRUNFW_LIBRARY:-/private/tmp/capsule-libkrunfw-v5.5.0/libkrunfw/libkrunfw.5.dylib}
signing_identity=${CAPSULE_SIGNING_IDENTITY:?set CAPSULE_SIGNING_IDENTITY to an exact codesigning identity or SHA-1}
build_dir="$experiment_dir/.build"
go_cache=${CAPSULE_GO_CACHE:-/private/tmp/capsule-libkrun-adversarial-go-cache}

test -f "$libkrun_dir/include/libkrun.h"
test -f "$libkrun_dir/target/release/libkrun.1.19.4.dylib"
test -f "$libkrunfw"
test -f "$base_experiment/src/runner.c"
test -f "$base_experiment/src/process_identity.c"

mkdir -p "$build_dir/lib" "$go_cache"

GOCACHE="$go_cache" go test ./...
GOCACHE="$go_cache" go build -trimpath -o "$build_dir/adversarial-harness" ./cmd/harness
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 GOCACHE="$go_cache" go build \
    -trimpath -ldflags='-s -w -buildid=' \
    -o "$build_dir/guest-adversary-linux-arm64" ./guest
(
    cd "$base_experiment/guest-probe"
    CGO_ENABLED=0 GOOS=linux GOARCH=arm64 GOCACHE="$go_cache" go build \
        -trimpath -ldflags='-s -w -buildid=' \
        -o "$build_dir/guest-launcher-linux-arm64" ./launcher
)

cp "$libkrun_dir/target/release/libkrun.1.19.4.dylib" \
    "$build_dir/lib/libkrun.1.19.4.dylib"
cp "$libkrunfw" "$build_dir/lib/libkrunfw.5.dylib"
ln -sfn libkrun.1.19.4.dylib "$build_dir/lib/libkrun.1.dylib"
ln -sfn libkrun.1.dylib "$build_dir/lib/libkrun.dylib"

install_name_tool -id @rpath/libkrun.1.dylib \
    "$build_dir/lib/libkrun.1.19.4.dylib"
install_name_tool -id @rpath/libkrunfw.5.dylib \
    "$build_dir/lib/libkrunfw.5.dylib"

clang -std=c17 -Wall -Wextra -Werror \
    -isystem "$libkrun_dir/include" \
    "$base_experiment/src/runner.c" \
    -L "$build_dir/lib" -lkrun \
    -Wl,-rpath,@executable_path/lib \
    -o "$build_dir/capsule-krun-runner"
install_name_tool -change libkrun.1.dylib @rpath/libkrun.1.dylib \
    "$build_dir/capsule-krun-runner"

clang -std=c17 -Wall -Wextra -Werror \
    -isystem "$libkrun_dir/include" \
    "$experiment_dir/src/config_probe.c" \
    -L "$build_dir/lib" -lkrun \
    -Wl,-rpath,@executable_path/lib \
    -o "$build_dir/config-probe"
install_name_tool -change libkrun.1.dylib @rpath/libkrun.1.dylib \
    "$build_dir/config-probe"

clang -std=c17 -Wall -Wextra -Werror \
    "$base_experiment/src/process_identity.c" \
    -framework CoreFoundation -framework Security \
    -o "$build_dir/process-identity"

codesign --force --sign "$signing_identity" --options runtime \
    "$build_dir/lib/libkrunfw.5.dylib"
codesign --force --sign "$signing_identity" --options runtime \
    "$build_dir/lib/libkrun.1.19.4.dylib"
codesign --force --sign "$signing_identity" --options runtime \
    --identifier com.capsulecorp.spike.libkrun-runner \
    --entitlements "$base_experiment/runner.entitlements" \
    "$build_dir/capsule-krun-runner"
codesign --force --sign "$signing_identity" --options runtime \
    "$build_dir/config-probe"

codesign --verify --strict --verbose=2 "$build_dir/capsule-krun-runner"
codesign --verify --strict --verbose=2 "$build_dir/config-probe"
codesign --verify --strict --verbose=2 "$build_dir/lib/libkrun.1.19.4.dylib"
codesign --verify --strict --verbose=2 "$build_dir/lib/libkrunfw.5.dylib"

shasum -a 256 \
    "$build_dir/capsule-krun-runner" \
    "$build_dir/config-probe" \
    "$build_dir/lib/libkrun.1.19.4.dylib" \
    "$build_dir/lib/libkrunfw.5.dylib" \
    "$build_dir/guest-adversary-linux-arm64" \
    "$build_dir/guest-launcher-linux-arm64"
