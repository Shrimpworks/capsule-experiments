#!/bin/sh
set -eu

artifact_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
repository_root=$(CDPATH='' cd -- "$artifact_dir/../.." && pwd)
output=${1:-"$artifact_dir/dist/Capsule.app"}
case "$output" in
    "$artifact_dir/dist/Capsule.app"|/private/tmp/capsule-*/Capsule.app) ;;
    *) printf '%s\n' 'refusing output not named Capsule.app' >&2; exit 64 ;;
esac

work_root=$(mktemp -d /private/tmp/capsule-i1b-r3-unsigned.XXXXXX)
trap 'rm -rf "$work_root"' EXIT INT TERM

"$repository_root/artifacts/macos-i1a-unsigned-app-shell/scripts/reproduce.sh"
node "$repository_root/artifacts/macos-i1a-unsigned-app-shell/scripts/verify-bundle.mjs" \
    "$repository_root/artifacts/macos-i1a-unsigned-app-shell/dist/Capsule.app" \
    5bd80097775908031b1a4c90680e8c7656cc5e9f97df2cc187592f75ee67a56f >/dev/null

sdk=$(xcrun --sdk macosx --show-sdk-path)
probe_source="$artifact_dir/Sources/CapsuleProbe.c"
probe_header="$artifact_dir/Sources/CapsuleProbe.h"
inventory_source="$artifact_dir/Sources/CapsuleContainerInventory.c"
inventory_header="$artifact_dir/Sources/CapsuleContainerInventory.h"

clang -c -fno-common -fvisibility=hidden -Wall -Wextra -Werror \
    -mmacosx-version-min=14.0 -isysroot "$sdk" \
    "$inventory_source" -o "$work_root/container-inventory.o"

clang -c -fblocks -fno-common -fvisibility=hidden -Wall -Wextra -Werror \
    -mmacosx-version-min=14.0 -isysroot "$sdk" \
    -DCAPSULE_OWN_SERVICE='"com.capsulecorp.capsule.source-validator.approval-broker.v1"' \
    -DCAPSULE_WRONG_SERVICE='"com.capsulecorp.capsule.source-validator.daemon.v1"' \
    -DCAPSULE_REQUEST_RESOURCE='"request-approval-broker.bin"' \
    "$probe_source" -o "$work_root/broker-probe.o"

swiftc -parse-as-library -O -whole-module-optimization \
    -target arm64-apple-macos14.0 -sdk "$sdk" \
    -module-cache-path "$work_root/swift-module-cache" \
    -import-objc-header "$probe_header" \
    -Xcc -include -Xcc "$inventory_header" \
    "$artifact_dir/Sources/CapsuleStatusApp.swift" "$work_root/broker-probe.o" \
    "$work_root/container-inventory.o" \
    -o "$work_root/Capsule"

clang -fblocks -fno-common -fvisibility=hidden -Wall -Wextra -Werror \
    -mmacosx-version-min=14.0 -isysroot "$sdk" \
    -DCAPSULE_OWN_SERVICE='"com.capsulecorp.capsule.source-validator.daemon.v1"' \
    -DCAPSULE_WRONG_SERVICE='"com.capsulecorp.capsule.source-validator.approval-broker.v1"' \
    -DCAPSULE_REQUEST_RESOURCE='"request-daemon.bin"' \
    "$probe_source" "$inventory_source" "$artifact_dir/Sources/CapsuleDaemon.c" \
    -o "$work_root/CapsuleDaemon"

clang -fno-common -fvisibility=hidden -Wall -Wextra -Werror \
    -mmacosx-version-min=14.0 -isysroot "$sdk" \
    "$inventory_source" "$artifact_dir/Sources/CapsuleSupervisor.c" \
    -o "$work_root/CapsuleSupervisor"

rm -rf "$work_root/Capsule.app"
ditto "$repository_root/artifacts/macos-i1a-unsigned-app-shell/dist/Capsule.app" \
    "$work_root/Capsule.app"
rm -rf "$work_root/Capsule.app/Contents/Resources/CapsuleConstruction"
mkdir -p "$work_root/Capsule.app/Contents/Resources/CapsuleI1BR3"
mkdir -p "$work_root/Capsule.app/Contents/Library/Helpers/CapsuleDaemon.app/Contents/Resources/CapsuleI1BR3"

install -m 0755 "$work_root/Capsule" "$work_root/Capsule.app/Contents/MacOS/Capsule"
install -m 0755 "$work_root/CapsuleDaemon" \
    "$work_root/Capsule.app/Contents/Library/Helpers/CapsuleDaemon.app/Contents/MacOS/CapsuleDaemon"
install -m 0755 "$work_root/CapsuleSupervisor" \
    "$work_root/Capsule.app/Contents/Library/Helpers/CapsuleSupervisor.app/Contents/MacOS/CapsuleSupervisor"
install -m 0644 "$artifact_dir/Templates/daemon-LaunchAgent.plist" \
    "$work_root/Capsule.app/Contents/Library/LaunchAgents/com.capsulecorp.capsule.daemon.plist"
install -m 0644 "$artifact_dir/Templates/supervisor-LaunchAgent.plist" \
    "$work_root/Capsule.app/Contents/Library/LaunchAgents/com.capsulecorp.capsule.supervisor.plist"
install -m 0644 \
    "$repository_root/schemas/conformance/v0/mjs-source-validator-v1/approval-broker/request-ordinary.bin" \
    "$work_root/Capsule.app/Contents/Resources/CapsuleI1BR3/request-approval-broker.bin"
install -m 0644 \
    "$repository_root/schemas/conformance/v0/mjs-source-validator-v1/daemon/request-ordinary.bin" \
    "$work_root/Capsule.app/Contents/Library/Helpers/CapsuleDaemon.app/Contents/Resources/CapsuleI1BR3/request-daemon.bin"

rm -rf "$output"
mkdir -p "$(dirname -- "$output")"
ditto "$work_root/Capsule.app" "$output"

printf '%s\n' "unsigned_bundle=$output"
shasum -a 256 \
    "$output/Contents/MacOS/Capsule" \
    "$output/Contents/Library/Helpers/CapsuleDaemon.app/Contents/MacOS/CapsuleDaemon" \
    "$output/Contents/Library/Helpers/CapsuleSupervisor.app/Contents/MacOS/CapsuleSupervisor"
