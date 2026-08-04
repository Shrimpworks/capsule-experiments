#!/bin/sh
set -eu

expected_sha1='1638CFBD9250A00B4DBD81AE8FD1C790B42F61E3'
expected_team='W4QUR9FUL4'
expected_bootstrap_application_id='W4QUR9FUL4.com.capsulecorp.spike.owner-lock-g3.bootstrap'
expected_supervisor_application_id='W4QUR9FUL4.com.capsulecorp.spike.owner-lock-g3.supervisor'
profile_root="${HOME}/Library/Developer/Xcode/UserData/Provisioning Profiles"

identities=$(security find-identity -v -p codesigning)
printf '%s\n' "$identities" | grep "$expected_sha1.*Apple Development: Dylan Steele (W4QUR9FUL4)"
certificate=$(security find-certificate -a -Z -c 'Apple Development: Dylan Steele (W4QUR9FUL4)' -p)
printf '%s\n' "$certificate" | openssl x509 -noout -fingerprint -sha1 -subject -issuer -dates -nameopt RFC2253

actual_sha1=$(printf '%s\n' "$certificate" | openssl x509 -noout -fingerprint -sha1 |
  sed 's/^sha1 Fingerprint=//; s/://g')
actual_team=$(printf '%s\n' "$certificate" | openssl x509 -noout -subject -nameopt RFC2253 |
  sed -n 's/.*OU=\([^,]*\).*/\1/p')

printf 'expectedCertificateSha1=%s actualCertificateSha1=%s\n' "$expected_sha1" "$actual_sha1"
printf 'expectedTeamIdentifier=%s certificateSubjectOU=%s\n' "$expected_team" "$actual_team"

bootstrap_profile_found=false
supervisor_profile_found=false
if [ -d "$profile_root" ]; then
  for profile in "$profile_root"/*.provisionprofile; do
    [ -f "$profile" ] || continue
    decoded=$(openssl smime -inform der -verify -noverify -in "$profile" 2>/dev/null)
    name=$(printf '%s\n' "$decoded" | plutil -extract Name raw -)
    team=$(printf '%s\n' "$decoded" | plutil -extract TeamIdentifier.0 raw -)
    application_identifier=$(printf '%s\n' "$decoded" |
      plutil -extract 'Entitlements.com\.apple\.application-identifier' raw - 2>/dev/null || true)
    printf 'profileName=%s teamIdentifier=%s applicationIdentifier=%s\n' \
      "$name" "$team" "$application_identifier"
    if [ "$team" = "$expected_team" ] &&
        [ "$application_identifier" = "$expected_bootstrap_application_id" ]; then
      bootstrap_profile_found=true
    fi
    if [ "$team" = "$expected_team" ] &&
        [ "$application_identifier" = "$expected_supervisor_application_id" ]; then
      supervisor_profile_found=true
    fi
  done
fi

sw_vers
uname -m
xcodebuild -version
xcrun --sdk macosx --show-sdk-version
swiftc --version
clang --version
go version

if [ "$actual_sha1" != "$expected_sha1" ] || [ "$actual_team" != "$expected_team" ]; then
  printf '%s\n' 'BLOCKED authorized certificate does not emit the expected TeamIdentifier' >&2
  exit 78
fi
if [ "$bootstrap_profile_found" != true ] || [ "$supervisor_profile_found" != true ]; then
  printf '%s\n' 'BLOCKED two exact W4 macOS App Development profiles are not locally available' >&2
  exit 78
fi
