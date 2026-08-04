#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
source_dir=${CAPSULE_LIBKRUN_SOURCE:-/private/tmp/capsule-libkrun-v1.19.4}
expected_commit=728df8125077d0db44265f6e997c72b81b65c015
task_tmp=$(mktemp -d /private/tmp/capsule-fd-native-mutations.XXXXXX)
trap 'rm -rf "$task_tmp"' EXIT HUP INT TERM
source_copy="$task_tmp/libkrun"
target_dir="$task_tmp/target"
mkdir -p "$source_copy"

git -C "$source_dir" archive "$expected_commit" | tar -x -C "$source_copy"
for patch_file in \
    "$experiment_dir/../gate-c-libkrun-hvf/patches/0001-pin-libkrunfw-rpath.patch" \
    "$experiment_dir/../gate-c-libkrun-hvf/patches/0002-read-only-block-root-mount-flags.patch" \
    "$experiment_dir/patches/0003-read-only-raw-root-fd.patch"; do
    patch -d "$source_copy" -p1 --batch --forward <"$patch_file" >/dev/null
done

device_source="$source_copy/src/devices/src/virtio/block/device.rs"
api_source="$source_copy/src/libkrun/src/lib.rs"

run_device_tests_expect_failure() {
    label=$1
    log="$task_tmp/$label.log"
    if (
        cd "$source_copy"
        CARGO_NET_OFFLINE=true CARGO_TARGET_DIR="$target_dir" \
            cargo test --offline -p krun-devices --lib --features blk \
            read_only_raw_fd_tests
    ) >"$log" 2>&1; then
        printf 'mutation unexpectedly passed: %s\n' "$label" >&2
        exit 1
    fi
    grep -Eq 'FAILED|test result: FAILED' "$log"
    printf 'MUTATION_EXPECTED_FAILURE case=%s detector=rust-block-tests\n' "$label"
}

# Restore a pathname-backed imago constructor. The route audit must reject it.
cp "$device_source" "$task_tmp/device.clean"
perl -0pi -e 's/let file = ImagoFile::try_from\(io_file\)\?;/let file = ImagoFile::open_sync(StorageOpenOptions::new().filename("\/dev\/null"))?;/' \
    "$device_source"
if awk '/pub fn new_read_only_raw_file/ { capture = 1 } /fn validate_read_only_raw_file/ { exit } capture { print }' \
    "$device_source" | grep -Eq 'filename|OpenOptions|PathBuf'; then
    printf 'MUTATION_EXPECTED_FAILURE case=pathname-fallback detector=source-route-audit\n'
else
    printf 'pathname mutation escaped route audit\n' >&2
    exit 1
fi
cp "$task_tmp/device.clean" "$device_source"

# Accept writable open descriptions in the descriptor-native device constructor.
perl -0pi -e 's/flags & libc::O_ACCMODE != libc::O_RDONLY/false/' "$device_source"
run_device_tests_expect_failure writable-descriptor-acceptance
cp "$task_tmp/device.clean" "$device_source"

# Transfer a different object to imago. Exact duplicate identity validation must fail.
perl -0pi -e 's/let io_file = file\.try_clone\(\)\?;/let io_file = OpenOptions::new().read(true).open("\/dev\/null")?;/' \
    "$device_source"
run_device_tests_expect_failure wrong-object-duplication
cp "$task_tmp/device.clean" "$device_source"

# Add a sequential read through the shared open description. The offset canary must fail.
perl -0pi -e 's/use std::io::\{self, Write\};/use std::io::{self, Read, Write};/; s/let io_file = file\.try_clone\(\)\?;/let mut io_file = file.try_clone()?; let mut byte = [0u8; 1]; io_file.read_exact(&mut byte)?;/' \
    "$device_source"
run_device_tests_expect_failure shared-offset-io
cp "$task_tmp/device.clean" "$device_source"

# Remove immediate ownership duplication. The API audit must reject the lifetime regression.
cp "$api_source" "$task_tmp/api.clean"
perl -0pi -e 's/let owned_fd = unsafe \{ libc::fcntl\(fd, libc::F_DUPFD_CLOEXEC, 3\) \};/let owned_fd = fd;/' \
    "$api_source"
if awk '/fn krun_add_read_only_raw_root_fd/ { capture = 1 } capture { print } capture && /^}$/ { exit }' \
    "$api_source" | grep -q 'F_DUPFD_CLOEXEC'; then
    printf 'caller-lifetime mutation escaped API audit\n' >&2
    exit 1
else
    printf 'MUTATION_EXPECTED_FAILURE case=caller-close-lifetime detector=source-route-audit\n'
fi
cp "$task_tmp/api.clean" "$api_source"

printf 'MUTATION_SUMMARY expectedFailures=5 unexpectedPasses=0\n'
