#!/bin/sh
set -eu

artifact_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
work_root=$(mktemp -d /private/tmp/capsule-macos-i1a.XXXXXX)
trap 'rm -rf "$work_root"' EXIT INT TERM

swiftc_path=$(xcrun --sdk macosx --find swiftc)
sdk_path=$(xcrun --sdk macosx --show-sdk-path)

copy_source() {
    destination=$1
    mkdir -p "$destination/Sources"
    cp "$artifact_dir/Sources/CapsuleStatusApp.swift" "$destination/Sources/CapsuleStatusApp.swift"
}

compile_broker() {
    source_dir=$1
    output=$2
    env LC_ALL=C SOURCE_DATE_EPOCH=0 TZ=UTC \
        "$swiftc_path" \
        -parse-as-library \
        -whole-module-optimization \
        -O \
        -module-name CapsuleUnsignedConstruction \
        -target arm64-apple-macos14.0 \
        -sdk "$sdk_path" \
        -module-cache-path "$source_dir/.module-cache" \
        -Xcc "-ffile-prefix-map=$source_dir=/usr/src/capsule-macos-i1a" \
        -Xlinker -no_uuid \
        "$source_dir/Sources/CapsuleStatusApp.swift" \
        -framework AppKit \
        -o "$output"
    chmod 0755 "$output"
}

source_a="$work_root/source-a"
source_b="$work_root/source-b"
broker_a="$work_root/broker-a/Capsule"
broker_b="$work_root/broker-b/Capsule"
bundle_a="$work_root/build-a/Capsule.app"
bundle_b="$work_root/build-b/Capsule.app"

mkdir -p "$(dirname "$broker_a")" "$(dirname "$broker_b")"
copy_source "$source_a"
copy_source "$source_b"
compile_broker "$source_a" "$broker_a"
compile_broker "$source_b" "$broker_b"

cmp "$broker_a" "$broker_b"
node "$artifact_dir/scripts/assemble.mjs" "$broker_a" "$bundle_a" >/dev/null
node "$artifact_dir/scripts/assemble.mjs" "$broker_b" "$bundle_b" >/dev/null
diff -r "$bundle_a" "$bundle_b"

for plist in \
    "$bundle_a/Contents/Info.plist" \
    "$bundle_a/Contents/Library/Helpers/CapsuleDaemon.app/Contents/Info.plist" \
    "$bundle_a/Contents/Library/Helpers/CapsuleSupervisor.app/Contents/Info.plist" \
    "$bundle_a/Contents/Library/LaunchAgents/com.capsulecorp.capsule.daemon.plist" \
    "$bundle_a/Contents/Library/LaunchAgents/com.capsulecorp.capsule.supervisor.plist" \
    "$bundle_a/Contents/Library/Helpers/CapsuleDaemon.app/Contents/XPCServices/CapsuleSourceValidatorDaemon.xpc/Contents/Info.plist" \
    "$bundle_a/Contents/XPCServices/CapsuleSourceValidatorBroker.xpc/Contents/Info.plist"
do
    plutil -lint "$plist" >/dev/null
done

mkdir -p "$artifact_dir/dist"
find "$artifact_dir/dist" -mindepth 1 -delete
cp -R "$bundle_a" "$artifact_dir/dist/Capsule.app"

node "$artifact_dir/scripts/generate-evidence.mjs"
node "$artifact_dir/scripts/verify-bundle.mjs" \
    "$artifact_dir/dist/Capsule.app" \
    "$(node -e 'const fs=require("fs"); const p=process.argv[1]; process.stdout.write(JSON.parse(fs.readFileSync(p)).bundleManifest.sha256)' "$artifact_dir/evidence/construction.json")"
