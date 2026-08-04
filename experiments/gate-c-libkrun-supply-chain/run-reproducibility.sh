#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
source_root=${CAPSULE_LIBKRUN_SOURCE:-/private/tmp/capsule-libkrun-v1.19.4}
firmware_source=${CAPSULE_LIBKRUNFW_SOURCE:-/private/tmp/capsule-libkrunfw-v5.5.0/libkrunfw}
expected_commit=728df8125077d0db44265f6e997c72b81b65c015
deployment_target=${CAPSULE_MACOS_DEPLOYMENT_TARGET:-14.0}
remap_paths=${CAPSULE_REMAP_PATHS:-false}

if [ ! -d "$source_root/.git" ] || [ ! -f "$source_root/Cargo.lock" ]; then
    printf 'missing retained libkrun source: %s\n' "$source_root" >&2
    exit 2
fi
if [ ! -f "$firmware_source/kernel.c" ]; then
    printf 'missing retained libkrunfw kernel.c: %s\n' "$firmware_source" >&2
    exit 2
fi
if [ ! -f "$source_root/linux-sysroot/.sysroot_ready" ]; then
    printf 'missing retained Linux sysroot: %s\n' "$source_root/linux-sysroot" >&2
    exit 2
fi

work_root=$(mktemp -d /private/tmp/capsule-libkrun-repro.XXXXXX)
trap 'rm -rf "$work_root"' EXIT INT TERM

llvm_prefix=$(brew --prefix llvm)
lld_prefix=$(brew --prefix lld)

prepare_tree() {
    destination=$1
    git clone --quiet --no-local "$source_root" "$destination"
    git -C "$destination" checkout --quiet --detach "$expected_commit"
    for patch in "$experiment_dir"/../gate-c-libkrun-hvf/patches/*.patch; do
        git -C "$destination" apply "$patch"
    done
    sed -i '' \
        's/cargo build --release $(FEATURE_FLAGS)/cargo build --release --locked $(FEATURE_FLAGS)/' \
        "$destination/Makefile"
    grep -q 'cargo build --release --locked $(FEATURE_FLAGS)' \
        "$destination/Makefile"
}

build_libkrun() {
    source_dir=$1
    rustflags="-Clink-arg=-Wl,-rpath,$llvm_prefix/lib"
    if [ "$remap_paths" = true ]; then
        rustflags="$rustflags --remap-path-prefix=$source_dir=/usr/src/libkrun"
    fi
    env \
        CARGO_NET_OFFLINE=true \
        MACOSX_DEPLOYMENT_TARGET="$deployment_target" \
        PATH="$lld_prefix/bin:$PATH" \
        LIBCLANG_PATH="$llvm_prefix/lib" \
        RUSTFLAGS="$rustflags" \
        make -C "$source_dir" BLK=1 \
            SYSROOT_LINUX="$source_root/linux-sysroot"
}

build_firmware() {
    destination=$1
    mkdir -p "$destination"
    cp "$firmware_source/kernel.c" "$destination/kernel.c"
    cp "$firmware_source/Makefile" "$destination/Makefile"
    env MACOSX_DEPLOYMENT_TARGET="$deployment_target" make -C "$destination"
}

prepare_tree "$work_root/libkrun-a"
prepare_tree "$work_root/libkrun-b"
build_libkrun "$work_root/libkrun-a"
build_libkrun "$work_root/libkrun-b"
build_firmware "$work_root/libkrunfw-a"
build_firmware "$work_root/libkrunfw-b"

libkrun_a="$work_root/libkrun-a/target/release/libkrun.1.19.4.dylib"
libkrun_b="$work_root/libkrun-b/target/release/libkrun.1.19.4.dylib"
firmware_a="$work_root/libkrunfw-a/libkrunfw.5.dylib"
firmware_b="$work_root/libkrunfw-b/libkrunfw.5.dylib"

libkrun_a_sha=$(shasum -a 256 "$libkrun_a" | awk '{print $1}')
libkrun_b_sha=$(shasum -a 256 "$libkrun_b" | awk '{print $1}')
firmware_a_sha=$(shasum -a 256 "$firmware_a" | awk '{print $1}')
firmware_b_sha=$(shasum -a 256 "$firmware_b" | awk '{print $1}')

libkrun_reproducible=true
firmware_reproducible=true
if ! cmp -s "$libkrun_a" "$libkrun_b"; then
    libkrun_reproducible=false
fi
if ! cmp -s "$firmware_a" "$firmware_b"; then
    firmware_reproducible=false
fi

libkrun_minos=$(otool -l "$libkrun_a" | awk '/minos / { print $2; exit }')
firmware_minos=$(otool -l "$firmware_a" | awk '/minos / { print $2; exit }')

printf 'sourceCommit=%s\n' "$expected_commit"
printf 'deploymentTarget=%s\n' "$deployment_target"
printf 'remapPaths=%s\n' "$remap_paths"
printf 'libkrunReproducible=%s\n' "$libkrun_reproducible"
printf 'libkrunASha256=%s\nlibkrunBSha256=%s\n' "$libkrun_a_sha" "$libkrun_b_sha"
printf 'libkrunMinOS=%s\n' "$libkrun_minos"
printf 'libkrunfwReproducible=%s\n' "$firmware_reproducible"
printf 'libkrunfwASha256=%s\nlibkrunfwBSha256=%s\n' "$firmware_a_sha" "$firmware_b_sha"
printf 'libkrunfwMinOS=%s\n' "$firmware_minos"

if [ "$libkrun_reproducible" != true ] || \
    [ "$firmware_reproducible" != true ]; then
    exit 1
fi
