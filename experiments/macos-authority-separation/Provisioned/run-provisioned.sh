#!/bin/sh
set -eu

provisioned_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
experiment_dir=$(CDPATH= cd -- "$provisioned_dir/.." && pwd)
interactive=false
case "${1:-}" in
  '') ;;
  --interactive) interactive=true ;;
  *) echo "usage: $0 [--interactive]" >&2; exit 64 ;;
esac
project="$provisioned_dir/GateBProvisioned.xcodeproj"
derived_data="$experiment_dir/build/provisioned-derived-data"
products="$derived_data/Build/Products/Debug"

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

for scheme in CapsuleGateBBroker CapsuleGateBSupervisor CapsuleGateBDaemon; do
  xcodebuild -project "$project" -scheme "$scheme" -configuration Debug \
    -quiet \
    -destination 'platform=macOS' \
    -derivedDataPath "$derived_data" \
    -allowProvisioningUpdates \
    -allowProvisioningDeviceRegistration \
    DEVELOPMENT_TEAM="$team_id" \
    CODE_SIGN_IDENTITY='Apple Development' \
    build
done

broker_app="$products/CapsuleGateBBroker.app"
supervisor_app="$products/CapsuleGateBSupervisor.app"
daemon_app="$products/CapsuleGateBDaemon.app"
broker="$broker_app/Contents/MacOS/CapsuleGateBBroker"
supervisor="$supervisor_app/Contents/MacOS/CapsuleGateBSupervisor"
daemon="$daemon_app/Contents/MacOS/CapsuleGateBDaemon"

for app in "$broker_app" "$supervisor_app" "$daemon_app"; do
  codesign --verify --strict --verbose=2 "$app"
done
test -f "$broker_app/Contents/embedded.provisionprofile"
test -f "$supervisor_app/Contents/embedded.provisionprofile"

broker_identity=$($broker identity)
supervisor_identity=$($supervisor identity)
daemon_identity=$($daemon identity)
printf '%s\n%s\n%s\n' "$broker_identity" "$supervisor_identity" "$daemon_identity"

printf '%s\n' "$broker_identity" | rg -q '^identity.identifier=io.github.dills122.capsule.gate-b.broker$'
printf '%s\n' "$broker_identity" | rg -q "^identity.team=$team_id$"
printf '%s\n' "$broker_identity" | rg -q '^identity.sandbox=true$'
printf '%s\n' "$supervisor_identity" | rg -q '^identity.identifier=io.github.dills122.capsule.gate-b.supervisor$'
printf '%s\n' "$supervisor_identity" | rg -q "^identity.team=$team_id$"
printf '%s\n' "$supervisor_identity" | rg -q '^identity.sandbox=true$'
printf '%s\n' "$daemon_identity" | rg -q '^identity.identifier=io.github.dills122.capsule.gate-b.daemon$'
printf '%s\n' "$daemon_identity" | rg -q "^identity.team=$team_id$"
printf '%s\n' "$daemon_identity" | rg -q '^identity.sandbox=true$'

approval_group="$team_id.io.github.dills122.capsule.gate-b.approval"
evidence_group="$team_id.io.github.dills122.capsule.gate-b.evidence"
service='io.github.dills122.capsule.gate-b.provisioned'
account='authority-probe'

$broker delete "$service" "$account" "$approval_group" >/dev/null || true
$supervisor delete "$service" "$account" "$evidence_group" >/dev/null || true

broker_put=$($broker put "$service" "$account" "$approval_group" 'broker-fixture')
broker_get=$($broker get "$service" "$account" "$approval_group")
supervisor_denied=$($supervisor get "$service" "$account" "$approval_group")
daemon_approval_denied=$($daemon get "$service" "$account" "$approval_group")
printf '%s\n%s\n%s\n%s\n' "$broker_put" "$broker_get" \
  "$supervisor_denied" "$daemon_approval_denied"
printf '%s\n' "$broker_put" | rg -q '^keychain.put.status=0 '
printf '%s\n' "$broker_get" | rg -q '^keychain.get.status=0 '
printf '%s\n' "$supervisor_denied" | rg -q '^keychain.get.status=-34018 '
printf '%s\n' "$daemon_approval_denied" | rg -q '^keychain.get.status=-34018 '

supervisor_put=$($supervisor put "$service" "$account" "$evidence_group" 'supervisor-fixture')
supervisor_get=$($supervisor get "$service" "$account" "$evidence_group")
broker_denied=$($broker get "$service" "$account" "$evidence_group")
daemon_evidence_denied=$($daemon get "$service" "$account" "$evidence_group")
printf '%s\n%s\n%s\n%s\n' "$supervisor_put" "$supervisor_get" \
  "$broker_denied" "$daemon_evidence_denied"
