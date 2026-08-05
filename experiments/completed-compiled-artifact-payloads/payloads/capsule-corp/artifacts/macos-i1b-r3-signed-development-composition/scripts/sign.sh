#!/bin/sh
set -eu

artifact_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
bundle="$artifact_dir/dist/Capsule.app"
identity=80A4969BCD1B3926020888094B9D812A283D3793

: "${CAPSULE_BROKER_PROFILE:?set CAPSULE_BROKER_PROFILE to the exact broker profile path}"
: "${CAPSULE_DAEMON_PROFILE:?set CAPSULE_DAEMON_PROFILE to the exact daemon profile path}"
: "${CAPSULE_SUPERVISOR_PROFILE:?set CAPSULE_SUPERVISOR_PROFILE to the exact Supervisor profile path}"

security find-identity -v -p codesigning /Users/dsteele/Library/Keychains/login.keychain-db | \
    awk -v identity="$identity" '$2 == identity { found = 1 } END { exit found ? 0 : 1 }'

"$artifact_dir/scripts/build-unsigned.sh" "$bundle"
mkdir -p "$artifact_dir/evidence"
node "$artifact_dir/scripts/generate-unsigned-manifest.mjs" "$bundle" \
    "$artifact_dir/evidence/unsigned-source-manifest.json"
node "$artifact_dir/scripts/prepare-signing-inputs.mjs" "$bundle" \
    "$CAPSULE_BROKER_PROFILE" "$CAPSULE_DAEMON_PROFILE" "$CAPSULE_SUPERVISOR_PROFILE" >/dev/null

entitlements="$artifact_dir/Entitlements"
constraints="$artifact_dir/Constraints"
daemon_app="$bundle/Contents/Library/Helpers/CapsuleDaemon.app"
supervisor_app="$bundle/Contents/Library/Helpers/CapsuleSupervisor.app"
daemon_xpc="$daemon_app/Contents/XPCServices/CapsuleSourceValidatorDaemon.xpc"
broker_xpc="$bundle/Contents/XPCServices/CapsuleSourceValidatorBroker.xpc"
daemon_parser="$daemon_xpc/Contents/Resources/capsule-mjs-source-validator-daemon"
broker_parser="$broker_xpc/Contents/Resources/capsule-mjs-source-validator-approval-broker"

sign_common() {
    codesign --force --sign "$identity" --timestamp=none --options runtime \
        --enforce-constraint-validity "$@"
}

sign_common --identifier com.capsulecorp.capsule.source-validator-parser.daemon.v1 \
    --entitlements "$entitlements/parser-child.plist" \
    --launch-constraint-self "$constraints/daemon-parser-self.coderequirement" \
    --launch-constraint-parent "$constraints/daemon-launcher-self.coderequirement" \
    --launch-constraint-responsible "$constraints/daemon-self.coderequirement" \
    --library-constraint "$constraints/no-nonplatform-libraries.coderequirement" \
    "$daemon_parser"

sign_common --identifier com.capsulecorp.capsule.source-validator-parser.approval-broker.v1 \
    --entitlements "$entitlements/parser-child.plist" \
    --launch-constraint-self "$constraints/broker-parser-self.coderequirement" \
    --launch-constraint-parent "$constraints/broker-launcher-self.coderequirement" \
    --launch-constraint-responsible "$constraints/broker-self.coderequirement" \
    --library-constraint "$constraints/no-nonplatform-libraries.coderequirement" \
    "$broker_parser"

sign_common --identifier com.capsulecorp.capsule.source-validator.daemon.v1 \
    --entitlements "$entitlements/validator-launcher.plist" \
    --launch-constraint-self "$constraints/daemon-launcher-self.coderequirement" \
    --launch-constraint-parent "$constraints/launchd-parent.coderequirement" \
    --launch-constraint-responsible "$constraints/daemon-self.coderequirement" \
    --library-constraint "$constraints/no-nonplatform-libraries.coderequirement" \
    "$daemon_xpc"

sign_common --identifier com.capsulecorp.capsule.source-validator.approval-broker.v1 \
    --entitlements "$entitlements/validator-launcher.plist" \
    --launch-constraint-self "$constraints/broker-launcher-self.coderequirement" \
    --launch-constraint-parent "$constraints/launchd-parent.coderequirement" \
    --launch-constraint-responsible "$constraints/broker-self.coderequirement" \
    --library-constraint "$constraints/no-nonplatform-libraries.coderequirement" \
    "$broker_xpc"

sign_common --identifier com.capsulecorp.capsule.daemon \
    --entitlements "$entitlements/daemon.plist" \
    --launch-constraint-self "$constraints/daemon-self.coderequirement" \
    --launch-constraint-parent "$constraints/launchd-parent.coderequirement" \
    --library-constraint "$constraints/no-nonplatform-libraries.coderequirement" \
    "$daemon_app"

sign_common --identifier com.capsulecorp.capsule.supervisor \
    --entitlements "$entitlements/supervisor.plist" \
    --launch-constraint-self "$constraints/supervisor-self.coderequirement" \
    --launch-constraint-parent "$constraints/launchd-parent.coderequirement" \
    --library-constraint "$constraints/no-nonplatform-libraries.coderequirement" \
    "$supervisor_app"

sign_common --identifier com.capsulecorp.capsule.broker \
    --entitlements "$entitlements/broker.plist" \
    --launch-constraint-self "$constraints/broker-self.coderequirement" \
    --library-constraint "$constraints/no-nonplatform-libraries.coderequirement" \
    "$bundle"

codesign --verify --deep --strict --verbose=4 "$bundle"
node "$artifact_dir/scripts/verify-signed.mjs" "$bundle" \
    --write-enrollment "$artifact_dir/evidence/signed-enrollment.json" >/dev/null
printf '%s\n' "signed_bundle=$bundle"
