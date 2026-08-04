#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
fixture_image=${CAPSULE_KRUN_FIXTURE_IMAGE:-alpine@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce}
build_dir="$experiment_dir/.build"
disk="$build_dir/adversarial-root.ext4"
temporary_disk="/output/adversarial-root.ext4.tmp-$$"
container_name="capsule-libkrun-adversarial-rootfs-$$"
fixture_tmpfs_size=${CAPSULE_KRUN_FIXTURE_TMPFS_SIZE:-67108864}

test -x "$build_dir/guest-adversary-linux-arm64"
test -x "$build_dir/guest-launcher-linux-arm64"
if [ -e "$disk" ]; then
    printf 'refusing to overwrite existing disk: %s\n' "$disk" >&2
    exit 2
fi

cleanup() {
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    rm -f "$build_dir/adversarial-root.ext4.tmp-$$"
}
trap cleanup EXIT INT TERM

container_id=$(docker create --name "$container_name" \
    --label io.capsule.spike=libkrun-adversarial "$fixture_image" /bin/true)

docker export "$container_id" | docker run --rm -i --network none --read-only \
    --tmpfs "/fixture:rw,nosuid,nodev,noexec,size=$fixture_tmpfs_size" \
    --mount "type=bind,src=$build_dir,dst=/output" \
    ubuntu:22.04 \
    sh -ceu 'tar -xf - -C /fixture; install -D -m 0755 "$2" /fixture/usr/local/libexec/capsule-guest-adversary; install -D -m 0755 "$3" /fixture/usr/local/libexec/capsule-guest-launcher; truncate -s 128m "$1"; /usr/sbin/mkfs.ext4 -q -F -d /fixture "$1"' \
    sh "$temporary_disk" /output/guest-adversary-linux-arm64 \
    /output/guest-launcher-linux-arm64

mv "$build_dir/adversarial-root.ext4.tmp-$$" "$disk"
chmod 0444 "$disk"
printf 'rootDisk=%s\n' "$disk"
printf 'rootDiskSha256=%s\n' "$(shasum -a 256 "$disk" | awk '{print $1}')"
