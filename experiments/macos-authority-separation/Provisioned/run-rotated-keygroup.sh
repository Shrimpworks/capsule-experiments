#!/bin/sh
set -eu

provisioned_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
experiment_dir=$(CDPATH= cd -- "$provisioned_dir/.." && pwd)
project="$provisioned_dir/GateBProvisioned.xcodeproj"
release1_products="$experiment_dir/build/provisioned-derived-data/Build/Products/Debug"
release2_derived="$experiment_dir/build/provisioned-release2-derived-data"
release2_products="$release2_derived/Build/Products/Debug"
release1_app="$release1_products/CapsuleGateBBroker.app"
release1="$release1_app/Contents/MacOS/CapsuleGateBBroker"
release2_app="$release2_products/CapsuleGateBBroker.app"
release2="$release2_app/Contents/MacOS/CapsuleGateBBroker"

if [ ! -x "$release1" ]; then
  echo 'run ./run-provisioned.sh first' >&2
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

team_id=$(codesign -d --verbose=4 "$release1_app" 2>&1 |
  sed -n 's/^TeamIdentifier=//p')
if ! printf '%s\n' "$team_id" | rg -q '^[A-Z0-9]{10}$'; then
  echo 'unable to derive Team ID from release-1 Broker' >&2
  exit 67
fi

xcodebuild -project "$project" -scheme CapsuleGateBBroker -configuration Debug \
  -quiet \
  -destination 'platform=macOS' \
  -derivedDataPath "$release2_derived" \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  DEVELOPMENT_TEAM="$team_id" \
  CODE_SIGN_IDENTITY='Apple Development' \
  CODE_SIGN_ENTITLEMENTS="$provisioned_dir/Entitlements/BrokerRelease2.entitlements" \
  build

codesign --verify --strict --verbose=2 "$release2_app"
test -f "$release2_app/Contents/embedded.provisionprofile"
release1_identity=$($release1 identity)
release2_identity=$($release2 identity)
printf '%s\n%s\n' "$release1_identity" "$release2_identity"

release1_group="$team_id.io.github.dills122.capsule.gate-b.approval"
release2_group="$team_id.io.github.dills122.capsule.gate-b.approval.release2"
printf '%s\n' "$release1_identity" | rg -q "^identity.keychain-groups=$release1_group$"
printf '%s\n' "$release2_identity" | rg -q "^identity.keychain-groups=$release2_group$"

release1_hash=$(codesign -d --verbose=4 "$release1_app" 2>&1 | sed -n 's/^CDHash=//p')
release2_hash=$(codesign -d --verbose=4 "$release2_app" 2>&1 | sed -n 's/^CDHash=//p')
if [ "$release1_hash" = "$release2_hash" ]; then
  echo 'rotated-group release unexpectedly retained the old code-directory hash' >&2
  exit 68
fi

broker_identifier='io.github.dills122.capsule.gate-b.broker'
release_requirement="anchor apple generic and certificate leaf[subject.OU] = \"$team_id\" and certificate leaf[field.1.2.840.113635.100.6.1.12] exists and identifier \"$broker_identifier\""
release1_exact="$release_requirement and cdhash H\"$release1_hash\""
codesign --verify --strict -R="$release_requirement" "$release1_app"
codesign --verify --strict -R="$release_requirement" "$release2_app"
codesign --verify --strict -R="$release1_exact" "$release1_app"
if codesign --verify --strict -R="$release1_exact" "$release2_app" 2>/dev/null; then
  echo 'release 2 unexpectedly passed the release-1 exact-build requirement' >&2
  exit 1
fi

release1_key='io.github.dills122.capsule.gate-b.release1-key'
release2_key='io.github.dills122.capsule.gate-b.release2-key'
$release1 delete-key "$release1_group" "$release1_key" >/dev/null || true
$release2 delete-key "$release2_group" "$release2_key" >/dev/null || true

release1_created=$($release1 create-key "$release1_group" "$release1_key" evidence)
release2_created=$($release2 create-key "$release2_group" "$release2_key" evidence)
release1_denied_new=$($release1 sign-key "$release2_group" "$release2_key" deny)
release2_denied_old=$($release2 sign-key "$release1_group" "$release1_key" deny)
release2_signed_new=$($release2 sign-key "$release2_group" "$release2_key" deny)
printf '%s\n%s\n%s\n%s\n%s\n' "$release1_created" "$release2_created" \
  "$release1_denied_new" "$release2_denied_old" "$release2_signed_new"
printf '%s\n' "$release1_created" | rg -q '^key.create=true mode=evidence token=com.apple.setoken$'
printf '%s\n' "$release2_created" | rg -q '^key.create=true mode=evidence token=com.apple.setoken$'
printf '%s\n' "$release1_denied_new" | rg -q '^key.retrieve.status=-34018 '
printf '%s\n' "$release2_denied_old" | rg -q '^key.retrieve.status=-34018 '
printf '%s\n' "$release2_signed_new" | rg -q '^key.sign=true '

$release1 delete-key "$release1_group" "$release1_key" >/dev/null
$release2 delete-key "$release2_group" "$release2_key" >/dev/null

printf 'PASS per-release Keychain-group rotation denied old/new cross-use release1=%s release2=%s\n' \
  "$release1_hash" "$release2_hash"
