#!/bin/sh
set -eu

experiment_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
go_cache=${TMPDIR:-/private/tmp}/capsule-a2-go-cache
go_mod_cache=${TMPDIR:-/private/tmp}/capsule-a2-go-mod
clang_cache=${TMPDIR:-/private/tmp}/capsule-a2-clang-cache
swiftpm_cache=${TMPDIR:-/private/tmp}/capsule-a2-swiftpm-cache

(
  cd "$experiment_dir/go"
  GOCACHE="$go_cache" GOMODCACHE="$go_mod_cache" go test ./...
)

(
  cd "$experiment_dir/typescript"
  fnm exec --using=22.22.1 -- corepack pnpm check
  fnm exec --using=22.22.1 -- corepack pnpm test
)

(
  cd "$experiment_dir/swift"
  CLANG_MODULE_CACHE_PATH="$clang_cache" \
    SWIFTPM_MODULECACHE_OVERRIDE="$swiftpm_cache" \
    swift run GateA2Swift self-test ../fixtures/go-vectors.json
)

go_envelope=$(
  cd "$experiment_dir/go"
  GOCACHE="$go_cache" GOMODCACHE="$go_mod_cache" go run ./cmd/gatea2 emit
)
typescript_envelope=$(
  cd "$experiment_dir/typescript"
  fnm exec --using=22.22.1 -- node dist/src/main.js emit
)
swift_envelope=$(
  cd "$experiment_dir/swift"
  CLANG_MODULE_CACHE_PATH="$clang_cache" \
    SWIFTPM_MODULECACHE_OVERRIDE="$swiftpm_cache" \
    swift run GateA2Swift emit
)

(
  cd "$experiment_dir/go"
  GOCACHE="$go_cache" GOMODCACHE="$go_mod_cache" \
    go run ./cmd/gatea2 verify "$go_envelope" "$typescript_envelope" "$swift_envelope"
)
(
  cd "$experiment_dir/typescript"
  fnm exec --using=22.22.1 -- node dist/src/main.js verify \
    "$go_envelope" "$typescript_envelope" "$swift_envelope"
)
(
  cd "$experiment_dir/swift"
  CLANG_MODULE_CACHE_PATH="$clang_cache" \
    SWIFTPM_MODULECACHE_OVERRIDE="$swiftpm_cache" \
    swift run GateA2Swift verify \
      "$go_envelope" "$typescript_envelope" "$swift_envelope"
)

printf '%s\n' 'gate-a2 three-producer/three-verifier interoperability passed'
