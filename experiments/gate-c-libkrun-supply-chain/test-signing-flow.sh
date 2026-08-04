#!/bin/sh
set -eu

source_library=${CAPSULE_UNSIGNED_LIBRARY:-/private/tmp/capsule-libkrun-v1.19.4/target/release/libkrun.1.19.4.dylib}
if [ ! -f "$source_library" ]; then
    printf 'missing unsigned library: %s\n' "$source_library" >&2
    exit 2
fi

work_root=$(mktemp -d /private/tmp/capsule-signing-flow.XXXXXX)
trap 'rm -rf "$work_root"' EXIT INT TERM
mkdir -p "$work_root/a" "$work_root/b" "$work_root/tampered"
copy_a="$work_root/a/libkrun.1.19.4.dylib"
copy_b="$work_root/b/libkrun.1.19.4.dylib"
copy_tampered="$work_root/tampered/libkrun.1.19.4.dylib"

cp "$source_library" "$copy_a"
cp "$source_library" "$copy_b"
unsigned_sha=$(shasum -a 256 "$source_library" | awk '{print $1}')

codesign --force --sign - --timestamp=none --options runtime "$copy_a"
codesign --force --sign - --timestamp=none --options runtime "$copy_b"
codesign --verify --strict "$copy_a"
codesign --verify --strict "$copy_b"

signed_a_sha=$(shasum -a 256 "$copy_a" | awk '{print $1}')
signed_b_sha=$(shasum -a 256 "$copy_b" | awk '{print $1}')
if cmp -s "$copy_a" "$copy_b"; then
    ad_hoc_repeatable=true
else
    ad_hoc_repeatable=false
fi

cp "$copy_a" "$copy_tampered"
chmod u+w "$copy_tampered"
dd if=/dev/zero of="$copy_tampered" bs=1 seek=4096 count=1 conv=notrunc \
    >/dev/null 2>&1
if codesign --verify --strict "$copy_tampered" >/dev/null 2>&1; then
    tamper_rejected=false
else
    tamper_rejected=true
fi

printf 'unsignedSha256=%s\n' "$unsigned_sha"
printf 'signedASha256=%s\nsignedBSha256=%s\n' "$signed_a_sha" "$signed_b_sha"
printf 'adHocTimestampNoneRepeatable=%s\n' "$ad_hoc_repeatable"
printf 'postSignTamperRejected=%s\n' "$tamper_rejected"
printf 'developerIdTimestampFlowTested=false\n'
printf 'notarySubmissionTested=false\n'
