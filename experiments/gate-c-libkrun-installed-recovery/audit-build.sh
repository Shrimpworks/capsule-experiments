#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
build_dir="$experiment_dir/.build"
identifier='com.capsulecorp.spike.libkrun-installed-recovery'
team_id=${CAPSULE_TEAM_ID:-3DDR84M4JS}
developer_id_oid='1.2.840.113635.100.6.1.13'
requirement="anchor apple generic and certificate leaf[subject.OU] = \"$team_id\" and certificate leaf[field.$developer_id_oid] exists and identifier \"$identifier\" and entitlement[\"com.apple.security.get-task-allow\"] absent"

for app in \
  "$build_dir/CapsuleKrunInstalledRecovery.app" \
  "$build_dir/CapsuleKrunInstalledRecoveryV2.app" \
  "$build_dir/CapsuleKrunInstalledRecoveryCorrupt.app"; do
  codesign --verify --deep --strict --verbose=2 "$app"
  codesign --verify --strict -R="$requirement" "$app"
  entitlements=$(codesign -d --entitlements - "$app" 2>&1)
  printf '%s\n' "$entitlements" | grep -q 'com.apple.security.app-sandbox'
  printf '%s\n' "$entitlements" | grep -q 'com.apple.security.hypervisor'
  if printf '%s\n' "$entitlements" | grep -q 'temporary-exception'; then
    echo "unexpected temporary exception in $app" >&2
    exit 1
  fi
  if printf '%s\n' "$entitlements" | grep -q 'application-groups'; then
    echo "unexpected app group in $app" >&2
    exit 1
  fi
  test -r "$app/Contents/Resources/root.ext4"
  codesign -d --verbose=4 "$app" 2>&1 | grep -q '^Runtime Version='
  codesign -d --verbose=4 "$app" 2>&1 | grep -q '^Timestamp='
done

test "$(stat -f '%Lp' "$build_dir/CapsuleKrunInstalledRecovery.app/Contents/Resources/root.ext4")" = 444
printf 'buildAudit=PASS storage=sealed-bundle-resource sandbox=true hypervisor=true appGroup=false absoluteException=false\n'
