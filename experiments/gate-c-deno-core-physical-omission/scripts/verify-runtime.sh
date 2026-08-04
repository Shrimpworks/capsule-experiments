#!/bin/sh
set -eu

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "usage: $0 BINARY [RESTORED_OP_BINARY]" >&2
  exit 2
fi

experiment=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
fixtures=$experiment/fixtures
binary=$1
restored_binary=${2:-}
image=sha256:b8483b5baafc8f085feb4a48ef34993b182de50d86ed03fd13b98b166e7a0ad6

run_probe() {
  docker run --rm --platform linux/arm64 --network none --read-only \
    --cap-drop ALL --security-opt no-new-privileges --memory 512m --cpus 1 \
    -v "$binary:/probe:ro" -v "$fixtures:/fixtures:ro" \
    --entrypoint /probe "$image" "$@"
}

run_probe_env() {
  variable=$1
  shift
  docker run --rm --platform linux/arm64 --network none --read-only \
    --cap-drop ALL --security-opt no-new-privileges --memory 512m --cpus 1 \
    -e "$variable" -v "$binary:/probe:ro" -v "$fixtures:/fixtures:ro" \
    --entrypoint /probe "$image" "$@"
}

expect_failure() {
  expected=$1
  shift
  output=$(mktemp "${TMPDIR:-/tmp}/capsule-deno-negative.XXXXXX")
  if "$@" >"$output" 2>&1; then
    echo "command unexpectedly passed: $*" >&2
    rm -f "$output"
    exit 1
  fi
  rg -q "$expected" "$output"
  rm -f "$output"
}

nominal=$(run_probe --source /fixtures/nominal.js --input /fixtures/input.json)
test "$nominal" = '{"count":3,"label":"capsule-owned","sum":6}'

seal=$(run_probe --source /fixtures/deno-core-seal.js --input /fixtures/input.json)
test "$seal" = '{"Deno":"undefined","bootstrap":"undefined","console":"undefined","process":"undefined","worker":"undefined","webAssembly":"undefined","sharedArrayBuffer":"undefined","atomics":"undefined","date":"undefined","temporal":"undefined"}'

expect_failure 'Module loading is not supported' run_probe \
  --source /fixtures/static-import.js --input /fixtures/input.json
expect_failure 'op_dispatch_exception is not a function' run_probe \
  --source /fixtures/dynamic-import.js --input /fixtures/input.json
expect_failure 'SyntaxError' run_probe \
  --source /fixtures/nominal.ts --input /fixtures/input.json
expect_failure 'source is not an exact retained Capsule fixture' run_probe \
  --source /fixtures/refused-source.js --input /fixtures/input.json
expect_failure 'input is not the exact retained Capsule fixture' run_probe \
  --source /fixtures/nominal.js --input /fixtures/refused-input.json

for mutation in \
  CAPSULE_MUTATION_EXTENSION \
  CAPSULE_MUTATION_INSPECTOR \
  CAPSULE_MUTATION_MODULE_LOADER \
  CAPSULE_MUTATION_REMOVE_JITLESS
do
  expect_failure 'construction manifest refused mutation' run_probe_env "$mutation=1" \
    --source /fixtures/nominal.js --input /fixtures/input.json
done

for mutation in socket clone execve exec-mmap; do
  result=$(run_probe_env "CAPSULE_RESTORATION_SYSCALL=$mutation" \
    --source /fixtures/nominal.js --input /fixtures/input.json)
  printf '%s\n' "$result" | rg -q \
    "^\{\"mutation\":\"$mutation\",\"result\":\"denied\",\"errno\":1\}$"
done

expect_failure 'unexpected inherited descriptors: \[0, 1, 2, 3\]' run_probe_env \
  CAPSULE_MUTATION_EXTRA_DESCRIPTOR=1 \
  --source /fixtures/nominal.js --input /fixtures/input.json

if [ -n "$restored_binary" ]; then
  original_binary=$binary
  binary=$restored_binary
  expect_failure 'physical op registry mismatch:.*op_print' run_probe \
    --source /fixtures/nominal.js --input /fixtures/input.json
  binary=$original_binary
fi

echo "fixed fixture, prohibited-power, descriptor, syscall, and restoration checks passed"
