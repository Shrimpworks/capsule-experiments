#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
repository_dir=$(CDPATH='' cd -- "$experiment_dir/../.." && pwd)
source_root=${CAPSULE_LIBKRUN_SOURCE:-/private/tmp/capsule-libkrun-v1.19.4}
firmware_source=${CAPSULE_LIBKRUNFW_SOURCE:-/private/tmp/capsule-libkrunfw-v5.5.0/libkrunfw}
firmware_patch="$repository_dir/experiments/gate-c-libkrun-hvf/patches/0001-pin-libkrunfw-rpath.patch"
mount_patch="$repository_dir/experiments/gate-c-libkrun-hvf/patches/0002-read-only-block-root-mount-flags.patch"
firmware_patch_sha256=a845cce3cd479a73c6a698164dc1b466e8d67796018b107077504478e0ec9cd5
mount_patch_sha256=b2120d4cc848e138a28165906d6c5cc4da1efee8004e392a7ddddc2334136823

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

verify_sha256 "$firmware_patch_sha256" "$firmware_patch"
verify_sha256 "$mount_patch_sha256" "$mount_patch"

for script in "$experiment_dir"/*.sh; do
    sh -n "$script"
done
node --check "$experiment_dir/generate-sbom-input.mjs"

for json in "$experiment_dir"/evidence/*.json; do
    node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$json"
done

node -e '
const fs = require("fs");
const path = process.argv[1];
const bom = JSON.parse(fs.readFileSync(path, "utf8"));
if (bom.bomFormat !== "CycloneDX" || bom.specVersion !== "1.6") process.exit(2);
if (bom.components.length !== 115) process.exit(2);
if (bom.components.some((component) => !component.licenses)) process.exit(2);
' "$experiment_dir/evidence/sbom-input.cdx.json"

if [ -d "$source_root/.git" ]; then
    test "$(git -C "$source_root" rev-parse HEAD)" = \
        728df8125077d0db44265f6e997c72b81b65c015
    for patch in "$repository_dir"/experiments/gate-c-libkrun-hvf/patches/*.patch; do
        git -C "$source_root" apply --reverse --check "$patch"
    done
    test "$(shasum -a 256 "$source_root/Cargo.lock" | awk '{print $1}')" = \
        9d5dc785636a264794a396ab478821c4ed33acae91650db8d72e8a35733f288c
fi

if [ -f "$firmware_source/kernel.c" ]; then
    test "$(shasum -a 256 "$firmware_source/kernel.c" | awk '{print $1}')" = \
        96561a4e5dccec0364a28ac32c5668e13e31180d083f412c9f8be7599380c70d
fi

git -C "$repository_dir" diff --check -- experiments/gate-c-libkrun-supply-chain
printf 'firmwarePatchSha256=%s\n' "$firmware_patch_sha256"
printf 'mountPatchSha256=%s\n' "$mount_patch_sha256"
printf 'supplyChainEvidence=valid\n'
printf 'admissionDecision=no-go\n'