printf '%s\n' "$supervisor_put" | rg -q '^keychain.put.status=0 '
printf '%s\n' "$supervisor_get" | rg -q '^keychain.get.status=0 '
printf '%s\n' "$broker_denied" | rg -q '^keychain.get.status=-34018 '
printf '%s\n' "$daemon_evidence_denied" | rg -q '^keychain.get.status=-34018 '

approval_key_tag='io.github.dills122.capsule.gate-b.approval-key'
evidence_key_tag='io.github.dills122.capsule.gate-b.evidence-key'
$broker delete-key "$approval_group" "$approval_key_tag" >/dev/null || true
$supervisor delete-key "$evidence_group" "$evidence_key_tag" >/dev/null || true
approval_created=$($broker create-key "$approval_group" "$approval_key_tag" approval)
evidence_created=$($supervisor create-key "$evidence_group" "$evidence_key_tag" evidence)
evidence_signed=$($supervisor sign-key "$evidence_group" "$evidence_key_tag" deny)
daemon_approval_key_denied=$($daemon sign-key "$approval_group" "$approval_key_tag" deny)
supervisor_approval_key_denied=$($supervisor sign-key "$approval_group" "$approval_key_tag" deny)
broker_evidence_key_denied=$($broker sign-key "$evidence_group" "$evidence_key_tag" deny)
approval_noninteractive=$($broker sign-key "$approval_group" "$approval_key_tag" deny)
printf '%s\n%s\n%s\n%s\n%s\n%s\n%s\n' "$approval_created" "$evidence_created" \
  "$evidence_signed" "$daemon_approval_key_denied" "$supervisor_approval_key_denied" \
  "$broker_evidence_key_denied" "$approval_noninteractive"
printf '%s\n' "$approval_created" | rg -q '^key.create=true mode=approval token=com.apple.setoken$'
printf '%s\n' "$evidence_created" | rg -q '^key.create=true mode=evidence token=com.apple.setoken$'
printf '%s\n' "$evidence_signed" | rg -q '^key.sign=true '
printf '%s\n' "$daemon_approval_key_denied" | rg -q '^key.retrieve.status=-34018 '
printf '%s\n' "$supervisor_approval_key_denied" | rg -q '^key.retrieve.status=-34018 '
printf '%s\n' "$broker_evidence_key_denied" | rg -q '^key.retrieve.status=-34018 '
printf '%s\n' "$approval_noninteractive" | rg -q '^key.sign=false '
if [ "$interactive" = true ]; then
  approval_interactive=$($broker sign-key "$approval_group" "$approval_key_tag" allow)
  printf '%s\n' "$approval_interactive"
  printf '%s\n' "$approval_interactive" | rg -q '^key.sign=true '
fi

broker_store=$($broker write-store 'broker-store-fixture')
supervisor_store=$($supervisor write-store 'supervisor-store-fixture')
printf '%s\n%s\n' "$broker_store" "$supervisor_store"
printf '%s\n' "$broker_store" | rg -q '^store.write=true '
printf '%s\n' "$supervisor_store" | rg -q '^store.write=true '
broker_store_path=$(printf '%s\n' "$broker_store" | sed -n 's/^store.write=true path=\(.*\) error=none$/\1/p')
supervisor_store_path=$(printf '%s\n' "$supervisor_store" | sed -n 's/^store.write=true path=\(.*\) error=none$/\1/p')

broker_own_read=$($broker read-store "$broker_store_path")
supervisor_own_read=$($supervisor read-store "$supervisor_store_path")
supervisor_broker_denied=$($supervisor read-store "$broker_store_path")
daemon_broker_denied=$($daemon read-store "$broker_store_path")
broker_supervisor_denied=$($broker read-store "$supervisor_store_path")
printf '%s\n%s\n%s\n%s\n%s\n' "$broker_own_read" "$supervisor_own_read" \
  "$supervisor_broker_denied" "$daemon_broker_denied" "$broker_supervisor_denied"
printf '%s\n' "$broker_own_read" | rg -q '^store.read=true '
printf '%s\n' "$supervisor_own_read" | rg -q '^store.read=true '
printf '%s\n' "$supervisor_broker_denied" | rg -q '^store.read=false '
printf '%s\n' "$daemon_broker_denied" | rg -q '^store.read=false '
printf '%s\n' "$broker_supervisor_denied" | rg -q '^store.read=false '

$broker delete "$service" "$account" "$approval_group" >/dev/null
$supervisor delete "$service" "$account" "$evidence_group" >/dev/null
$broker delete-key "$approval_group" "$approval_key_tag" >/dev/null
$supervisor delete-key "$evidence_group" "$evidence_key_tag" >/dev/null
$broker delete-store >/dev/null
$supervisor delete-store >/dev/null

printf 'PASS provisioned Gate B keychain/store matrix team=%s identity=%s\n' \
  "$team_id" "$signing_identity"
