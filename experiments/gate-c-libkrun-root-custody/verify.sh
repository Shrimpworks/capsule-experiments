#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
repository_dir=$(CDPATH='' cd -- "$experiment_dir/../.." && pwd)

for script in "$experiment_dir"/*.sh; do
    sh -n "$script"
done
python3 -m py_compile "$experiment_dir/local_custody.py" "$experiment_dir/run_guest.py"
"$experiment_dir/verify-fd-native-patch.sh"
"$experiment_dir/mutation-test.sh"
"$experiment_dir/prepare-fd-native-libkrun.sh"
fd_source=${CAPSULE_LIBKRUN_FD_BUILD_SOURCE:-$experiment_dir/.build/fd-native-libkrun}
CAPSULE_LIBKRUN_SOURCE="$fd_source" "$experiment_dir/build.sh"
"$experiment_dir/.build/fd-api-contract" >/dev/null
CAPSULE_LIBKRUN_SOURCE="$fd_source" "$experiment_dir/source-audit.sh"
python3 "$experiment_dir/local_custody.py" >/dev/null

if [ "${CAPSULE_RUN_GUEST:-false}" = true ]; then
    python3 "$experiment_dir/run_guest.py" --timeout 60
fi

git -C "$repository_dir" diff --check -- experiments/gate-c-libkrun-root-custody
printf 'P0-1 experiment verification passed\n'
