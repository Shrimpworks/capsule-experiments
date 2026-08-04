#!/bin/sh
set -eu

libkrun_dir=${CAPSULE_LIBKRUN_SOURCE:-/private/tmp/capsule-libkrun-v1.19.4}
runner=${1:-}
expected_commit=728df8125077d0db44265f6e997c72b81b65c015
libkrun_source="$libkrun_dir/src/libkrun/src/lib.rs"
worker_source="$libkrun_dir/src/devices/src/virtio/fs/worker.rs"
cargo_features="$libkrun_dir/src/libkrun/Cargo.toml"

test -d "$libkrun_dir/.git"
test -f "$libkrun_source"
test -f "$worker_source"
test -f "$cargo_features"

actual_commit=$(git -C "$libkrun_dir" rev-parse HEAD)
if [ "$actual_commit" != "$expected_commit" ]; then
    printf 'unexpected libkrun commit: expected %s, got %s\n' \
        "$expected_commit" "$actual_commit" >&2
    exit 2
fi

rg -Fq 'default = ["init-blob"]' "$cargo_features"
rg -Fq 'blk = ["devices/blk", "vmm/blk"]' "$cargo_features"
if rg -q '^virtiofs[[:space:]]*=' "$cargo_features"; then
    printf 'unexpected independent virtiofs feature appeared\n' >&2
    exit 1
fi

block_route=$(awk '
    /pub unsafe extern "C" fn krun_set_root_disk_remount/ { capture = 1 }
    capture { print }
    capture && /^[}]$/ { exit }
' "$libkrun_source")
printf '%s\n' "$block_route" | rg -Fq 'ctx_cfg.vmr.add_fs_device(FsDeviceConfig {'
printf '%s\n' "$block_route" | rg -Fq 'fs_id: "/dev/root".into()'
printf '%s\n' "$block_route" | rg -Fq 'shared_dir: None'
printf '%s\n' "$block_route" | rg -Fq 'ctx_cfg.set_block_root(device, fstype, options)'

rg -Fq 'None => FsServer::Null(Server::new(AugmentFs::new(' "$worker_source"
rg -Fq 'pub unsafe extern "C" fn krun_set_root(' "$libkrun_source"
rg -Fq 'pub unsafe extern "C" fn krun_add_virtiofs4(' "$libkrun_source"
rg -Fq 'let path = if c_path.is_null() {' "$libkrun_source"

printf 'sourceCommit=%s\n' "$actual_commit"
printf 'feature.blk=present\n'
printf 'feature.initBlobDefault=present\n'
printf 'feature.virtiofsIndependent=absent\n'
printf 'route.blockRootNullFs=present\n'
printf 'route.directNullPath=present\n'
printf 'route.hostBackedSourceApis=present\n'

if [ -n "$runner" ]; then
    test -x "$runner"
    if nm -u "$runner" | rg -q '_krun_(set_root$|add_virtiofs)'; then
        printf 'runner imports an optional host-directory configuration API\n' >&2
        exit 1
    fi
    nm -u "$runner" | rg -q '_krun_set_root_disk_remount$'
    printf 'runner.blockRootImport=present\n'
    printf 'runner.optionalHostDirectoryImports=absent\n'
fi

printf 'scope=source-and-import-regression-only\n'
printf 'posture=none\n'
