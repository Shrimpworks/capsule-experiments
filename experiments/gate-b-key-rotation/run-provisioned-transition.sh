#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
repository_dir=$(CDPATH='' cd -- "$experiment_dir/../.." && pwd)
provisioned_dir="$repository_dir/experiments/macos-authority-separation/Provisioned"
project="$provisioned_dir/GateBProvisioned.xcodeproj"
build_dir="$experiment_dir/build"
old_derived="$build_dir/release1-derived"
new_derived="$build_dir/release2-derived"
old_app="$old_derived/Build/Products/Debug/CapsuleGateBBroker.app"
new_app="$new_derived/Build/Products/Debug/CapsuleGateBBroker.app"
old_binary="$old_app/Contents/MacOS/CapsuleGateBBroker"
new_binary="$new_app/Contents/MacOS/CapsuleGateBBroker"

if [ -n "${CAPSULE_SIGNING_IDENTITY:-}" ]; then
  signing_identity=$CAPSULE_SIGNING_IDENTITY
else
  matching_identities=$(security find-identity -v -p codesigning |
    sed -n 's/.*"\(Apple Development:[^"]*\)".*/\1/p')
  identity_count=$(printf '%s\n' "$matching_identities" |
    awk 'NF { count++ } END { print count + 0 }')
  if [ "$identity_count" -ne 1 ]; then
    echo 'expected exactly one Apple Development identity; set CAPSULE_SIGNING_IDENTITY' >&2
    exit 65
  fi
  signing_identity=$matching_identities
fi

team_id=$(security find-certificate -c "$signing_identity" -p |
  openssl x509 -noout -subject -nameopt RFC2253 |
  sed -n 's/.*OU=\([^,]*\).*/\1/p')
if ! printf '%s\n' "$team_id" | rg -q '^[A-Z0-9]{10}$'; then
  echo "unable to derive Team ID from $signing_identity" >&2
  exit 66
fi

mkdir -p "$build_dir"
for variant in old new; do
  if [ "$variant" = old ]; then
    derived=$old_derived
    entitlements="$provisioned_dir/Entitlements/Broker.entitlements"
  else
    derived=$new_derived
    entitlements="$provisioned_dir/Entitlements/BrokerRelease2.entitlements"
  fi
  xcodebuild -project "$project" -scheme CapsuleGateBBroker -configuration Debug \
    -quiet -destination 'platform=macOS' -derivedDataPath "$derived" \
    -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
    DEVELOPMENT_TEAM="$team_id" CODE_SIGN_IDENTITY='Apple Development' \
    CODE_SIGN_ENTITLEMENTS="$entitlements" build
done

for variant in old new; do
  if [ "$variant" = old ]; then
    app=$old_app
    binary=$old_binary
    marker=release1-transition
  else
    app=$new_app
    binary=$new_binary
    marker=release2-transition
  fi
  expanded_entitlements="$build_dir/$variant-entitlements.plist"
  codesign -d --entitlements :- "$app" >"$expanded_entitlements" 2>/dev/null
  clang -fobjc-arc -Wall -Wextra -Werror -Wno-deprecated-declarations \
    -DBUILD_MARKER="\"$marker\"" \
    "$experiment_dir/Sources/key_transition_probe.m" \
    -framework Foundation -framework Security -framework LocalAuthentication \
    -o "$binary"
  codesign --force --options runtime --timestamp=none --sign "$signing_identity" \
    --entitlements "$expanded_entitlements" "$app"
  codesign --verify --strict --verbose=2 "$app"
done

old_group="$team_id.io.github.dills122.capsule.gate-b.approval"
new_group="$team_id.io.github.dills122.capsule.gate-b.approval.release2"
old_identity=$($old_binary identity)
new_identity=$($new_binary identity)
printf '%s\n%s\n' "$old_identity" "$new_identity"
printf '%s\n' "$old_identity" | rg -q '^identity.build=release1-transition$'
printf '%s\n' "$old_identity" | rg -q "^identity.keychain-groups=$old_group$"
printf '%s\n' "$new_identity" | rg -q '^identity.build=release2-transition$'
printf '%s\n' "$new_identity" | rg -q "^identity.keychain-groups=$new_group$"

python3 "$experiment_dir/platform_test.py" \
  --old-binary "$old_binary" --new-binary "$new_binary" \
  --old-group "$old_group" --new-group "$new_group"
