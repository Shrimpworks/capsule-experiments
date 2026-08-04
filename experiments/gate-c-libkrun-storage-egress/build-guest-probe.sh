#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
build_dir="$experiment_dir/.build"
go_cache=${CAPSULE_STORAGE_GO_CACHE:-/private/tmp/capsule-libkrun-storage-go-cache}

mkdir -p "$build_dir" "$go_cache"
(
    cd "$experiment_dir/guest-probe"
    CGO_ENABLED=0 GOOS=linux GOARCH=arm64 GOCACHE="$go_cache" \
        go build -trimpath -ldflags='-s -w' -o "$build_dir/storage-probe-linux-arm64" .
)

chmod 0555 "$build_dir/storage-probe-linux-arm64"
printf 'guestProbe=%s\n' "$build_dir/storage-probe-linux-arm64"
printf 'guestProbeSha256=%s\n' "$(shasum -a 256 "$build_dir/storage-probe-linux-arm64" | awk '{print $1}')"
