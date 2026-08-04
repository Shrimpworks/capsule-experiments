#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
source_root=${CAPSULE_CONTAINERIZATION_SOURCE:-/private/tmp/capsule-gate-c-identity-containerization-0.33.3}
expected_commit=a2a1add6c7e1a1665e5397edc49d925c49090b3a

if [ ! -d "$source_root/.git" ]; then
  git clone --branch 0.33.3 --depth 1 \
    https://github.com/apple/containerization.git "$source_root"
fi

test "$(git -C "$source_root" rev-parse HEAD)" = "$expected_commit"
test -z "$(git -C "$source_root" status --short)"
"$experiment_dir/audit-public-surfaces.sh" "$source_root"

CAPSULE_CONTAINERIZATION_SOURCE="$source_root" \
  swift build --package-path "$experiment_dir" --product identity-recovery-probe

binary="$experiment_dir/.build/debug/identity-recovery-probe"
codesign --force --sign - \
  --entitlements "$experiment_dir/identity-recovery-probe.entitlements" "$binary"
codesign --verify --strict "$binary"
codesign -d --entitlements :- "$binary" 2>&1 | rg -q \
  '<key>com\.apple\.security\.virtualization</key><true/>'

printf 'binary=%s\n' "$binary"
printf 'binarySHA256=%s\n' "$(shasum -a 256 "$binary" | awk '{print $1}')"
