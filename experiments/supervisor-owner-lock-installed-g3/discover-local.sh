#!/bin/sh
set -eu

expected_sha1='1638CFBD9250A00B4DBD81AE8FD1C790B42F61E3'
expected_display_name='Apple Development: Dylan Steele (W4QUR9FUL4)'
expected_team='W4QUR9FUL4'
expected_bootstrap_application_id='W4QUR9FUL4.com.capsulecorp.spike.owner-lock-g3.bootstrap'
expected_supervisor_application_id='W4QUR9FUL4.com.capsulecorp.spike.owner-lock-g3.supervisor'

identities=$(security find-identity -v -p codesigning)
identity_count=$(printf '%s\n' "$identities" |
  awk -v expected="$expected_sha1" 'index($0, expected) { count++ } END { print count + 0 }')
if [ "$identity_count" -ne 1 ]; then
  printf 'BLOCKED expected exactly one valid signing identity for SHA-1 %s, found %s\n' \
    "$expected_sha1" "$identity_count" >&2
  exit 78
fi
printf '%s\n' "$identities" | grep -F "$expected_sha1"

# `security find-certificate -p -c` selects by display name, not fingerprint. Refuse an
# ambiguous display-name result before asking OpenSSL to inspect the public certificate bytes.
certificate_metadata=$(security find-certificate -a -Z -c "$expected_display_name")
certificate_count=$(printf '%s\n' "$certificate_metadata" |
  awk '/^SHA-1 hash:/ { count++ } END { print count + 0 }')
expected_certificate_count=$(printf '%s\n' "$certificate_metadata" |
  awk -v expected="$expected_sha1" '$0 == "SHA-1 hash: " expected { count++ } END { print count + 0 }')
if [ "$certificate_count" -ne 1 ] || [ "$expected_certificate_count" -ne 1 ]; then
  printf 'BLOCKED display-name certificate lookup is ambiguous or does not resolve uniquely to SHA-1 %s\n' \
    "$expected_sha1" >&2
  exit 78
fi

certificate=$(security find-certificate -a -c "$expected_display_name" -p)
printf '%s\n' "$certificate" | openssl x509 -noout -fingerprint -sha1 -subject -issuer -dates -nameopt RFC2253

actual_sha1=$(printf '%s\n' "$certificate" | openssl x509 -noout -fingerprint -sha1 |
  sed 's/^sha1 Fingerprint=//; s/://g')
actual_team=$(printf '%s\n' "$certificate" | openssl x509 -noout -subject -nameopt RFC2253 |
  sed -n 's/.*OU=\([^,]*\).*/\1/p')

printf 'expectedCertificateSha1=%s actualCertificateSha1=%s\n' "$expected_sha1" "$actual_sha1"
printf 'expectedTeamIdentifier=%s certificateSubjectOU=%s\n' "$expected_team" "$actual_team"

bootstrap_profile_found=false
supervisor_profile_found=false
profile_count=0
for profile_root in \
  "${HOME}/Library/Developer/Xcode/UserData/Provisioning Profiles" \
  "${HOME}/Library/MobileDevice/Provisioning Profiles"; do
  if [ ! -d "$profile_root" ]; then
    continue
  fi
  for profile in "$profile_root"/*.provisionprofile "$profile_root"/*.mobileprovision; do
    [ -f "$profile" ] || continue
    profile_count=$((profile_count + 1))
    decoded=$(openssl smime -inform der -verify -noverify -in "$profile" 2>/dev/null)
    name=$(printf '%s\n' "$decoded" | plutil -extract Name raw -)
    team=$(printf '%s\n' "$decoded" | plutil -extract TeamIdentifier.0 raw -)
    entitlement_team=$(printf '%s\n' "$decoded" |
      plutil -extract 'Entitlements.com\.apple\.developer\.team-identifier' raw - 2>/dev/null || true)
    application_identifier=$(printf '%s\n' "$decoded" |
      plutil -extract 'Entitlements.com\.apple\.application-identifier' raw - 2>/dev/null || true)
    platform=$(printf '%s\n' "$decoded" | plutil -extract Platform.0 raw - 2>/dev/null || true)
    expiration=$(printf '%s\n' "$decoded" | plutil -extract ExpirationDate raw -)
    printf 'profileName=%s teamIdentifier=%s entitlementTeamIdentifier=%s applicationIdentifier=%s platform=%s expiration=%s\n' \
      "$name" "$team" "$entitlement_team" "$application_identifier" "$platform" "$expiration"
    if [ "$team" = "$expected_team" ] &&
        [ "$entitlement_team" = "$expected_team" ] &&
        [ "$platform" = 'OSX' ] &&
        [ "$application_identifier" = "$expected_bootstrap_application_id" ]; then
      bootstrap_profile_found=true
    fi
    if [ "$team" = "$expected_team" ] &&
        [ "$entitlement_team" = "$expected_team" ] &&
        [ "$platform" = 'OSX' ] &&
        [ "$application_identifier" = "$expected_supervisor_application_id" ]; then
      supervisor_profile_found=true
    fi
  done
done
printf 'cachedProvisioningProfileCount=%s\n' "$profile_count"

sw_vers
uname -m
xcodebuild -version
xcrun --sdk macosx --show-sdk-version
swiftc --version
clang --version
go version

blocked=false
if [ "$actual_sha1" != "$expected_sha1" ] || [ "$actual_team" != "$expected_team" ]; then
  printf '%s\n' 'BLOCKED authorized certificate does not emit the expected TeamIdentifier' >&2
  blocked=true
fi
if [ "$bootstrap_profile_found" != true ] || [ "$supervisor_profile_found" != true ]; then
  printf '%s\n' 'BLOCKED two exact W4 macOS App Development profiles are not locally available' >&2
  blocked=true
fi
if [ "$blocked" = true ]; then
  exit 78
fi
