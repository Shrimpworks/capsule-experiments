#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$root"

node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "$node_major" -lt 22 ]; then
    echo "Node.js 22 or newer is required" >&2
    exit 1
fi

node scripts/generate-fixtures.mjs
node scripts/verify.mjs
plutil -lint inputs/CapsuleC6b1BrokerEvidence.entitlements inputs/Info.plist.template
swift test
swift run capsule-c6b1-broker-evidence --fixture-root "$root"
