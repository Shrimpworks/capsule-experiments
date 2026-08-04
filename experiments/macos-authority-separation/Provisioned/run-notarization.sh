#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <developer-id-run-directory>" >&2
  exit 64
fi

run_root=$1
profile=${CAPSULE_NOTARY_PROFILE:-capsule-notary}
notarization_dir="$run_root/notarization"
mkdir -p "$notarization_dir"

for scheme in CapsuleGateBBroker CapsuleGateBSupervisor CapsuleGateBDaemon; do
  app="$run_root/exports/$scheme/$scheme.app"
  archive="$notarization_dir/$scheme.zip"
  if [ ! -d "$app" ]; then
    echo "missing Developer ID export: $app" >&2
    exit 66
  fi

  codesign --verify --strict --verbose=2 "$app"
  ditto -c -k --keepParent "$app" "$archive"
  xcrun notarytool submit "$archive" --keychain-profile "$profile" --wait
  xcrun stapler staple "$app"
  xcrun stapler validate "$app"

  assessment=$(spctl --assess --type execute --verbose=4 "$app" 2>&1)
  printf '%s\n' "$assessment"
  printf '%s\n' "$assessment" | rg -q 'source=Notarized Developer ID'
done

printf 'PASS three-role notarization/stapling/Gatekeeper matrix output=%s\n' "$run_root"
