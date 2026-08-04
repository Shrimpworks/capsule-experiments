#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
source_root=${CAPSULE_LIBKRUN_SOURCE_ROOT:-/private/tmp}
libkrun_dir="$source_root/capsule-libkrun-v1.19.4"
firmware_dir="$source_root/capsule-libkrunfw-v5.5.0"
firmware_archive="$firmware_dir/libkrunfw-prebuilt-aarch64.tgz"
libkrun_commit=728df8125077d0db44265f6e997c72b81b65c015
firmware_archive_sha=5bfae6efee63dbdf04a8fac2a69d772d9f900af2f54c4429b4acdfd6d86b9979
firmware_kernel_c_sha=96561a4e5dccec0364a28ac32c5668e13e31180d083f412c9f8be7599380c70d
firmware_url=https://github.com/libkrun/libkrunfw/releases/download/v5.5.0/libkrunfw-prebuilt-aarch64.tgz

verify_sha256() {
    expected=$1
    file=$2
    actual=$(shasum -a 256 "$file" | awk '{print $1}')
    if [ "$actual" != "$expected" ]; then
        printf 'sha256 mismatch for %s: expected %s, got %s\n' \
            "$file" "$expected" "$actual" >&2
        exit 2
    fi
}

if [ ! -d "$libkrun_dir/.git" ]; then
    git clone https://github.com/libkrun/libkrun.git "$libkrun_dir"
    git -C "$libkrun_dir" checkout --detach "$libkrun_commit"
fi

actual_commit=$(git -C "$libkrun_dir" rev-parse HEAD)
if [ "$actual_commit" != "$libkrun_commit" ]; then
    printf 'unexpected libkrun commit: %s\n' "$actual_commit" >&2
    exit 2
fi

for patch in "$experiment_dir"/patches/*.patch; do
    if git -C "$libkrun_dir" apply --check "$patch" >/dev/null 2>&1; then
        git -C "$libkrun_dir" apply "$patch"
    elif ! git -C "$libkrun_dir" apply --reverse --check "$patch" \
        >/dev/null 2>&1; then
        printf 'patch is neither cleanly applicable nor already applied: %s\n' \
            "$patch" >&2
        exit 2
    fi
done
git -C "$libkrun_dir" diff --check

mkdir -p "$firmware_dir"
if [ ! -f "$firmware_archive" ]; then
    temporary="$firmware_archive.download-$$"
    trap 'rm -f "$temporary"' EXIT INT TERM
    curl --fail --location --proto '=https' --tlsv1.2 \
        "$firmware_url" --output "$temporary"
    verify_sha256 "$firmware_archive_sha" "$temporary"
    mv "$temporary" "$firmware_archive"
    trap - EXIT INT TERM
fi
verify_sha256 "$firmware_archive_sha" "$firmware_archive"

if [ ! -f "$firmware_dir/libkrunfw/kernel.c" ]; then
    tar -xzf "$firmware_archive" -C "$firmware_dir"
fi
verify_sha256 "$firmware_kernel_c_sha" "$firmware_dir/libkrunfw/kernel.c"
make -C "$firmware_dir/libkrunfw"

llvm_prefix=$(brew --prefix llvm)
lld_prefix=$(brew --prefix lld)
env PATH="$lld_prefix/bin:$PATH" \
    LIBCLANG_PATH="$llvm_prefix/lib" \
    RUSTFLAGS="-Clink-arg=-Wl,-rpath,$llvm_prefix/lib" \
    make -C "$libkrun_dir" BLK=1

printf 'libkrunSource=%s\n' "$libkrun_dir"
printf 'libkrunCommit=%s\n' "$actual_commit"
printf 'libkrunfwSource=%s\n' "$firmware_dir/libkrunfw"
printf 'libkrunfwKernelCSha256=%s\n' "$firmware_kernel_c_sha"
