#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
build_dir="$experiment_dir/.build"
fixture_image=${CAPSULE_KRUN_FIXTURE_IMAGE:-alpine@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce}
builder_image=${CAPSULE_KRUN_BUILDER_IMAGE:-ubuntu@sha256:0e0a0fc6d18feda9db1590da249ac93e8d5abfea8f4c3c0c849ce512b5ef8982}
root="$build_dir/root-custody.ext4"
temporary="$root.tmp-$$"
container_name="capsule-root-custody-export-$$"
probe="$build_dir/guest-root-digest-linux-arm64"

if [ ! -x "$probe" ]; then
    printf 'missing guest probe; run build.sh first\n' >&2
    exit 2
fi
if [ -e "$root" ]; then
    printf 'refusing to overwrite existing root: %s\n' "$root" >&2
    exit 2
fi
cleanup() {
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    rm -f "$temporary"
}
trap cleanup EXIT INT TERM

container_id=$(docker create --pull never --name "$container_name" \
    --label io.capsule.spike=p0-1-root-custody "$fixture_image" /bin/true)
docker export "$container_id" | docker run --rm -i --pull=never --network none \
    --read-only --cap-drop ALL --security-opt no-new-privileges \
    --tmpfs /fixture:rw,nosuid,nodev,noexec,size=64m \
    --mount "type=bind,src=$build_dir,dst=/output" "$builder_image" \
    sh -ceu 'tar --no-same-owner -xf - -C /fixture; install -D -m 0755 "$2" /fixture/usr/local/libexec/capsule-root-digest; truncate -s 128m "$1"; /usr/sbin/mkfs.ext4 -q -F -O ^has_journal -d /fixture "$1"' \
    sh "/output/$(basename "$temporary")" \
    /output/guest-root-digest-linux-arm64
mv "$temporary" "$root"
chmod 0444 "$root"
{
    printf 'fixtureImage=%s\n' "$fixture_image"
    printf 'builderImage=%s\n' "$builder_image"
    printf 'rootLength=%s\n' "$(stat -f %z "$root")"
    printf 'rootSha256=%s\n' "$(shasum -a 256 "$root" | awk '{print $1}')"
    printf 'guestExecutable=/usr/local/libexec/capsule-root-digest\n'
} > "$build_dir/root.manifest"
cat "$build_dir/root.manifest"
