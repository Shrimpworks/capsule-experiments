#!/bin/sh
set -eu

experiment_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
build_dir="$experiment_dir/.build"
builder_image=${CAPSULE_EXT4_BUILDER_IMAGE:-ubuntu@sha256:0e0a0fc6d18feda9db1590da249ac93e8d5abfea8f4c3c0c849ce512b5ef8982}
alpine_image=${CAPSULE_ALPINE_IMAGE:-alpine@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce}
probe="$build_dir/storage-probe-linux-arm64"

if [ ! -x "$probe" ]; then
    printf 'missing guest probe; run %s/build-guest-probe.sh first\n' "$experiment_dir" >&2
    exit 2
fi
mkdir -p "$build_dir"
for fixture in root.ext4 source.ext4 input.ext4 scratch-template.ext4; do
    if [ -e "$build_dir/$fixture" ]; then
        printf 'refusing to overwrite fixture: %s\n' "$build_dir/$fixture" >&2
        exit 2
    fi
done

fixture_tmp=$(mktemp -d "${TMPDIR:-/tmp}/capsule-storage-fixtures.XXXXXX")
container_name="capsule-storage-root-export-$$"
cleanup() {
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    rm -rf "$fixture_tmp"
}
trap cleanup EXIT INT TERM

mkdir -p "$fixture_tmp/root/capsule/source" "$fixture_tmp/root/capsule/input" \
    "$fixture_tmp/root/capsule/scratch" "$fixture_tmp/source" "$fixture_tmp/input" \
    "$fixture_tmp/scratch"
chmod 0755 "$fixture_tmp/root/capsule" "$fixture_tmp/root/capsule/source" \
    "$fixture_tmp/root/capsule/input" "$fixture_tmp/root/capsule/scratch"
chmod 0777 "$fixture_tmp/scratch"
printf 'export const value = "immutable-source";\n' > "$fixture_tmp/source/program.ts"
printf 'immutable-input-bytes\000with-binary\377\n' > "$fixture_tmp/input/data.bin"
chmod 0666 "$fixture_tmp/source/program.ts" "$fixture_tmp/input/data.bin"

container_id=$(docker create --name "$container_name" \
    --label io.capsule.spike=libkrun-storage "$alpine_image" /bin/true)
docker export "$container_id" | docker run --rm -i --network none --read-only \
    --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --memory 256m --cpus 1 \
    --tmpfs /work:rw,nosuid,nodev,noexec,size=128m \
    --mount "type=bind,src=$fixture_tmp,dst=/fixtures" \
    --mount "type=bind,src=$build_dir,dst=/output" \
    "$builder_image" sh -ceu '
        tar --no-same-owner -xf - -C /work
        install -D -m 0555 /output/storage-probe-linux-arm64 /work/usr/local/libexec/capsule-storage-probe
        mkdir -p /work/capsule/source /work/capsule/input /work/capsule/scratch
        mkdir -p /work/.fixture-source /work/.fixture-input /work/.fixture-scratch
        cp /fixtures/source/program.ts /work/.fixture-source/program.ts
        cp /fixtures/input/data.bin /work/.fixture-input/data.bin
        chmod 0666 /work/.fixture-source/program.ts /work/.fixture-input/data.bin
        chmod 0777 /work/.fixture-scratch
        truncate -s 8m /output/source.ext4
        /usr/sbin/mkfs.ext4 -q -F -d /work/.fixture-source /output/source.ext4
        truncate -s 8m /output/input.ext4
        /usr/sbin/mkfs.ext4 -q -F -d /work/.fixture-input /output/input.ext4
        truncate -s 12m /output/scratch-template.ext4
        /usr/sbin/mkfs.ext4 -q -F -d /work/.fixture-scratch /output/scratch-template.ext4
        /usr/sbin/debugfs -w -R "set_inode_field / mode 040777" /output/scratch-template.ext4 >/dev/null
        rm -rf /work/.fixture-source /work/.fixture-input /work/.fixture-scratch
        truncate -s 128m /output/root.ext4
        /usr/sbin/mkfs.ext4 -q -F -d /work /output/root.ext4
    '

chmod 0444 "$build_dir/root.ext4" "$build_dir/source.ext4" "$build_dir/input.ext4" \
    "$build_dir/scratch-template.ext4"
source_payload_sha=$(shasum -a 256 "$fixture_tmp/source/program.ts" | awk '{print $1}')
input_payload_sha=$(shasum -a 256 "$fixture_tmp/input/data.bin" | awk '{print $1}')
{
    printf 'builderImage=%s\n' "$builder_image"
    printf 'alpineImage=%s\n' "$alpine_image"
    printf 'rootSha256=%s\n' "$(shasum -a 256 "$build_dir/root.ext4" | awk '{print $1}')"
    printf 'sourceDiskSha256=%s\n' "$(shasum -a 256 "$build_dir/source.ext4" | awk '{print $1}')"
    printf 'sourcePayloadSha256=%s\n' "$source_payload_sha"
    printf 'inputDiskSha256=%s\n' "$(shasum -a 256 "$build_dir/input.ext4" | awk '{print $1}')"
    printf 'inputPayloadSha256=%s\n' "$input_payload_sha"
    printf 'scratchTemplateSha256=%s\n' "$(shasum -a 256 "$build_dir/scratch-template.ext4" | awk '{print $1}')"
    printf 'scratchBytes=%s\n' "$(stat -f %z "$build_dir/scratch-template.ext4")"
} > "$build_dir/fixtures.manifest"
cat "$build_dir/fixtures.manifest"
