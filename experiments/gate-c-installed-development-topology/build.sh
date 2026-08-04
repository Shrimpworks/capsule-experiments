#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
build_dir="$experiment_dir/.build"
app="$build_dir/CapsuleP04AInstalledTopology.app"
frameworks="$app/Contents/Frameworks"
macos_dir="$app/Contents/MacOS"
runner_app="$app/Contents/Helpers/CapsuleTopologyRunner.app"
runner_macos="$runner_app/Contents/MacOS"
runtime_dir="$app/Contents/Resources/Runtime"
manifest_dir="$app/Contents/Resources/Manifests"
launch_agent_dir="$app/Contents/Library/LaunchAgents"
service_plist="$launch_agent_dir/com.capsulecorp.spike.p0-4a-installed-topology.supervisor.plist"
libkrun_dir=${CAPSULE_LIBKRUN_SOURCE:-/private/tmp/capsule-libkrun-v1.19.4}
libkrun="$libkrun_dir/target/release/libkrun.1.19.4.dylib"
libkrunfw=${CAPSULE_LIBKRUNFW_LIBRARY:-/private/tmp/capsule-libkrunfw-v5.5.0/libkrunfw/libkrunfw.5.dylib}
runtime=${CAPSULE_RUNTIME_BINARY:-"$(command -v bun 2>/dev/null || true)"}
minimum_os=13.0
app_identifier='com.capsulecorp.spike.p0-4a-installed-topology'
client_identifier="$app_identifier.client"
supervisor_identifier="$app_identifier.supervisor"
runner_identifier="$app_identifier.runner"

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

verify_sha256() {
  expected=$1
  path=$2
  actual=$(sha256_file "$path")
  if [ "$actual" != "$expected" ]; then
    printf 'sha256 mismatch for %s: expected %s, got %s\n' "$path" "$expected" "$actual" >&2
    exit 78
  fi
}

test "$(uname -s)" = Darwin
test "$(git -C "$libkrun_dir" rev-parse HEAD)" = 728df8125077d0db44265f6e997c72b81b65c015
test -f "$libkrun"
test -f "$libkrunfw"
test -n "$runtime"
test -f "$runtime"
verify_sha256 fed87836b5eeaf5ba419869d2ac61f48c9696bc22096518299b285d8edf2c535 "$libkrun"
verify_sha256 c2e062f87c5b5cc4777d1e1ef9ef60f0eb7d1544c9c14c6d05911572ab686d1b "$libkrunfw"
test "$("$runtime" --version)" = 1.3.14

if [ -e "$app" ]; then
  printf 'refusing stale build output: %s\n' "$app" >&2
  exit 78
fi
mkdir -p "$build_dir" "$frameworks" "$macos_dir" "$runner_macos" \
  "$runtime_dir" "$manifest_dir" "$launch_agent_dir"

if [ -n "${CAPSULE_SIGNING_IDENTITY:-}" ]; then
  signing_identity=$CAPSULE_SIGNING_IDENTITY
else
  matching_identities=$(security find-identity -v -p codesigning 2>/dev/null |
    sed -n 's/.*"\(Developer ID Application:[^"]*\|Apple Development:[^"]*\)".*/\1/p')
  identity_count=$(printf '%s\n' "$matching_identities" | awk 'NF { count++ } END { print count + 0 }')
  if [ "$identity_count" -eq 1 ]; then
    signing_identity=$matching_identities
  else
    signing_identity=-
  fi
fi
case "$signing_identity" in
  -) signing_mode=ad-hoc; timestamp_flag='--timestamp=none' ;;
  Developer\ ID\ Application:*) signing_mode=developer-id; timestamp_flag=${CAPSULE_CODESIGN_TIMESTAMP:---timestamp} ;;
  Apple\ Development:*) signing_mode=apple-development; timestamp_flag='--timestamp=none' ;;
  *) signing_mode=explicit-other; timestamp_flag=${CAPSULE_CODESIGN_TIMESTAMP:---timestamp=none} ;;
esac

descriptor_sha=$(sha256_file "$experiment_dir/manifests/descriptor-manifest.json")
compile_c() {
  clang -std=c17 -Wall -Wextra -Werror "-mmacosx-version-min=$minimum_os" "$@"
}
compile_c -fobjc-arc "$experiment_dir/Sources/registrar.m" \
  -framework Foundation -framework ServiceManagement -o "$macos_dir/capsule-topology-registrar"
compile_c -DDESCRIPTOR_MANIFEST_SHA256="\"$descriptor_sha\"" \
  "$experiment_dir/Sources/descriptor_runner.c" -o "$runner_macos/capsule-topology-runner"
compile_c -DDESCRIPTOR_MANIFEST_SHA256="\"$descriptor_sha\"" \
  "$experiment_dir/Sources/descriptor_runner.c" -o "$build_dir/descriptor-runner-control"
compile_c "$experiment_dir/Sources/descriptor_launcher.c" \
  -o "$build_dir/descriptor-launcher"
compile_c "$experiment_dir/Sources/guest_launcher_placeholder.c" \
  -o "$macos_dir/capsule-guest-launcher-placeholder"
