#!/bin/sh
set -eu

experiment=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
work=$(mktemp -d "${TMPDIR:-/tmp}/capsule-typescript-boundary.XXXXXX")
trap 'rm -rf "$work"' EXIT

node --test "$experiment/scripts/boundary.test.mjs"

cargo fmt --manifest-path "$experiment/deno-ast/Cargo.toml" -- --check
cargo run --manifest-path "$experiment/deno-ast/Cargo.toml" --locked --offline --quiet -- \
  "$experiment/fixtures/ordinary.ts" >"$work/deno-ast.js"

NODE_NO_WARNINGS=1 node "$experiment/scripts/transform.mjs" emit \
  --source "$experiment/fixtures/ordinary.ts" \
  --output "$work/node-strip.js" \
  --record "$work/record.json" \
  --options "$experiment/options.json" \
  --transformer "$experiment/transformer-profile.json"

NODE_NO_WARNINGS=1 node "$experiment/scripts/transform.mjs" verify \
  --source "$experiment/fixtures/ordinary.ts" \
  --output "$work/node-strip.js" \
  --record "$work/record.json" \
  --options "$experiment/options.json" \
  --transformer "$experiment/transformer-profile.json"

go run "$experiment/verifier/main.go" \
  "$work/record.json" "$experiment/fixtures/ordinary.ts" "$work/node-strip.js"

test "$(wc -c <"$work/node-strip.js" | tr -d ' ')" = 391
test "$(shasum -a 256 "$work/node-strip.js" | awk '{print $1}')" = \
  f91911dd606409fed94c214381533f5ece3e2ae23ea861a3a55192cefad884cd
test "$(shasum -a 256 "$work/deno-ast.js" | awk '{print $1}')" = \
  14ccde8f1e962631d9450bf4328d27875548165188ceed4ce05bc59749803363

printf '%s\n' "PASS TypeScript approved-byte boundary focused experiment"
