#!/bin/sh
set -eu

artifact_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
work_root=$(mktemp -d /private/tmp/capsule-source-validator-r2.XXXXXX)
trap 'rm -rf "$work_root"' EXIT INT TERM

copy_source() {
    destination=$1
    mkdir -p "$destination/src/bin" "$destination/launcher" "$destination/scripts"
    cp "$artifact_dir/Cargo.toml" "$destination/Cargo.toml"
    cp "$artifact_dir/Cargo.lock" "$destination/Cargo.lock"
    cp "$artifact_dir/LICENSE" "$destination/LICENSE"
    cp "$artifact_dir/rust-toolchain.toml" "$destination/rust-toolchain.toml"
    cp "$artifact_dir/src/lib.rs" "$destination/src/lib.rs"
    cp "$artifact_dir/src/bin/daemon.rs" "$destination/src/bin/daemon.rs"
    cp "$artifact_dir/src/bin/approval_broker.rs" "$destination/src/bin/approval_broker.rs"
    cp "$artifact_dir/launcher/launcher.c" "$destination/launcher/launcher.c"
    cp "$artifact_dir/launcher/daemon-Info.plist" "$destination/launcher/daemon-Info.plist"
    cp "$artifact_dir/launcher/broker-Info.plist" "$destination/launcher/broker-Info.plist"
}

build_rust() {
    source_dir=$1
    target_dir=$2
    env \
        CARGO_INCREMENTAL=0 \
        CARGO_NET_OFFLINE=true \
        LC_ALL=C \
        MACOSX_DEPLOYMENT_TARGET=14.0 \
        SOURCE_DATE_EPOCH=0 \
        TZ=UTC \
        RUSTFLAGS="--remap-path-prefix=$source_dir=/usr/src/capsule-source-validator-r2" \
        cargo +1.95.0 build \
            --manifest-path "$source_dir/Cargo.toml" \
            --release \
            --locked \
            --offline \
            --target aarch64-apple-darwin \
            --target-dir "$target_dir"
}

compile_launcher() {
    source_dir=$1
    role=$2
    policy_digest=$3
    output=$4
    env LC_ALL=C SOURCE_DATE_EPOCH=0 TZ=UTC clang \
        -fblocks -fno-common -fvisibility=hidden \
        -Wall -Wextra -Werror -Wno-deprecated-declarations \
        -ffile-prefix-map="$source_dir=/usr/src/capsule-source-validator-r2" \
        -mmacosx-version-min=14.0 \
        -DCAPSULE_ROLE="$role" \
        -DCAPSULE_POLICY_SHA256="\"$policy_digest\"" \
        "$source_dir/launcher/launcher.c" \
        -o "$output"
}

assemble() {
    source_dir=$1
    target_dir=$2
    output_dir=$3
    daemon_policy=$4
    broker_policy=$5

    daemon_bundle="$output_dir/CapsuleSourceValidatorDaemon.xpc"
    broker_bundle="$output_dir/CapsuleSourceValidatorBroker.xpc"
    mkdir -p "$daemon_bundle/Contents/MacOS" "$daemon_bundle/Contents/Resources"
    mkdir -p "$broker_bundle/Contents/MacOS" "$broker_bundle/Contents/Resources"

    compile_launcher "$source_dir" 1 "$daemon_policy" \
        "$daemon_bundle/Contents/MacOS/CapsuleSourceValidatorDaemonLauncher"
    compile_launcher "$source_dir" 2 "$broker_policy" \
        "$broker_bundle/Contents/MacOS/CapsuleSourceValidatorBrokerLauncher"

    cp "$source_dir/launcher/daemon-Info.plist" "$daemon_bundle/Contents/Info.plist"
    cp "$source_dir/launcher/broker-Info.plist" "$broker_bundle/Contents/Info.plist"
    cp "$target_dir/aarch64-apple-darwin/release/capsule-mjs-source-validator-daemon" \
        "$daemon_bundle/Contents/Resources/capsule-mjs-source-validator-daemon"
    cp "$target_dir/aarch64-apple-darwin/release/capsule-mjs-source-validator-approval-broker" \
        "$broker_bundle/Contents/Resources/capsule-mjs-source-validator-approval-broker"
    cp "$artifact_dir/../../schemas/conformance/v0/mjs-source-validator-v1/daemon/resource-policy-inactive.bin" \
        "$daemon_bundle/Contents/Resources/resource-policy-inactive.bin"
    cp "$artifact_dir/../../schemas/conformance/v0/mjs-source-validator-v1/approval-broker/resource-policy-inactive.bin" \
        "$broker_bundle/Contents/Resources/resource-policy-inactive.bin"

    chmod 0755 "$daemon_bundle/Contents/MacOS/CapsuleSourceValidatorDaemonLauncher"
    chmod 0755 "$broker_bundle/Contents/MacOS/CapsuleSourceValidatorBrokerLauncher"
    chmod 0755 "$daemon_bundle/Contents/Resources/capsule-mjs-source-validator-daemon"
    chmod 0755 "$broker_bundle/Contents/Resources/capsule-mjs-source-validator-approval-broker"
    chmod 0644 "$daemon_bundle/Contents/Info.plist" "$broker_bundle/Contents/Info.plist"
    chmod 0644 "$daemon_bundle/Contents/Resources/resource-policy-inactive.bin"
    chmod 0644 "$broker_bundle/Contents/Resources/resource-policy-inactive.bin"
}

source_a="$work_root/source-a"
source_b="$work_root/source-b"
target_a="$work_root/target-a"
target_b="$work_root/target-b"
bundle_a="$work_root/bundle-a"
bundle_b="$work_root/bundle-b"
copy_source "$source_a"
copy_source "$source_b"
build_rust "$source_a" "$target_a"
build_rust "$source_b" "$target_b"

daemon_policy=$(shasum -a 256 "$artifact_dir/../../schemas/conformance/v0/mjs-source-validator-v1/daemon/resource-policy-inactive.bin" | awk '{print $1}')
broker_policy=$(shasum -a 256 "$artifact_dir/../../schemas/conformance/v0/mjs-source-validator-v1/approval-broker/resource-policy-inactive.bin" | awk '{print $1}')
assemble "$source_a" "$target_a" "$bundle_a" "$daemon_policy" "$broker_policy"
assemble "$source_b" "$target_b" "$bundle_b" "$daemon_policy" "$broker_policy"

diff -r "$bundle_a" "$bundle_b"
mkdir -p "$artifact_dir/dist" "$artifact_dir/evidence"
find "$artifact_dir/dist" -mindepth 1 -delete
cp -R "$bundle_a/." "$artifact_dir/dist/"

node "$artifact_dir/scripts/generate-evidence.mjs" "$bundle_a" "$bundle_b"
node "$artifact_dir/scripts/verify-process.mjs"
node "$artifact_dir/scripts/verify-evidence.mjs"
