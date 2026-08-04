#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
cd "$experiment_dir"
build_dir="$experiment_dir/.build"
mkdir -p "$experiment_dir/.runs"
run_dir=$(mktemp -d "$experiment_dir/.runs/adversarial.XXXXXX")

GOCACHE=${CAPSULE_GO_CACHE:-/private/tmp/capsule-libkrun-adversarial-go-cache} \
    go test ./... -count=1 -v >"$run_dir/go-test.txt"
"$experiment_dir/audit-feature-surface.sh" "$run_dir/config-probe.txt" \
    >"$run_dir/audit.txt"

set +e
"$build_dir/adversarial-harness" \
    --runner "$build_dir/capsule-krun-runner" \
    --disk "$build_dir/adversarial-root.ext4" \
    --launcher /usr/local/libexec/capsule-guest-launcher \
    --guest /usr/local/libexec/capsule-guest-adversary \
    --identity "$build_dir/process-identity" \
    --work "$run_dir/malformed" \
    >"$run_dir/report.json"
status=$?
set -e

shasum -a 256 \
    "$build_dir/capsule-krun-runner" \
    "$build_dir/config-probe" \
    "$build_dir/lib/libkrun.1.19.4.dylib" \
    "$build_dir/lib/libkrunfw.5.dylib" \
    "$build_dir/adversarial-root.ext4" \
    "$build_dir/guest-adversary-linux-arm64" \
    "$build_dir/guest-launcher-linux-arm64" \
    >"$run_dir/hashes.txt"

printf 'evidenceDir=%s\n' "$run_dir"
printf 'harnessStatus=%s\n' "$status"
if [ "$status" -ne 0 ]; then
    exit "$status"
fi
