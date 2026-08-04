#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$repo_root"

capsule_p03_gocache=${TMPDIR:-/tmp}/capsule-p0-3-go-cache
GOCACHE=$capsule_p03_gocache go test ./experiments/gate-c-p0-3-protocol-conformance/...
GOCACHE=$capsule_p03_gocache go run ./experiments/gate-c-p0-3-protocol-conformance/cmd/p0-3-conformance -verify
node --test ./experiments/gate-c-p0-3-protocol-conformance/cross-language/verifier.test.mjs
node ./experiments/gate-c-p0-3-protocol-conformance/cross-language/fault-harness.mjs
node ./experiments/gate-c-p0-3-protocol-conformance/cross-language/verifier.mjs
