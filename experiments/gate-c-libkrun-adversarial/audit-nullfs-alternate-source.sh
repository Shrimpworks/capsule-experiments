#!/bin/sh
set -eu

libkrun_dir=${CAPSULE_LIBKRUN_SOURCE:-/private/tmp/capsule-libkrun-nullfs-alt}
runner=${1:?pass the direct-block-root runner path}
expected_commit=728df8125077d0db44265f6e997c72b81b65c015
libkrun_source="$libkrun_dir/src/libkrun/src/lib.rs"
init_source="$libkrun_dir/src/init_blob/init/init.c"
library="$libkrun_dir/target/release/libkrun.1.19.4.dylib"

test -e "$libkrun_dir/.git"
test -f "$libkrun_source"
test -f "$init_source"
test -f "$library"
test -x "$runner"

actual_commit=$(git -C "$libkrun_dir" rev-parse HEAD)
if [ "$actual_commit" != "$expected_commit" ]; then
    printf 'unexpected libkrun commit: expected %s, got %s\n' \
        "$expected_commit" "$actual_commit" >&2
    exit 2
fi

block_route=$(awk '
    /pub unsafe extern "C" fn krun_set_root_disk_remount/ { capture = 1 }
    capture { print }
    capture && /^[}]$/ { exit }
' "$libkrun_source")
printf '%s\n' "$block_route" | rg -Fq 'device != "/dev/vda"'
printf '%s\n' "$block_route" | rg -Fq 'fstype.as_deref() != Some("ext4")'
printf '%s\n' "$block_route" | rg -Fq 'options.as_deref() != Some("ro,nosuid,nodev")'
printf '%s\n' "$block_route" | rg -Fq 'ctx_cfg.set_block_root(device, fstype, options)'
if printf '%s\n' "$block_route" | rg -q 'add_fs_device|FsDeviceConfig|shared_dir'; then
    printf 'direct block-root route still constructs an fs device\n' >&2
    exit 1
fi

rg -Fq 'root=/dev/vda rootfstype=ext4 ro rootwait' "$libkrun_source"
rg -Fq 'init={BLOCK_ROOT_INIT_PATH} KRUN_DIRECT_BLOCK_ROOT=1' "$libkrun_source"
rg -Fq 'MS_REMOUNT | MS_RDONLY | MS_NOSUID | MS_NODEV' "$init_source"

if nm -u "$runner" | rg -q '_krun_(set_root$|add_virtiofs|set_kernel|set_firmware)'; then
    printf 'runner imports an alternate root, host-directory, or kernel route\n' >&2
    exit 1
fi
nm -u "$runner" | rg -q '_krun_set_root_disk_remount$'
nm -gU "$library" | rg -q '_krun_set_root$'
nm -gU "$library" | rg -q '_krun_add_virtiofs4$'

printf 'sourceCommit=%s\n' "$actual_commit"
printf 'route.directBlockRoot=present\n'
printf 'route.blockRootFsDevice=absent\n'
printf 'route.hostBackedRunnerImports=absent\n'
printf 'route.externalKernelRunnerImports=absent\n'
printf 'root.profile=/dev/vda,ext4,ro,nosuid,nodev\n'
printf 'root.bootstrap=/usr/local/libexec/capsule-init.krun\n'
printf 'library.hostDirectoryExports=present-but-not-runner-reachable\n'
printf 'scope=source-and-import-regression-only\n'
printf 'posture=none\n'
