#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
fixture_image=${CAPSULE_KRUN_FIXTURE_IMAGE:-alpine@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce}
disk_name=${CAPSULE_KRUN_DISK_NAME:-alpine-3.22-root.ext4}
disk_size=${CAPSULE_KRUN_DISK_SIZE:-128m}
fixture_tmpfs_size=${CAPSULE_KRUN_FIXTURE_TMPFS_SIZE:-67108864}
build_dir="$experiment_dir/.build"
disk="$build_dir/$disk_name"
temporary_disk="/output/$disk_name.tmp-$$"
container_name="capsule-libkrun-rootfs-export-$$"
guest_probe="$build_dir/guest-probe-linux-arm64"
guest_launcher="$build_dir/guest-launcher-linux-arm64"

case "$disk_name" in
    ''|*[!A-Za-z0-9._-]*)
        printf 'invalid disk name: %s\n' "$disk_name" >&2
        exit 2
        ;;
esac

mkdir -p "$build_dir"
if [ ! -x "$guest_probe" ]; then
    printf 'missing guest probe; run %s/build-guest-probe.sh first\n' \
        "$experiment_dir" >&2
    exit 2
fi
if [ ! -x "$guest_launcher" ]; then
    printf 'missing guest launcher; run %s/build-guest-probe.sh first\n' \
        "$experiment_dir" >&2
    exit 2
fi
if [ -e "$disk" ]; then
    printf 'refusing to overwrite existing disk: %s\n' "$disk" >&2
    exit 2
fi

cleanup() {
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    rm -f "$build_dir/$disk_name.tmp-$$"
}
trap cleanup EXIT INT TERM

container_id=$(docker create --name "$container_name" \
    --label io.capsule.spike=libkrun-rootfs "$fixture_image" /bin/true)

docker export "$container_id" | docker run --rm -i --network none --read-only \
    --tmpfs "/fixture:rw,nosuid,nodev,noexec,size=$fixture_tmpfs_size" \
    --mount "type=bind,src=$build_dir,dst=/output" \
    ubuntu:22.04 \
    sh -ceu 'tar -xf - -C /fixture; install -D -m 0755 "$2" /fixture/usr/local/libexec/capsule-guest-probe; install -D -m 0755 "$3" /fixture/usr/local/libexec/capsule-guest-launcher; truncate -s "$4" "$1"; /usr/sbin/mkfs.ext4 -q -F -d /fixture "$1"' \
    sh "$temporary_disk" /output/guest-probe-linux-arm64 \
    /output/guest-launcher-linux-arm64 "$disk_size"

mv "$build_dir/$disk_name.tmp-$$" "$disk"

chmod 0444 "$disk"
printf 'rootDisk=%s\n' "$disk"
printf 'rootDiskSha256=%s\n' "$(shasum -a 256 "$disk" | awk '{print $1}')"
