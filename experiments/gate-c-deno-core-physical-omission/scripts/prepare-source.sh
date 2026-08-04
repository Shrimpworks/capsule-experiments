#!/bin/sh
set -eu

if [ "$#" -ne 3 ]; then
  echo "usage: $0 DENO_CORE_CRATE DENO_SOURCE_ARCHIVE RUSTY_V8_ARCHIVE" >&2
  exit 2
fi

experiment=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
work=$experiment/.work
core=$work/deno_core-0.409.0
deno=$work/deno

"$experiment/scripts/check-inputs.sh" "$1" "$2" "$3"

if [ -e "$core" ] || [ -e "$deno" ]; then
  echo "refusing to replace existing prepared source under $work" >&2
  exit 1
fi

mkdir -p "$work"
tar -xzf "$2" -C "$work"
"$experiment/review-phase-a.sh" "$1" "$deno"
tar -xzf "$1" -C "$work"
git apply --unsafe-paths --directory="$core" \
  "$experiment/patches/0001-physically-allowlist-bootstrap-ops.patch"
git apply --unsafe-paths --directory="$core" \
  "$experiment/patches/0002-canonicalize-snapshot-module-order.patch"
git apply --unsafe-paths --check --reverse --directory="$core" \
  "$experiment/patches/0001-physically-allowlist-bootstrap-ops.patch"
git apply --unsafe-paths --check --reverse --directory="$core" \
  "$experiment/patches/0002-canonicalize-snapshot-module-order.patch"

echo "reviewed physical-omission source prepared at $core"
