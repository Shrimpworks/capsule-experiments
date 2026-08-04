#!/bin/sh
set -eu

provisioned_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
experiment_dir=$(CDPATH= cd -- "$provisioned_dir/.." && pwd)
project="$provisioned_dir/GateBProvisioned.xcodeproj"
run_root=$(mktemp -d "$experiment_dir/build/developer-id-run.XXXXXX")
archives="$run_root/archives"
exports="$run_root/exports"
export_options="$run_root/DeveloperIDExportOptions.plist"
mkdir -p "$archives" "$exports"

if [ -n "${CAPSULE_TEAM_ID:-}" ]; then
  team_id=$CAPSULE_TEAM_ID
else
  development_identity=$(security find-identity -v -p codesigning |
    sed -n 's/.*"\(Apple Development:[^"]*\)".*/\1/p' | sed -n '1p')
  team_id=$(security find-certificate -c "$development_identity" -p |
    openssl x509 -noout -subject -nameopt RFC2253 |
    sed -n 's/.*OU=\([^,]*\).*/\1/p')
fi
if ! printf '%s\n' "$team_id" | rg -q '^[A-Z0-9]{10}$'; then
  echo 'unable to resolve a valid Apple Developer Team ID' >&2
  exit 65
fi

cp "$provisioned_dir/DeveloperIDExportOptions.plist" "$export_options"
plutil -insert teamID -string "$team_id" "$export_options"

for scheme in CapsuleGateBBroker CapsuleGateBSupervisor CapsuleGateBDaemon; do
  case "$scheme" in
    CapsuleGateBBroker)
      entitlements="$provisioned_dir/Entitlements/BrokerRelease2.entitlements"
      ;;
    CapsuleGateBSupervisor)
      entitlements="$provisioned_dir/Entitlements/SupervisorRelease2.entitlements"
      ;;
    CapsuleGateBDaemon)
      entitlements="$provisioned_dir/Entitlements/Daemon.entitlements"
      ;;
  esac
  archive="$archives/$scheme.xcarchive"
  export_path="$exports/$scheme"
  xcodebuild -project "$project" -scheme "$scheme" -configuration Release \
    -quiet \
    -destination 'generic/platform=macOS' \
    -archivePath "$archive" \
    -allowProvisioningUpdates \
    DEVELOPMENT_TEAM="$team_id" \
    CODE_SIGN_STYLE=Automatic \
    CODE_SIGN_ENTITLEMENTS="$entitlements" \
    SKIP_INSTALL=NO \
    archive
  xcodebuild -exportArchive \
    -archivePath "$archive" \
    -exportPath "$export_path" \
    -exportOptionsPlist "$export_options" \
    -allowProvisioningUpdates
done

broker_app="$exports/CapsuleGateBBroker/CapsuleGateBBroker.app"
supervisor_app="$exports/CapsuleGateBSupervisor/CapsuleGateBSupervisor.app"
daemon_app="$exports/CapsuleGateBDaemon/CapsuleGateBDaemon.app"
broker="$broker_app/Contents/MacOS/CapsuleGateBBroker"
supervisor="$supervisor_app/Contents/MacOS/CapsuleGateBSupervisor"
daemon="$daemon_app/Contents/MacOS/CapsuleGateBDaemon"

verify_developer_id() {
  app=$1
  identifier=$2
  requirement="anchor apple generic and certificate leaf[subject.OU] = \"$team_id\" and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and identifier \"$identifier\" and entitlement[\"com.apple.security.get-task-allow\"] absent"
  codesign --verify --strict --verbose=2 "$app"
  codesign --verify --strict -R="$requirement" "$app"
  codesign -d --verbose=4 "$app" 2>&1 | rg -q '^Runtime Version='
  codesign -d --verbose=4 "$app" 2>&1 | rg -q '^Timestamp='
}

verify_developer_id "$broker_app" 'io.github.dills122.capsule.gate-b.broker'
verify_developer_id "$supervisor_app" 'io.github.dills122.capsule.gate-b.supervisor'
verify_developer_id "$daemon_app" 'io.github.dills122.capsule.gate-b.daemon'
test -f "$broker_app/Contents/embedded.provisionprofile"
test -f "$supervisor_app/Contents/embedded.provisionprofile"

broker_identity=$($broker identity)
supervisor_identity=$($supervisor identity)
daemon_identity=$($daemon identity)
printf '%s\n%s\n%s\n' "$broker_identity" "$supervisor_identity" "$daemon_identity"

approval_group="$team_id.io.github.dills122.capsule.gate-b.approval.release2"
evidence_group="$team_id.io.github.dills122.capsule.gate-b.evidence.release2"
printf '%s\n' "$broker_identity" | rg -q "^identity.keychain-groups=$approval_group$"
printf '%s\n' "$supervisor_identity" | rg -q "^identity.keychain-groups=$evidence_group$"
printf '%s\n' "$daemon_identity" | rg -q '^identity.keychain-groups=none$'

approval_key='io.github.dills122.capsule.gate-b.developer-id-approval-key'
evidence_key='io.github.dills122.capsule.gate-b.developer-id-evidence-key'
$broker delete-key "$approval_group" "$approval_key" >/dev/null || true
$supervisor delete-key "$evidence_group" "$evidence_key" >/dev/null || true
broker_created=$($broker create-key "$approval_group" "$approval_key" evidence)
supervisor_created=$($supervisor create-key "$evidence_group" "$evidence_key" evidence)
broker_signed=$($broker sign-key "$approval_group" "$approval_key" deny)
supervisor_signed=$($supervisor sign-key "$evidence_group" "$evidence_key" deny)
daemon_approval_denied=$($daemon sign-key "$approval_group" "$approval_key" deny)
daemon_evidence_denied=$($daemon sign-key "$evidence_group" "$evidence_key" deny)
printf '%s\n%s\n%s\n%s\n%s\n%s\n' "$broker_created" "$supervisor_created" \
  "$broker_signed" "$supervisor_signed" "$daemon_approval_denied" "$daemon_evidence_denied"
printf '%s\n' "$broker_created" | rg -q '^key.create=true mode=evidence token=com.apple.setoken$'
printf '%s\n' "$supervisor_created" | rg -q '^key.create=true mode=evidence token=com.apple.setoken$'
printf '%s\n' "$broker_signed" | rg -q '^key.sign=true '
printf '%s\n' "$supervisor_signed" | rg -q '^key.sign=true '
printf '%s\n' "$daemon_approval_denied" | rg -q '^key.retrieve.status=-34018 '
printf '%s\n' "$daemon_evidence_denied" | rg -q '^key.retrieve.status=-34018 '

$broker delete-key "$approval_group" "$approval_key" >/dev/null
$supervisor delete-key "$evidence_group" "$evidence_key" >/dev/null

for app in "$broker_app" "$supervisor_app" "$daemon_app"; do
  assessment=$(spctl --assess --type execute --verbose=4 "$app" 2>&1 || true)
  printf '%s\n' "$assessment"
  printf '%s\n' "$assessment" | rg -q 'source=Unnotarized Developer ID'
done

printf 'PASS three-role Developer ID export/key matrix; notarization intentionally pending output=%s\n' \
  "$run_root"
