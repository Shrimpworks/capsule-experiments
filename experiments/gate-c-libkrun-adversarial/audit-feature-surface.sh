#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
build_dir="$experiment_dir/.build"
runner="$build_dir/capsule-krun-runner"
config="$build_dir/config-probe"
disk="$build_dir/adversarial-root.ext4"
evidence=${1:-"$experiment_dir/.runs/config-probe.txt"}

mkdir -p "$(dirname -- "$evidence")"
codesign --verify --strict "$runner"
codesign --verify --strict "$build_dir/lib/libkrun.1.19.4.dylib"
codesign --verify --strict "$build_dir/lib/libkrunfw.5.dylib"

"$config" "$disk" "$experiment_dir" >"$evidence"
grep -q '^feature.net=0$' "$evidence"
grep -q '^feature.blk=1$' "$evidence"
grep -q '^feature.gpu=0$' "$evidence"
grep -q '^feature.snd=0$' "$evidence"
grep -q '^feature.input=0$' "$evidence"
grep -q '^feature.efi=0$' "$evidence"
grep -q '^feature.init_blob=1$' "$evidence"

if nm -u "$runner" | grep -Eq '_krun_(add_net|add_vsock|add_virtiofs|set_gpu|set_snd|set_passt|set_gvproxy|set_port)'; then
    printf 'runner imports a forbidden optional-device configuration API\n' >&2
    exit 1
fi
nm -u "$runner" | grep '_krun_' | sort >"$evidence.runner-imports"
otool -L "$runner" >"$evidence.otool"

printf 'configEvidence=%s\n' "$evidence"
printf 'runnerImports=%s\n' "$evidence.runner-imports"
printf 'runnerLibraries=%s\n' "$evidence.otool"
