#!/bin/sh
set -eu

experiment_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$experiment_root"

go test ./...

result_file=$(mktemp "${TMPDIR:-/tmp}/capsule-c6b1b-result.XXXXXX")
trap 'rm -f "$result_file"' EXIT HUP INT TERM
go run ./cmd/run \
  -fixture fixtures/supervisor-seam-v0.json \
  -output "$result_file"

go run ./cmd/verify \
  -fixture fixtures/supervisor-seam-v0.json \
  -result evidence/2026-08-11/result.json
go run ./cmd/verify \
  -fixture fixtures/supervisor-seam-v0.json \
  -result "$result_file"

shasum -a 256 -c SHA256SUMS
