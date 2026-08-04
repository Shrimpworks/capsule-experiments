#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
source_dir=${CAPSULE_LIBKRUN_SOURCE:-/private/tmp/capsule-libkrun-v1.19.4}
expected_commit=728df8125077d0db44265f6e997c72b81b65c015
fd_patch="$experiment_dir/patches/0003-read-only-raw-root-fd.patch"
firmware_patch="$experiment_dir/../gate-c-libkrun-hvf/patches/0001-pin-libkrunfw-rpath.patch"
mount_patch="$experiment_dir/../gate-c-libkrun-hvf/patches/0002-read-only-block-root-mount-flags.patch"
direct_root_patch="$experiment_dir/../gate-c-libkrun-adversarial/patches/0002-direct-block-root-bootstrap-probe.patch"
console_patch="$experiment_dir/../gate-c-libkrun-console-correctness/patches/0001-console-correctness.patch"

if [ ! -d "$source_dir/.git" ] || \
    [ "$(git -C "$source_dir" rev-parse HEAD)" != "$expected_commit" ]; then
    printf 'missing exact retained libkrun checkout: %s\n' "$source_dir" >&2
    exit 2
fi

task_tmp=$(mktemp -d /private/tmp/capsule-fd-native-patch.XXXXXX)
trap 'rm -rf "$task_tmp"' EXIT HUP INT TERM
source_copy="$task_tmp/libkrun"
composition_copy="$task_tmp/composition"
mkdir -p "$source_copy" "$composition_copy"

git -C "$source_dir" archive "$expected_commit" | tar -x -C "$source_copy"
patch -d "$source_copy" -p1 --batch --forward <"$firmware_patch"
patch -d "$source_copy" -p1 --batch --forward <"$mount_patch"
patch -d "$source_copy" -p1 --batch --forward <"$fd_patch"
patch -d "$source_copy" -p1 --batch --reverse --dry-run <"$fd_patch"

rustfmt --edition 2021 --check \
    "$source_copy/src/devices/src/virtio/block/device.rs" \
    "$source_copy/src/libkrun/src/lib.rs" \
    "$source_copy/src/vmm/src/resources.rs" \
    "$source_copy/src/vmm/src/vmm_config/block.rs"
(
    cd "$source_copy"
    CARGO_NET_OFFLINE=true CARGO_TARGET_DIR="$task_tmp/target-fd" \
        cargo test --offline -p krun-devices --lib --features blk
)

git -C "$source_dir" archive "$expected_commit" | tar -x -C "$composition_copy"
patch -d "$composition_copy" -p1 --batch --forward <"$firmware_patch"
patch -d "$composition_copy" -p1 --batch --forward <"$mount_patch"
patch -d "$composition_copy" -p1 --batch --forward <"$direct_root_patch"
patch -d "$composition_copy" -p1 --batch --forward <"$fd_patch"
patch -d "$composition_copy" -p1 --batch --forward <"$console_patch"
rustfmt --edition 2021 --check \
    "$composition_copy/src/devices/src/virtio/block/device.rs" \
    "$composition_copy/src/devices/src/virtio/console/device.rs" \
    "$composition_copy/src/devices/src/virtio/console/port.rs" \
    "$composition_copy/src/devices/src/virtio/console/port_io.rs" \
    "$composition_copy/src/devices/src/virtio/console/process_tx.rs" \
    "$composition_copy/src/vmm/src/resources.rs" \
    "$composition_copy/src/vmm/src/vmm_config/block.rs"
(
    cd "$composition_copy"
    CARGO_NET_OFFLINE=true CARGO_TARGET_DIR="$task_tmp/target-composition" \
        cargo test --offline -p krun-devices --lib --features blk
)

printf 'libkrunCommit=%s\n' "$expected_commit"
printf 'fdPatchSha256=%s\n' "$(shasum -a 256 "$fd_patch" | awk '{print $1}')"
printf 'patchApply=PASS\n'
printf 'patchReverseDryRun=PASS\n'
printf 'directRootThenFdThenConsoleComposition=PASS\n'
