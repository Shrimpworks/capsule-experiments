#!/bin/sh
set -eu

provisioned_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
experiment_dir=$(CDPATH= cd -- "$provisioned_dir/.." && pwd)
products="$experiment_dir/build/provisioned-derived-data/Build/Products/Debug"
broker_app="$products/CapsuleGateBBroker.app"
broker="$broker_app/Contents/MacOS/CapsuleGateBBroker"

if [ ! -x "$broker" ] || [ ! -f "$broker_app/Contents/embedded.provisionprofile" ]; then
  echo 'run ./Provisioned/run-provisioned.sh first' >&2
  exit 65
fi

if [ -n "${CAPSULE_SIGNING_IDENTITY:-}" ]; then
  signing_identity=$CAPSULE_SIGNING_IDENTITY
else
  matching_identities=$(security find-identity -v -p codesigning |
    sed -n 's/.*"\(Apple Development:[^"]*\)".*/\1/p')
  identity_count=$(printf '%s\n' "$matching_identities" |
    awk 'NF { count++ } END { print count + 0 }')
  if [ "$identity_count" -ne 1 ]; then
    echo 'expected exactly one Apple Development identity; set CAPSULE_SIGNING_IDENTITY' >&2
    exit 66
  fi
  signing_identity=$matching_identities
fi

team_id=$(codesign -d --verbose=4 "$broker_app" 2>&1 |
  sed -n 's/^TeamIdentifier=//p')
if ! printf '%s\n' "$team_id" | rg -q '^[A-Z0-9]{10}$'; then
  echo 'unable to derive Team ID from provisioned Broker' >&2
  exit 67
fi

stale_root=$(mktemp -d /private/tmp/capsule-stale-keygroup.XXXXXX)
stale_app="$stale_root/CapsuleGateBBroker.app"
stale="$stale_app/Contents/MacOS/CapsuleGateBBroker"
stale_entitlements="$stale_root/stale-entitlements.plist"
ditto "$broker_app" "$stale_app"
codesign -d --entitlements :- "$broker_app" >"$stale_entitlements" 2>/dev/null

clang -fobjc-arc -Wall -Wextra -Werror -DBUILD_MARKER='"stale-v0"' \
  "$provisioned_dir/Sources/authority_probe.m" \
  -framework Foundation -framework Security -framework LocalAuthentication \
  -o "$stale"
codesign --force --options runtime --timestamp=none \
  --sign "$signing_identity" \
  --entitlements "$stale_entitlements" \
  "$stale_app"
codesign --verify --strict --verbose=2 "$stale_app"

broker_identifier='io.github.dills122.capsule.gate-b.broker'
release_requirement="anchor apple generic and certificate leaf[subject.OU] = \"$team_id\" and certificate leaf[field.1.2.840.113635.100.6.1.12] exists and identifier \"$broker_identifier\""
original_hash=$(codesign -d --verbose=4 "$broker_app" 2>&1 | sed -n 's/^CDHash=//p')
stale_hash=$(codesign -d --verbose=4 "$stale_app" 2>&1 | sed -n 's/^CDHash=//p')
if [ "$original_hash" = "$stale_hash" ]; then
  echo 'stale fixture unexpectedly has the original code-directory hash' >&2
  exit 68
fi
exact_requirement="$release_requirement and cdhash H\"$original_hash\""
codesign --verify --strict -R="$release_requirement" "$broker_app"
codesign --verify --strict -R="$release_requirement" "$stale_app"
codesign --verify --strict -R="$exact_requirement" "$broker_app"
if codesign --verify --strict -R="$exact_requirement" "$stale_app" 2>/dev/null; then
  echo 'FAIL stale fixture unexpectedly passed the exact-build requirement' >&2
  exit 1
fi
echo 'PASS stale same-team build denied by exact-build code requirement'

original_identity=$($broker identity)
stale_identity=$($stale identity)
printf '%s\n%s\n' "$original_identity" "$stale_identity"
printf '%s\n' "$original_identity" | rg -q '^identity.build=v1$'
printf '%s\n' "$stale_identity" | rg -q '^identity.build=stale-v0$'

approval_group="$team_id.io.github.dills122.capsule.gate-b.approval"
service='io.github.dills122.capsule.gate-b.stale-group'
account='stale-group-probe'
key_tag='io.github.dills122.capsule.gate-b.stale-evidence-key'
$broker delete "$service" "$account" "$approval_group" >/dev/null || true
$broker delete-key "$approval_group" "$key_tag" >/dev/null || true

original_put=$($broker put "$service" "$account" "$approval_group" 'stale-readable-fixture')
original_key=$($broker create-key "$approval_group" "$key_tag" evidence)
stale_get=$($stale get "$service" "$account" "$approval_group")
stale_sign=$($stale sign-key "$approval_group" "$key_tag" deny)
printf '%s\n%s\n%s\n%s\n' "$original_put" "$original_key" "$stale_get" "$stale_sign"
printf '%s\n' "$original_put" | rg -q '^keychain.put.status=0 '
printf '%s\n' "$original_key" | rg -q '^key.create=true mode=evidence token=com.apple.setoken$'
printf '%s\n' "$stale_get" | rg -q '^keychain.get.status=0 '
printf '%s\n' "$stale_sign" | rg -q '^key.sign=true '

$broker delete "$service" "$account" "$approval_group" >/dev/null
$broker delete-key "$approval_group" "$key_tag" >/dev/null

printf 'CONFIRMED stale same-team/key-group residual original-cdhash=%s stale-cdhash=%s temp=%s\n' \
  "$original_hash" "$stale_hash" "$stale_root"
