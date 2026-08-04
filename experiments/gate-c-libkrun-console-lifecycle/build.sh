#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
parent_dir=$(CDPATH='' cd -- "$experiment_dir/../gate-c-libkrun-hvf" && pwd)
libkrun_dir=${CAPSULE_LIBKRUN_SOURCE:-/private/tmp/capsule-libkrun-v1.19.4}
libkrunfw=${CAPSULE_LIBKRUNFW_LIBRARY:-/private/tmp/capsule-libkrunfw-v5.5.0/libkrunfw/libkrunfw.5.dylib}
build_dir="$experiment_dir/.build"
library_source="$libkrun_dir/target/release/libkrun.1.19.4.dylib"
parent_disk="$parent_dir/.build/alpine-3.22-root.ext4"
root_disk="$build_dir/alpine-3.22-root.ext4"
signing_identity=${CAPSULE_SIGNING_IDENTITY:-}

if [ -z "$signing_identity" ]; then
    printf 'CAPSULE_SIGNING_IDENTITY must name the retained Developer ID identity\n' >&2
    exit 2
fi
if [ ! -f "$libkrun_dir/include/libkrun.h" ] || [ ! -f "$library_source" ] || \
    [ ! -f "$libkrunfw" ]; then
    printf 'missing retained libkrun build; rebuild with %s/prepare-libkrun.sh\n' \
        "$parent_dir" >&2
    exit 2
fi
if [ ! -f "$parent_disk" ]; then
    "$parent_dir/build-guest-probe.sh"
    "$parent_dir/prepare-root-disk.sh"
fi

mkdir -p "$build_dir/lib"
cp "$library_source" "$build_dir/lib/libkrun.1.19.4.dylib"
cp "$libkrunfw" "$build_dir/lib/libkrunfw.5.dylib"
ln -sfn libkrun.1.19.4.dylib "$build_dir/lib/libkrun.1.dylib"
ln -sfn libkrun.1.dylib "$build_dir/lib/libkrun.dylib"
if [ -e "$root_disk" ]; then
    if ! cmp -s "$parent_disk" "$root_disk"; then
        printf 'refusing to replace mismatched immutable root disk: %s\n' \
            "$root_disk" >&2
        exit 2
    fi
else
    cp "$parent_disk" "$root_disk"
    chmod 0444 "$root_disk"
fi

clang -std=c17 -Wall -Wextra -Werror \
    -isystem "$libkrun_dir/include" \
    "$experiment_dir/src/runner.c" \
    -L "$build_dir/lib" -lkrun \
    -Wl,-rpath,@executable_path/lib \
    -o "$build_dir/capsule-krun-console-runner"

clang -std=c17 -Wall -Wextra -Werror \
    "$parent_dir/src/process_identity.c" \
    -framework CoreFoundation -framework Security \
    -o "$build_dir/process-identity"

go_cache=${CAPSULE_GO_CACHE:-/private/tmp/capsule-libkrun-console-go-cache}
mkdir -p "$go_cache"
(
    cd "$experiment_dir/controller"
    GOCACHE="$go_cache" go build -trimpath -o "$build_dir/controller" .
)

install_name_tool -id @rpath/libkrun.1.dylib \
    "$build_dir/lib/libkrun.1.19.4.dylib"
install_name_tool -id @rpath/libkrunfw.5.dylib \
    "$build_dir/lib/libkrunfw.5.dylib"
install_name_tool -change libkrun.1.dylib @rpath/libkrun.1.dylib \
    "$build_dir/capsule-krun-console-runner"

codesign --force --sign "$signing_identity" --options runtime \
    "$build_dir/lib/libkrunfw.5.dylib"
codesign --force --sign "$signing_identity" --options runtime \
    "$build_dir/lib/libkrun.1.19.4.dylib"
codesign --force --sign "$signing_identity" --options runtime \
    --identifier com.capsulecorp.spike.libkrun-runner \
    --entitlements "$parent_dir/runner.entitlements" \
    "$build_dir/capsule-krun-console-runner"

codesign --verify --strict --verbose=2 "$build_dir/capsule-krun-console-runner"
codesign --verify --strict --verbose=2 "$build_dir/lib/libkrun.1.19.4.dylib"
codesign --verify --strict --verbose=2 "$build_dir/lib/libkrunfw.5.dylib"

{
    printf 'libkrunCommit=%s\n' "$(git -C "$libkrun_dir" rev-parse HEAD)"
    printf 'runnerSha256=%s\n' "$(shasum -a 256 "$build_dir/capsule-krun-console-runner" | awk '{print $1}')"
    printf 'librarySha256=%s\n' "$(shasum -a 256 "$build_dir/lib/libkrun.1.19.4.dylib" | awk '{print $1}')"
    printf 'firmwareSha256=%s\n' "$(shasum -a 256 "$build_dir/lib/libkrunfw.5.dylib" | awk '{print $1}')"
    printf 'rootDiskSha256=%s\n' "$(shasum -a 256 "$root_disk" | awk '{print $1}')"
    printf 'controllerSha256=%s\n' "$(shasum -a 256 "$build_dir/controller" | awk '{print $1}')"
    printf 'identityHelperSha256=%s\n' "$(shasum -a 256 "$build_dir/process-identity" | awk '{print $1}')"
} >"$build_dir/runtime-manifest.txt"

cat "$build_dir/runtime-manifest.txt"
