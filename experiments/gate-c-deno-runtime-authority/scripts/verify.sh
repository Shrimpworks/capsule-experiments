#!/bin/sh
set -eu

experiment=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
crate="$experiment/deno-core"
binary="$crate/target/release/capsule-deno-core-probe"
fixtures="$experiment/fixtures"
typescript_surface="$experiment/typescript-surface"

cargo fmt --manifest-path "$crate/Cargo.toml" -- --check
cargo check --manifest-path "$crate/Cargo.toml" --locked --offline
cargo test --manifest-path "$crate/Cargo.toml" --locked --offline
cargo build --manifest-path "$crate/Cargo.toml" --locked --offline --release
cargo metadata --manifest-path "$typescript_surface/Cargo.toml" --locked --offline \
  --format-version 1 >/dev/null
test "$(rg -c '^name = ' "$typescript_surface/Cargo.lock")" -eq 180

nominal=$(
  "$binary" --source "$fixtures/nominal.js" --input "$fixtures/input.json"
)
test "$nominal" = '{"count":3,"label":"capsule-owned","sum":6}'

seal=$(
  "$binary" --source "$fixtures/deno-core-seal.js" --input "$fixtures/input.json"
)
test "$seal" = '{"Deno":"undefined","bootstrap":"undefined","console":"undefined","process":"undefined","worker":"undefined","webAssembly":"undefined","sharedArrayBuffer":"undefined","atomics":"undefined","date":"undefined","temporal":"undefined"}'

manifest=$(
  "$binary" --source "$fixtures/nominal.js" --input "$fixtures/input.json" --manifest
)
printf '%s\n' "$manifest" | node -e '
let text = "";
process.stdin.on("data", chunk => text += chunk);
process.stdin.on("end", () => {
  const split = text.lastIndexOf("\n{");
  const document = JSON.parse(text.slice(0, split));
  if (document.denoCore !== "0.409.0") process.exit(1);
  if (document.builtinOps.total !== 99 || document.builtinOps.disabled !== 96) process.exit(1);
  if (document.moduleLoader !== "none" || document.inspector !== false) process.exit(1);
  if (document.observed.coreOps.length !== 99) process.exit(1);
});'

expect_failure() {
  expected=$1
  shift
  output_file=$(mktemp "${TMPDIR:-/tmp}/capsule-deno-core.XXXXXX")
  if "$@" >"$output_file" 2>&1; then
    echo "command unexpectedly passed: $*" >&2
    rm -f "$output_file"
    exit 1
  fi
  if ! rg -q "$expected" "$output_file"; then
    echo "failure did not contain '$expected': $*" >&2
    sed -n '1,80p' "$output_file" >&2
    rm -f "$output_file"
    exit 1
  fi
  rm -f "$output_file"
}

expect_failure 'Module loading is not supported' \
  "$binary" --source "$fixtures/static-import.js" --input "$fixtures/input.json"
expect_failure 'op is disabled' \
  "$binary" --source "$fixtures/dynamic-import.js" --input "$fixtures/input.json"
expect_failure 'SyntaxError' \
  "$binary" --source "$fixtures/nominal.ts" --input "$fixtures/input.json"

for mutation in \
  CAPSULE_MUTATION_ENABLE_OP \
  CAPSULE_MUTATION_EXTENSION \
  CAPSULE_MUTATION_INSPECTOR \
  CAPSULE_MUTATION_MODULE_LOADER \
  CAPSULE_MUTATION_REMOVE_JITLESS
do
  expect_failure 'construction manifest refused mutations' \
    env "$mutation=1" "$binary" --source "$fixtures/nominal.js" --input "$fixtures/input.json"
done

echo "deno_core construction checks passed (candidate decision remains NO-GO)"
