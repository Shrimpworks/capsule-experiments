#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
build_dir="$experiment_dir/.build"
profile=${CAPSULE_NOTARY_PROFILE:-capsule-notary}
submission_id=${CAPSULE_NOTARY_SUBMISSION_ID:-}
app="$build_dir/CapsuleKrunInstalledRecovery.app"
archive="$build_dir/CapsuleKrunInstalledRecovery.zip"
stapled_archive="$build_dir/CapsuleKrunInstalledRecovery-stapled.zip"
log="$build_dir/notarization.log"
receipt="$build_dir/notary-submit.json"
submission_file="$build_dir/notary-submission-id.txt"

test -d "$app"
codesign --verify --deep --strict --verbose=2 "$app"
if [ -z "$submission_id" ] && [ -s "$submission_file" ]; then
  submission_id=$(sed -n '1p' "$submission_file")
fi
if [ -z "$submission_id" ]; then
  test ! -e "$archive" || {
    echo "refusing to overwrite existing upload archive without a submission ID: $archive" >&2
    exit 66
  }
  ditto -c -k --keepParent "$app" "$archive"
  temporary_receipt="$receipt.tmp-$$"
  trap 'rm -f "$temporary_receipt"' EXIT INT TERM
  xcrun notarytool submit "$archive" --keychain-profile "$profile" \
    --output-format json > "$temporary_receipt"
  mv "$temporary_receipt" "$receipt"
  trap - EXIT INT TERM
  submission_id=$(plutil -extract id raw -o - "$receipt")
  printf '%s\n' "$submission_id" > "$submission_file"
fi
test -f "$archive"
archive_sha=$(shasum -a 256 "$archive" | awk '{print $1}')
submission=$(xcrun notarytool info "$submission_id" \
  --keychain-profile "$profile" 2>&1)
printf '%s\n' "$submission" | tee "$log"
if printf '%s\n' "$submission" | grep -q 'status: In Progress'; then
  printf 'notarization=PENDING submission=%s uploadArchiveSha256=%s\n' \
    "$submission_id" "$archive_sha"
  exit 75
fi
printf '%s\n' "$submission" | grep -q 'status: Accepted'
xcrun stapler staple "$app"
xcrun stapler validate "$app"
assessment=$(spctl --assess --type execute --verbose=4 "$app" 2>&1)
printf '%s\n' "$assessment" | tee -a "$log"
printf '%s\n' "$assessment" | grep -q 'source=Notarized Developer ID'
syspolicy_check distribution "$app" | tee -a "$log"
test ! -e "$stapled_archive" || {
  echo "refusing to overwrite existing stapled archive: $stapled_archive" >&2
  exit 66
}
ditto -c -k --keepParent "$app" "$stapled_archive"
stapled_archive_sha=$(shasum -a 256 "$stapled_archive" | awk '{print $1}')
printf 'notarization=PASS submission=%s uploadArchiveSha256=%s stapledArchiveSha256=%s profile=%s\n' \
  "$submission_id" "$archive_sha" "$stapled_archive_sha" "$profile"
