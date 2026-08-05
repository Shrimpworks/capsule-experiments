#!/bin/sh
set -eu

artifact_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
repository_root=$(CDPATH='' cd -- "$artifact_dir/../.." && pwd)
work_root=$(mktemp -d /private/tmp/capsule-macos-i2b2.XXXXXX)
trap 'rm -rf "$work_root"' EXIT INT TERM

node "$repository_root/scripts/generate-macos-i2b2-profile.mjs" >/dev/null

bundle_a="$work_root/build-a/Capsule.app"
bundle_b="$work_root/build-b/Capsule.app"
mkdir -p "$(dirname "$bundle_a")" "$(dirname "$bundle_b")"
node "$artifact_dir/scripts/assemble.mjs" "$bundle_a" >/dev/null
node "$artifact_dir/scripts/assemble.mjs" "$bundle_b" >/dev/null
diff -r "$bundle_a" "$bundle_b"

for plist in \
    "$bundle_a/Contents/XPCServices/CapsuleTrustBootstrap.xpc/Contents/Info.plist" \
    "$bundle_a/Contents/Resources/CapsuleI2B2/DeclaredInputs/Entitlements/coordinator.plist" \
    "$bundle_a/Contents/Resources/CapsuleI2B2/DeclaredInputs/Entitlements/supervisor.plist" \
    "$bundle_a/Contents/Resources/CapsuleI2B2/DeclaredInputs/ServiceManagement/supervisor-bootstrap-LaunchAgent.plist"
do
    plutil -lint "$plist" >/dev/null
done

mkdir -p "$artifact_dir/dist"
find "$artifact_dir/dist" -mindepth 1 -delete
cp -R "$bundle_a" "$artifact_dir/dist/Capsule.app"

node "$artifact_dir/scripts/generate-evidence.mjs"
manifest_sha=$(node -e 'const fs=require("fs"); const p=process.argv[1]; process.stdout.write(JSON.parse(fs.readFileSync(p)).bundleManifest.sha256)' "$artifact_dir/evidence/construction.json")
node "$artifact_dir/scripts/verify-bundle.mjs" "$artifact_dir/dist/Capsule.app" "$manifest_sha"
