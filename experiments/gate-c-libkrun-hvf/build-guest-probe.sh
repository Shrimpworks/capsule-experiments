#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
build_dir="$experiment_dir/.build"
go_cache=${CAPSULE_GO_CACHE:-/private/tmp/capsule-libkrun-go-cache}

mkdir -p "$build_dir" "$go_cache"
(
    cd "$experiment_dir/guest-probe"
    CGO_ENABLED=0 GOOS=linux GOARCH=arm64 GOCACHE="$go_cache" go build \
        -trimpath -ldflags='-s -w -buildid=' \
        -o "$build_dir/guest-probe-linux-arm64" .
    CGO_ENABLED=0 GOOS=linux GOARCH=arm64 GOCACHE="$go_cache" go build \
        -trimpath -ldflags='-s -w -buildid=' \
        -o "$build_dir/guest-launcher-linux-arm64" ./launcher
)

printf 'guestProbe=%s\n' "$build_dir/guest-probe-linux-arm64"
printf 'guestProbeSha256=%s\n' \
    "$(shasum -a 256 "$build_dir/guest-probe-linux-arm64" | awk '{print $1}')"
printf 'guestLauncher=%s\n' "$build_dir/guest-launcher-linux-arm64"
printf 'guestLauncherSha256=%s\n' \
    "$(shasum -a 256 "$build_dir/guest-launcher-linux-arm64" | awk '{print $1}')"
