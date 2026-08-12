#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
source_root="$root/sources"
expected_clang='Apple clang version 21.0.0 (clang-2100.1.1.101)'
expected_sdk='26.5'

actual_clang=$(xcrun clang --version | sed -n '1p')
actual_sdk=$(xcrun --show-sdk-version)
if [ "$actual_clang" != "$expected_clang" ] || [ "$actual_sdk" != "$expected_sdk" ]; then
  printf '%s\n' "refusing unrecorded toolchain: clang=$actual_clang sdk=$actual_sdk" >&2
  exit 1
fi

work=$(mktemp -d "${TMPDIR:-/tmp}/capsule-e0-build.XXXXXX")
trap 'rm -rf "$work"' EXIT HUP INT TERM

compile_probe() {
  output=$1
  config=$2
  xcrun clang \
    -fobjc-arc -Os -Wall -Wextra -Werror -fvisibility=hidden \
    -mmacosx-version-min=14.0 \
    -fdebug-prefix-map="$root"=/capsule/e0 \
    -Wl,-no_uuid -Wl,-no_adhoc_codesign \
    -include "$config" \
    "$source_root/probe/authority_epoch_probe.m" \
    -framework Foundation \
    -o "$output"
}

compile_coordinator() {
  output=$1
  xcrun clang \
    -fobjc-arc -Os -Wall -Wextra -Werror -fvisibility=hidden \
    -mmacosx-version-min=14.0 \
    -fdebug-prefix-map="$root"=/capsule/e0 \
    -Wl,-no_uuid -Wl,-no_adhoc_codesign \
    "$source_root/coordinator/main.m" \
    -framework Foundation \
    -o "$output"
}

build_tree() {
  destination=$1
  current="$destination/CapsuleSupervisorAuthorityE1Probe.app"
  legacy="$destination/CapsuleSupervisorLegacyProbe.app"
  coordinator="$destination/CapsuleTrustBootstrapAuthorityE1.xpc"

  mkdir -p "$current/Contents/MacOS" "$current/Contents/Resources"
  mkdir -p "$legacy/Contents/MacOS" "$legacy/Contents/Resources"
  mkdir -p "$coordinator/Contents/MacOS" "$coordinator/Contents/Resources"

  cp "$root/templates/current-supervisor-Info.plist" "$current/Contents/Info.plist"
  cp "$root/templates/legacy-supervisor-Info.plist" "$legacy/Contents/Info.plist"
  cp "$root/templates/coordinator-Info.plist" "$coordinator/Contents/Info.plist"
  cp "$root/entitlements/current-supervisor.plist" "$current/Contents/Resources/RequestedEntitlements.plist"
  cp "$root/entitlements/legacy-supervisor.plist" "$legacy/Contents/Resources/RequestedEntitlements.plist"
  cp "$root/entitlements/coordinator.plist" "$coordinator/Contents/Resources/RequestedEntitlements.plist"

  compile_probe "$current/Contents/MacOS/CapsuleSupervisorAuthorityE1Probe" \
    "$source_root/probe/current_role_config.h"
  compile_probe "$legacy/Contents/MacOS/CapsuleSupervisorLegacyProbe" \
    "$source_root/probe/legacy_role_config.h"
  compile_coordinator "$coordinator/Contents/MacOS/CapsuleTrustBootstrapAuthorityE1"

  find "$destination" -type d -exec chmod 0755 {} +
  find "$destination" -type f -exec chmod 0644 {} +
  chmod 0755 \
    "$current/Contents/MacOS/CapsuleSupervisorAuthorityE1Probe" \
    "$legacy/Contents/MacOS/CapsuleSupervisorLegacyProbe" \
    "$coordinator/Contents/MacOS/CapsuleTrustBootstrapAuthorityE1"
}

build_tree "$work/a"
build_tree "$work/b"
diff -r "$work/a" "$work/b"
find "$work/a" ! -path "$work/a" -print | sort | while IFS= read -r path; do
  printf '%s %s\n' "$(stat -f '%Lp' "$path")" "${path#"$work/a/"}"
done >"$work/a-modes"
find "$work/b" ! -path "$work/b" -print | sort | while IFS= read -r path; do
  printf '%s %s\n' "$(stat -f '%Lp' "$path")" "${path#"$work/b/"}"
done >"$work/b-modes"
cmp "$work/a-modes" "$work/b-modes"

rm -rf "$root/dist"
mv "$work/a" "$root/dist"