compile_c \
  "$experiment_dir/../gate-c-libkrun-installed-recovery/Sources/process_identity.c" \
  -framework CoreFoundation -framework Security -o "$macos_dir/capsule-process-identity"

compile_service_component() {
  output=$1
  role=$2
  build=$3
  compile_c -fblocks \
    -DCOMPONENT_ROLE="\"$role\"" -DCOMPONENT_BUILD="\"$build\"" \
    "$experiment_dir/../gate-b-installed-services/Sources/component.c" \
    -framework CoreFoundation -framework Security -lbsm -o "$output"
}
compile_service_component "$macos_dir/capsule-topology-supervisor" supervisor p0-4a-current
compile_service_component "$macos_dir/capsule-topology-client" client p0-4a-current
compile_service_component "$build_dir/capsule-topology-client-stale" client p0-4a-stale

cp "$libkrun" "$frameworks/libkrun.1.19.4.dylib"
cp "$libkrunfw" "$frameworks/libkrunfw.5.dylib"
cp "$runtime" "$runtime_dir/bun"
cp "$experiment_dir/fixtures/firmware.json" "$runtime_dir/firmware.json"
cp "$experiment_dir/fixtures/kernel.json" "$runtime_dir/kernel.json"
cp "$experiment_dir/fixtures/root.placeholder" "$runtime_dir/root.placeholder"
cp "$experiment_dir/runner.entitlements" "$manifest_dir/runner.entitlements.plist"
cp "$experiment_dir/manifests/descriptor-manifest.json" "$manifest_dir/descriptor-manifest.json"
cp "$experiment_dir/manifests/topology-input.json" "$manifest_dir/topology-input.json"
cp "$experiment_dir/Info.plist.in" "$app/Contents/Info.plist"
cp "$experiment_dir/RunnerInfo.plist.in" "$runner_app/Contents/Info.plist"
cp "$experiment_dir/LaunchAgent.plist.in" "$service_plist"

sign_item() {
  identifier=$1
  path=$2
  shift 2
  codesign --force --sign "$signing_identity" --options runtime "$timestamp_flag" \
    --identifier "$identifier" "$@" "$path"
  codesign --verify --strict "$path"
}
sign_item "$app_identifier.registrar" "$macos_dir/capsule-topology-registrar"
sign_item "$client_identifier" "$macos_dir/capsule-topology-client"
sign_item "$client_identifier" "$build_dir/capsule-topology-client-stale"
sign_item "$supervisor_identifier" "$macos_dir/capsule-topology-supervisor"
sign_item "$runner_identifier.control" "$build_dir/descriptor-runner-control"
codesign --force --sign "$signing_identity" --options runtime "$timestamp_flag" \
  --identifier "$runner_identifier" --entitlements "$experiment_dir/runner.entitlements" \
  "$runner_app"
codesign --verify --deep --strict "$runner_app"
sign_item "$app_identifier.guest-launcher-placeholder" \
  "$macos_dir/capsule-guest-launcher-placeholder"
sign_item "$app_identifier.process-identity" "$macos_dir/capsule-process-identity"
sign_item "$app_identifier.libkrun" "$frameworks/libkrun.1.19.4.dylib"
sign_item "$app_identifier.libkrunfw" "$frameworks/libkrunfw.5.dylib"

client_cdhash=$(codesign -d --verbose=4 "$macos_dir/capsule-topology-client" 2>&1 |
  sed -n 's/^CDHash=//p')
client_team=$(codesign -d --verbose=4 "$macos_dir/capsule-topology-client" 2>&1 |
  sed -n 's/^TeamIdentifier=//p')
if [ -n "$client_team" ] && [ "$client_team" != 'not set' ]; then
  channel_oid='1.2.840.113635.100.6.1.12'
  client_requirement="anchor apple generic and certificate leaf[subject.OU] = \"$client_team\" and certificate leaf[field.$channel_oid] exists and identifier \"$client_identifier\" and entitlement[\"com.apple.security.get-task-allow\"] absent and cdhash H\"$client_cdhash\""
else
  client_requirement="identifier \"$client_identifier\" and cdhash H\"$client_cdhash\""
fi
sed -i '' "s|__CLIENT_REQUIREMENT__|$client_requirement|" "$service_plist"
plutil -lint "$app/Contents/Info.plist" "$service_plist" \
  "$manifest_dir/runner.entitlements.plist" >/dev/null

python3 "$experiment_dir/topology_manifest.py" build "$app" --signing-mode "$signing_mode"
codesign --force --sign "$signing_identity" --options runtime "$timestamp_flag" \
  --identifier "$app_identifier" "$app"
codesign --verify --deep --strict --verbose=2 "$app"
python3 "$experiment_dir/topology_manifest.py" verify "$app" --verify-signature

printf 'build=pass signingMode=%s app=%s\n' "$signing_mode" "$app"
printf 'descriptorManifestSha256=%s\n' "$descriptor_sha"
printf 'clientRequirement=%s\n' "$client_requirement"
