#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
go_cache=${TMPDIR:-/private/tmp}/capsule-a2-hardening-go-cache
go_mod_cache=${TMPDIR:-/private/tmp}/capsule-a2-go-mod
clang_cache=${TMPDIR:-/private/tmp}/capsule-a2-hardening-clang-cache
swiftpm_cache=${TMPDIR:-/private/tmp}/capsule-a2-hardening-swiftpm-cache
corpus_path="$experiment_dir/fixtures/corpus.json"

(
  cd "$experiment_dir/go"
  GOCACHE="$go_cache" GOMODCACHE="$go_mod_cache" go test ./...
  GOCACHE="$go_cache" GOMODCACHE="$go_mod_cache" go run ./cmd/hardening corpus-check "$corpus_path"
)

(
  cd "$experiment_dir/typescript"
  fnm exec --using=22.22.1 -- corepack pnpm check
  fnm exec --using=22.22.1 -- corepack pnpm test
  fnm exec --using=22.22.1 -- node dist/src/main.js self-test "$corpus_path"
)

(
  cd "$experiment_dir/swift"
  CLANG_MODULE_CACHE_PATH="$clang_cache" SWIFTPM_MODULECACHE_OVERRIDE="$swiftpm_cache" \
    swift run GateA2HardeningSwift self-test "$corpus_path"
)

for kind in approval-grant enforcement-transcript; do
  go_envelope=$(
    cd "$experiment_dir/go"
    GOCACHE="$go_cache" GOMODCACHE="$go_mod_cache" go run ./cmd/hardening emit "$kind"
  )
  typescript_envelope=$(
    cd "$experiment_dir/typescript"
    fnm exec --using=22.22.1 -- node dist/src/main.js emit "$kind"
  )
  swift_envelope=$(
    cd "$experiment_dir/swift"
    CLANG_MODULE_CACHE_PATH="$clang_cache" SWIFTPM_MODULECACHE_OVERRIDE="$swiftpm_cache" \
      swift run GateA2HardeningSwift emit "$kind"
  )

  (
    cd "$experiment_dir/go"
    GOCACHE="$go_cache" GOMODCACHE="$go_mod_cache" \
      go run ./cmd/hardening verify "$kind" "$go_envelope" "$typescript_envelope" "$swift_envelope"
  )
  (
    cd "$experiment_dir/typescript"
    fnm exec --using=22.22.1 -- node dist/src/main.js verify \
      "$kind" "$go_envelope" "$typescript_envelope" "$swift_envelope"
  )
  (
    cd "$experiment_dir/swift"
    CLANG_MODULE_CACHE_PATH="$clang_cache" SWIFTPM_MODULECACHE_OVERRIDE="$swiftpm_cache" \
      swift run GateA2HardeningSwift verify \
        "$kind" "$go_envelope" "$typescript_envelope" "$swift_envelope"
  )
done

printf '%s\n' 'gate-a2 profile-hardening corpus and two-profile interoperability passed'
