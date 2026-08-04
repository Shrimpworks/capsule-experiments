#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
repository_dir=$(CDPATH='' cd -- "$experiment_dir/../.." && pwd)
g3_go_cache="${TMPDIR:-/tmp}/capsule-owner-lock-g3-go-cache"
mkdir -p "$g3_go_cache"
export GOCACHE="$g3_go_cache"

python3 -m unittest discover -s "$experiment_dir/tests" -p 'test_*.py'

cd "$repository_dir"
go test ./internal/execution/installationowner \
  -run 'TestDarwinOwner|TestOwnerLockEnrollment' -count=1
go test ./internal/execution/registrationstate \
  -run 'TestOwnerRequired|TestFixedStoreV1Owner' -count=1
go test ./internal/execution/registeredlifecycle \
  -run 'TestOwnerRequired|TestOwnedStartup|TestDuplicateOwner' -count=1

printf '%s\n' 'G3-NONCREDENTIAL PASS fixture and existing G1/G2 no-guest fault corpus only'
