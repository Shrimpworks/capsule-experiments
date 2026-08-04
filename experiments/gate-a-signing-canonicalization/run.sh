#!/bin/sh
set -eu

experiment_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

(
  cd "$experiment_dir/go"
  GOCACHE=/private/tmp/capsule-gatea-go-cache go test ./...
)

(
  cd "$experiment_dir/typescript"
  fnm exec --using=22.22.1 -- corepack pnpm install --frozen-lockfile --ignore-workspace
  fnm exec --using=22.22.1 -- corepack pnpm check
  fnm exec --using=22.22.1 -- corepack pnpm test
)

(
  cd "$experiment_dir/swift"
  CLANG_MODULE_CACHE_PATH=/private/tmp/capsule-gatea-clang-cache \
    SWIFTPM_MODULECACHE_OVERRIDE=/private/tmp/capsule-gatea-swiftpm-cache \
    swift run GateASwiftProbe
)
