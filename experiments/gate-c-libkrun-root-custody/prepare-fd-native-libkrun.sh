#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
source_dir=${CAPSULE_LIBKRUN_SOURCE:-/private/tmp/capsule-libkrun-v1.19.4}
output_dir=${CAPSULE_LIBKRUN_FD_BUILD_SOURCE:-$experiment_dir/.build/fd-native-libkrun}
sysroot=${CAPSULE_LIBKRUN_LINUX_SYSROOT:-$source_dir/linux-sysroot}
expected_commit=728df8125077d0db44265f6e997c72b81b65c015

if [ ! -d "$source_dir/.git" ] || \
    [ "$(git -C "$source_dir" rev-parse HEAD)" != "$expected_commit" ]; then
    printf 'missing exact retained libkrun checkout: %s\n' "$source_dir" >&2
    exit 2
fi
if [ ! -d "$sysroot" ]; then
    printf 'missing retained Linux cross-build sysroot: %s\n' "$sysroot" >&2
    exit 2
fi

if [ ! -e "$output_dir" ]; then
    git -C "$source_dir" worktree add --detach "$output_dir" "$expected_commit"
fi
if [ ! -e "$output_dir/.git" ] || \
    [ "$(git -C "$output_dir" rev-parse HEAD)" != "$expected_commit" ]; then
    printf 'unexpected FD-native build source: %s\n' "$output_dir" >&2
    exit 2
fi

for patch_file in \
    "$experiment_dir/../gate-c-libkrun-hvf/patches/0001-pin-libkrunfw-rpath.patch" \
    "$experiment_dir/../gate-c-libkrun-hvf/patches/0002-read-only-block-root-mount-flags.patch" \
    "$experiment_dir/patches/0003-read-only-raw-root-fd.patch"; do
    if git -C "$output_dir" apply --check "$patch_file" >/dev/null 2>&1; then
        git -C "$output_dir" apply "$patch_file"
    elif ! git -C "$output_dir" apply --reverse --check "$patch_file" \
        >/dev/null 2>&1; then
        printf 'patch is neither applicable nor already applied: %s\n' \
            "$patch_file" >&2
        exit 2
    fi
done
git -C "$output_dir" diff --check

llvm_prefix=$(brew --prefix llvm)
lld_prefix=$(brew --prefix lld)
PATH="$lld_prefix/bin:$PATH" \
LIBCLANG_PATH="$llvm_prefix/lib" \
RUSTFLAGS="-Clink-arg=-Wl,-rpath,$llvm_prefix/lib" \
    make -C "$output_dir" BLK=1 SYSROOT_LINUX="$sysroot"

printf 'libkrunSource=%s\n' "$output_dir"
printf 'libkrunCommit=%s\n' "$expected_commit"
printf 'libkrunLibrary=%s\n' "$output_dir/target/release/libkrun.1.19.4.dylib"
printf 'fdPatchSha256=%s\n' \
    "$(shasum -a 256 "$experiment_dir/patches/0003-read-only-raw-root-fd.patch" | awk '{print $1}')"
