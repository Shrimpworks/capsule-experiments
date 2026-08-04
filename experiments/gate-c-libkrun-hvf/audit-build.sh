#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
libkrun_dir=${CAPSULE_LIBKRUN_SOURCE:-/private/tmp/capsule-libkrun-v1.19.4}
firmware_dir=${CAPSULE_LIBKRUNFW_SOURCE:-/private/tmp/capsule-libkrunfw-v5.5.0/libkrunfw}
expected_commit=728df8125077d0db44265f6e997c72b81b65c015
expected_kernel_c_sha=96561a4e5dccec0364a28ac32c5668e13e31180d083f412c9f8be7599380c70d

test "$(git -C "$libkrun_dir" rev-parse HEAD)" = "$expected_commit"
for patch in "$experiment_dir"/patches/*.patch; do
    git -C "$libkrun_dir" apply --reverse --check "$patch"
done
git -C "$libkrun_dir" diff --check
test "$(shasum -a 256 "$firmware_dir/kernel.c" | awk '{print $1}')" = \
    "$expected_kernel_c_sha"

codesign --verify --strict "$experiment_dir/.build/capsule-krun-runner"
codesign --verify --strict \
    "$experiment_dir/.build/lib/libkrun.1.19.4.dylib"
codesign --verify --strict \
    "$experiment_dir/.build/lib/libkrunfw.5.dylib"
codesign --verify --deep --strict \
    "$experiment_dir/.build/CapsuleKrunSpike.app"
codesign --verify --deep --strict \
    "$experiment_dir/.build/CapsuleKrunSpikeDenied.app"

codesign -d --entitlements - "$experiment_dir/.build/CapsuleKrunSpike.app" \
    2>&1 | grep -q 'com.apple.security.app-sandbox'
codesign -d --entitlements - "$experiment_dir/.build/CapsuleKrunSpike.app" \
    2>&1 | grep -q 'com.apple.security.hypervisor'

printf 'libkrunCommit=%s\n' "$expected_commit"
printf 'sourcePatches=2\n'
printf 'signatures=valid\n'
printf 'sandboxEntitlements=present\n'
