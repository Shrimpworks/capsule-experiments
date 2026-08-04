#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
libkrun_dir=${CAPSULE_LIBKRUN_SOURCE:-$experiment_dir/.build/fd-native-libkrun}
imago_file=${CAPSULE_IMAGO_FILE_SOURCE:-/Users/dsteele/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/imago-0.2.3/src/file.rs}
expected_commit=728df8125077d0db44265f6e997c72b81b65c015
api_source="$libkrun_dir/src/libkrun/src/lib.rs"
device_source="$libkrun_dir/src/devices/src/virtio/block/device.rs"
config_source="$libkrun_dir/src/vmm/src/vmm_config/block.rs"
header="$libkrun_dir/include/libkrun.h"
runner="$experiment_dir/.build/capsule-root-custody-runner"
patch_file="$experiment_dir/patches/0003-read-only-raw-root-fd.patch"

actual_commit=$(git -C "$libkrun_dir" rev-parse HEAD)
if [ "$actual_commit" != "$expected_commit" ]; then
    printf 'unexpected libkrun commit: %s\n' "$actual_commit" >&2
    exit 2
fi
for required in "$api_source" "$device_source" "$config_source" "$header" \
    "$imago_file" "$runner" "$patch_file"; do
    if [ ! -f "$required" ]; then
        printf 'missing source input: %s\n' "$required" >&2
        exit 2
    fi
done

api_route=$(awk '
    /fn krun_add_read_only_raw_root_fd/ { capture = 1 }
    capture { print }
    capture && /^}$/ { exit }
' "$api_source")
device_route=$(awk '
    /pub fn new_read_only_raw_file/ { capture = 1 }
    /fn validate_read_only_raw_file/ { exit }
    capture { print }
' "$device_source")
validation_route=$(awk '
    /fn validate_read_only_raw_file/ { capture = 1 }
    /fn from_storage/ { exit }
    capture { print }
' "$device_source")

printf '%s\n' "$api_route" | grep -q 'F_DUPFD_CLOEXEC'
printf '%s\n' "$api_route" | grep -q 'metadata.st_nlink() != 0'
printf '%s\n' "$api_route" | grep -q 'metadata.st_mode() & 0o7777 != 0o400'
printf '%s\n' "$api_route" | grep -q 'metadata.st_dev() != expected_device'
printf '%s\n' "$api_route" | grep -q 'metadata.st_ino() != expected_inode'
printf '%s\n' "$api_route" | grep -q 'metadata.st_size() != expected_length'
printf '%s\n' "$api_route" | grep -q 'ReadOnlyRawRootFdConfig'
if printf '%s\n' "$api_route" | grep -Eq 'CStr|OpenOptions|PathBuf|disk_path'; then
    printf 'FD-native API contains a pathname route\n' >&2
    exit 1
fi

printf '%s\n' "$device_route" | grep -q 'file.try_clone()'
printf '%s\n' "$device_route" | grep -q 'ImagoFile::try_from(io_file)'
printf '%s\n' "$device_route" | grep -q 'Raw::<Box<dyn DynStorage>>::open_image_sync(Box::new(file), false)'
device_identity_checks=$(printf '%s\n' "$device_route" | \
    grep -c 'Self::validate_read_only_raw_file')
if [ "$device_identity_checks" -ne 2 ]; then
    printf 'unexpected FD-native device identity-check count: %s\n' \
        "$device_identity_checks" >&2
    exit 1
fi
if printf '%s\n' "$device_route" | grep -Eq 'OpenOptions|StorageOpenOptions|filename|PathBuf|Qcow2|Vmdk'; then
    printf 'FD-native device route contains path or non-raw format authority\n' >&2
    exit 1
fi

printf '%s\n' "$validation_route" | grep -q 'F_GETFL'
printf '%s\n' "$validation_route" | grep -q 'O_ACCMODE != libc::O_RDONLY'
printf '%s\n' "$validation_route" | grep -q 'metadata.st_dev() != expected_device'
printf '%s\n' "$validation_route" | grep -q 'metadata.st_ino() != expected_inode'
printf '%s\n' "$validation_route" | grep -q 'metadata.st_size() != expected_length'
grep -q 'int32_t krun_add_read_only_raw_root_fd' "$header"
grep -q 'pub struct ReadOnlyRawRootFdConfig' "$config_source"

positional_reads=$(grep -c 'libc::preadv(' "$imago_file")
positional_writes=$(grep -c 'libc::pwritev(' "$imago_file")
if [ "$positional_reads" -lt 1 ] || [ "$positional_writes" -lt 1 ]; then
    printf 'imago positional-I/O invariant failed\n' >&2
    exit 1
fi

nm -u "$runner" | grep -q '_krun_add_read_only_raw_root_fd$'
if nm -u "$runner" | grep -Eq '_krun_add_disk[23]?$'; then
    printf 'runner imports a pathname disk API\n' >&2
    exit 1
fi

printf 'libkrunCommit=%s\n' "$actual_commit"
printf 'fdApi=krun_add_read_only_raw_root_fd\n'
printf 'fdApiRole=runtime-root:vda:raw:read-only\n'
printf 'fdApiPathInputs=0\n'
printf 'fdApiOwnedDuplicate=F_DUPFD_CLOEXEC\n'
printf 'apiOwnedDuplicateIdentityValidation=true\n'
printf 'deviceIdentityRevalidationCount=%s\n' "$device_identity_checks"
printf 'imagoOwnedDuplicateIdentityValidation=true\n'
printf 'devicePathOpenSites=0\n'
printf 'deviceRawOnly=true\n'
printf 'deviceWriteEnabled=false\n'
printf 'imagoDescriptorConstructor=TryFrom<File>\n'
printf 'imagoPositionalReadSites=%s\n' "$positional_reads"
printf 'imagoPositionalWriteSites=%s\n' "$positional_writes"
printf 'imagoWriteDisposition=unreachable-through-read-only-Raw-and-O_RDONLY-descriptor\n'
printf 'runnerPathDiskImports=0\n'
printf 'patchSha256=%s\n' "$(shasum -a 256 "$patch_file" | awk '{print $1}')"
printf 'deviceSourceSha256=%s\n' "$(shasum -a 256 "$device_source" | awk '{print $1}')"
printf 'apiSourceSha256=%s\n' "$(shasum -a 256 "$api_source" | awk '{print $1}')"
printf 'configSourceSha256=%s\n' "$(shasum -a 256 "$config_source" | awk '{print $1}')"
printf 'headerSha256=%s\n' "$(shasum -a 256 "$header" | awk '{print $1}')"
printf 'imagoSourceSha256=%s\n' "$(shasum -a 256 "$imago_file" | awk '{print $1}')"
