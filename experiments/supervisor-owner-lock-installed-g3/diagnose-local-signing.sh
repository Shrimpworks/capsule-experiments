#!/bin/sh
set -eu

# This is an explicitly authorized, development-only diagnostic. It performs one local
# code-signing operation with the selected identity but never exports key material, installs or
# launches the probe, contacts an Apple service, or retains the signed bytes.
if [ "${CAPSULE_AUTHORIZED_SIGNING_PROBE:-}" != '1' ]; then
  printf '%s\n' 'BLOCKED set CAPSULE_AUTHORIZED_SIGNING_PROBE=1 only for a deliberately authorized local signing diagnostic' >&2
  exit 78
fi

expected_sha1='1638CFBD9250A00B4DBD81AE8FD1C790B42F61E3'
expected_team='W4QUR9FUL4'
probe_identifier='com.capsulecorp.spike.owner-lock-g3.signing-diagnostic'
probe_directory=$(mktemp -d "${TMPDIR:-/tmp}/capsule-owner-lock-g3-signing.XXXXXX")
probe_path="$probe_directory/probe"

cleanup() {
  rm -rf "$probe_directory"
}
trap cleanup EXIT HUP INT TERM

identities=$(security find-identity -v -p codesigning)
identity_count=$(printf '%s\n' "$identities" |
  awk -v expected="$expected_sha1" 'index($0, expected) { count++ } END { print count + 0 }')
if [ "$identity_count" -ne 1 ]; then
  printf 'BLOCKED expected exactly one valid signing identity for SHA-1 %s, found %s\n' \
    "$expected_sha1" "$identity_count" >&2
  exit 78
fi

cp /usr/bin/true "$probe_path"
codesign --force --sign "$expected_sha1" --identifier "$probe_identifier" --options runtime "$probe_path"
codesign --verify --strict --verbose=4 "$probe_path"

signing_readback=$(codesign -d --verbose=4 --requirements - "$probe_path" 2>&1)
printf '%s\n' "$signing_readback"
actual_team=$(printf '%s\n' "$signing_readback" | sed -n 's/^TeamIdentifier=//p')
cdhash=$(printf '%s\n' "$signing_readback" | sed -n 's/^CDHash=//p')
signed_byte_sha256=$(shasum -a 256 "$probe_path" | awk '{ print $1 }')
expected_requirement="identifier \"$probe_identifier\" and anchor apple generic and certificate leaf[subject.OU] = \"$expected_team\" and certificate leaf[field.1.2.840.113635.100.6.1.12] /* exists */"

printf 'signingSelectorSha1=%s\n' "$expected_sha1"
printf 'expectedTeamIdentifier=%s actualTeamIdentifier=%s\n' "$expected_team" "$actual_team"
printf 'cdHash=%s signedByteSha256=%s\n' "$cdhash" "$signed_byte_sha256"
printf '%s\n' 'defaultDesignatedRequirementIsAdmissionRequirement=false'

# The default requirement is printed only as diagnostic metadata. Admission requires an explicit
# Team binding and, in the installed harness, the separately enrolled exact CDHash/entitlement set.
if ! codesign --verify --strict -R="$expected_requirement" "$probe_path"; then
  printf '%s\n' 'BLOCKED signed probe does not satisfy the explicit expected-Team requirement' >&2
  exit 78
fi
if [ "$actual_team" != "$expected_team" ]; then
  printf '%s\n' 'BLOCKED signed probe does not emit the expected TeamIdentifier' >&2
  exit 78
fi

printf '%s\n' 'G3-SIGNING-DIAGNOSTIC PASS exact selector, emitted TeamIdentifier, and explicit Team requirement agree'
