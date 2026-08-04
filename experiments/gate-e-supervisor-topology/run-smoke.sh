#!/bin/sh
# Development-only local smoke runner. Build products stay under .build/.
set -eu

experiment_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
build_dir=$experiment_dir/.build
mkdir -p "$build_dir"
mkdir -p "$build_dir/go-cache" "$build_dir/clang-cache" "$build_dir/swift-module-cache"

if xcrun swiftc -O -parse-as-library \
    -module-cache-path "$build_dir/swift-module-cache" \
    "$experiment_dir/swift-platform-probe/main.swift" \
    -o "$build_dir/swift-platform-probe"; then
    "$build_dir/swift-platform-probe"
    stat -f 'binary_bytes=%z path=%N' "$build_dir/swift-platform-probe"
else
    echo "SWIFT_PROBE_UNAVAILABLE: inspect compiler/SDK diagnostics above" >&2
fi

GOCACHE=$build_dir/go-cache \
CLANG_MODULE_CACHE_PATH=$build_dir/clang-cache \
CGO_ENABLED=1 go test "$experiment_dir/go-platform-probe"

GOCACHE=$build_dir/go-cache \
CLANG_MODULE_CACHE_PATH=$build_dir/clang-cache \
CGO_ENABLED=1 go build -trimpath -ldflags='-s -w' \
    -o "$build_dir/go-platform-probe" \
    "$experiment_dir/go-platform-probe"

"$build_dir/go-platform-probe"

stat -f 'binary_bytes=%z path=%N' "$build_dir/go-platform-probe"
