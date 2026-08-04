#!/bin/sh
set -eu

if [ "$#" -ne 4 ]; then
  echo "usage: $0 BINARY RESTORED_BINARY FIXTURES EVIDENCE_DIR" >&2
  exit 2
fi

binary=$1
restored=$2
fixtures=$3
evidence=$4
mkdir -p "$evidence"

run_probe() {
  "$binary" "$@"
}

run_probe_env() {
  variable=$1
  shift
  env "$variable" "$binary" "$@"
}

expect_failure() {
  expected=$1
  shift
  output=$(mktemp /workspace/cache/tmp/capsule-deno-negative.XXXXXX)
  if "$@" >"$output" 2>&1; then
    echo "command unexpectedly passed: $*" >&2
    rm -f "$output"
    exit 1
  fi
  grep -Eq "$expected" "$output"
  rm -f "$output"
}

nominal=$(run_probe --source "$fixtures/nominal.js" --input "$fixtures/input.json")
test "$nominal" = '{"count":3,"label":"capsule-owned","sum":6}'
printf '%s\n' "$nominal" > "$evidence/fixed-result.json"

seal=$(run_probe --source "$fixtures/deno-core-seal.js" --input "$fixtures/input.json")
test "$seal" = '{"Deno":"undefined","bootstrap":"undefined","console":"undefined","process":"undefined","worker":"undefined","webAssembly":"undefined","sharedArrayBuffer":"undefined","atomics":"undefined","date":"undefined","temporal":"undefined"}'
printf '%s\n' "$seal" > "$evidence/sealed-result.json"

run_probe --source "$fixtures/nominal.js" --input "$fixtures/input.json" --manifest \
  > "$evidence/runtime-manifest-and-result.txt"
grep -F '"op_get_ext_import_meta_proto"' "$evidence/runtime-manifest-and-result.txt" >/dev/null
grep -F '"op_get_extras_binding_object"' "$evidence/runtime-manifest-and-result.txt" >/dev/null
grep -F '"op_set_captured_bootstrap"' "$evidence/runtime-manifest-and-result.txt" >/dev/null
grep -F '"extensions": []' "$evidence/runtime-manifest-and-result.txt" >/dev/null
grep -F '"moduleLoader": "none"' "$evidence/runtime-manifest-and-result.txt" >/dev/null
grep -F '"inspector": false' "$evidence/runtime-manifest-and-result.txt" >/dev/null
grep -F '"inheritedDescriptors": [' "$evidence/runtime-manifest-and-result.txt" >/dev/null

expect_failure 'Module loading is not supported' run_probe \
  --source "$fixtures/static-import.js" --input "$fixtures/input.json"
expect_failure 'op_dispatch_exception is not a function' run_probe \
  --source "$fixtures/dynamic-import.js" --input "$fixtures/input.json"
expect_failure 'SyntaxError' run_probe \
  --source "$fixtures/nominal.ts" --input "$fixtures/input.json"
expect_failure 'source is not an exact retained Capsule fixture' run_probe \
  --source "$fixtures/refused-source.js" --input "$fixtures/input.json"
expect_failure 'input is not the exact retained Capsule fixture' run_probe \
  --source "$fixtures/nominal.js" --input "$fixtures/refused-input.json"

for mutation in \
  CAPSULE_MUTATION_EXTENSION \
  CAPSULE_MUTATION_INSPECTOR \
  CAPSULE_MUTATION_MODULE_LOADER \
  CAPSULE_MUTATION_REMOVE_JITLESS
do
  expect_failure 'construction manifest refused mutation' run_probe_env "$mutation=1" \
    --source "$fixtures/nominal.js" --input "$fixtures/input.json"
done

for mutation in socket clone execve exec-mmap; do
  result=$(run_probe_env "CAPSULE_RESTORATION_SYSCALL=$mutation" \
    --source "$fixtures/nominal.js" --input "$fixtures/input.json")
  printf '%s\n' "$result" | grep -Eq \
    "^\{\"mutation\":\"$mutation\",\"result\":\"denied\",\"errno\":1\}$"
  printf '%s\n' "$result" >> "$evidence/syscall-restoration-results.jsonl"
done

expect_failure 'unexpected inherited descriptors: \[0, 1, 2, 3\]' run_probe_env \
  CAPSULE_MUTATION_EXTRA_DESCRIPTOR=1 \
  --source "$fixtures/nominal.js" --input "$fixtures/input.json"

original=$binary
binary=$restored
expect_failure 'physical op registry mismatch:.*op_print' run_probe \
  --source "$fixtures/nominal.js" --input "$fixtures/input.json"
binary=$original

printf 'fixedResult=pass\n'
printf 'sealedGlobals=pass\n'
printf 'descriptorManifest=pass-[0,1,2]\n'
printf 'staticModuleRequest=refused\n'
printf 'dynamicModuleRequest=refused\n'
printf 'syscallRestoration=refused\n'
printf 'restoredOpPrintBinary=refused-four-op-registry\n'
