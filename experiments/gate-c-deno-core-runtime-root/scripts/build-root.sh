#!/bin/sh
set -eu

if [ "$#" -ne 7 ]; then
  echo "usage: $0 BINARY SNAPSHOT LIBC6_DEB LIBGCC_DEB GCC_BASE_DEB OUTPUT_DIR LABEL" >&2
  exit 2
fi

binary=$1
snapshot=$2
libc_deb=$3
libgcc_deb=$4
gcc_base_deb=$5
output=$6
label=$7
experiment=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
physical=$(CDPATH='' cd -- "$experiment/../gate-c-deno-core-physical-omission" && pwd)
builder='rust:1.95.0-bookworm@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1'

test "$(sha256sum "$binary" | awk '{print $1}')" = 597baba6b9f50fc619ce667a352e19686f8c73efc6819d137b3c4081450fd6f5
test "$(sha256sum "$snapshot" | awk '{print $1}')" = ef5f1e7883bbf62a6422957ff0eea51a06d4b35cad1f47dc9c9ae137ab8dfa0b
test "$(sha256sum "$libc_deb" | awk '{print $1}')" = 01f4330719fd4f65580e16ea5a0527f372fca750e8f588d26deaf09f2d3b1cf4
test "$(sha256sum "$libgcc_deb" | awk '{print $1}')" = 576926b283613db80168ddf76380a3bd877602778cf0d226caa7bfbfa71eacf3
test "$(sha256sum "$gcc_base_deb" | awk '{print $1}')" = 674cf6cba6d432bd200c45fe866c1652c7a53523cc2e7a613e05bc4abf7b5440

if [ -e "$output" ]; then
  echo "refusing to replace output directory: $output" >&2
  exit 1
fi
mkdir -p "$output"
output=$(CDPATH='' cd -- "$output" && pwd)

docker run --rm --platform linux/arm64 --network none --cap-drop ALL \
  --security-opt no-new-privileges:true --tmpfs /tmp:rw,nosuid,nodev \
  -v "$output:/out" -v "$binary:/inputs/candidate:ro" \
  -v "$snapshot:/inputs/snapshot:ro" -v "$libc_deb:/inputs/libc6.deb:ro" \
  -v "$libgcc_deb:/inputs/libgcc.deb:ro" -v "$gcc_base_deb:/inputs/gcc-base.deb:ro" \
  -v "$physical/fixtures:/fixtures:ro" -v "$experiment:/experiment:ro" \
  --entrypoint /bin/sh "$builder" -ceu '
    mkdir -p /out/extract/libc /out/extract/libgcc /out/extract/gcc-base
    dpkg-deb -x /inputs/libc6.deb /out/extract/libc
    dpkg-deb -x /inputs/libgcc.deb /out/extract/libgcc
    dpkg-deb -x /inputs/gcc-base.deb /out/extract/gcc-base
    root=/out/root
    mkdir -p "$root/bin" "$root/fixtures" "$root/lib/aarch64-linux-gnu" \
      "$root/share/capsule-deno-core" "$root/usr/share/doc/libc6" \
      "$root/usr/share/doc/gcc-12-base"
    install -m 0755 /inputs/candidate "$root/bin/capsule-deno-core-physical-omission"
    install -m 0644 /inputs/snapshot "$root/share/capsule-deno-core/capsule_core_snapshot.bin"
    install -m 0755 /out/extract/libc/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1 \
      "$root/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1"
    install -m 0644 /out/extract/libc/lib/aarch64-linux-gnu/libc.so.6 \
      "$root/lib/aarch64-linux-gnu/libc.so.6"
    install -m 0644 /out/extract/libc/lib/aarch64-linux-gnu/libm.so.6 \
      "$root/lib/aarch64-linux-gnu/libm.so.6"
    install -m 0644 /out/extract/libgcc/lib/aarch64-linux-gnu/libgcc_s.so.1 \
      "$root/lib/aarch64-linux-gnu/libgcc_s.so.1"
    ln -s aarch64-linux-gnu/ld-linux-aarch64.so.1 "$root/lib/ld-linux-aarch64.so.1"
    install -m 0644 /fixtures/input.json "$root/fixtures/input.json"
    install -m 0644 /fixtures/nominal.js "$root/fixtures/nominal.js"
    install -m 0644 /out/extract/libc/usr/share/doc/libc6/copyright \
      "$root/usr/share/doc/libc6/copyright"
    install -m 0644 /out/extract/gcc-base/usr/share/doc/gcc-12-base/copyright \
      "$root/usr/share/doc/gcc-12-base/copyright"
    find "$root" -exec touch -h -d @0 {} +
    /experiment/scripts/verify-root.sh "$root" /experiment/manifests/runtime-root-files.tsv \
      > /out/manifest-verification.txt
    cd "$root"
    tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner --format=posix \
      --pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime \
      -cf /out/rootfs.tar .
    gzip -n -9 < /out/rootfs.tar > /out/rootfs.tar.gz
  '

rm -rf "$output/extract"
printf 'construction.label=%s\n' "$label"
printf 'rootfs.tar.size=%s\n' "$(wc -c <"$output/rootfs.tar" | tr -d ' ')"
printf 'rootfs.tar.sha256=%s\n' "$(sha256sum "$output/rootfs.tar" | awk '{print $1}')"
printf 'rootfs.tar.gz.size=%s\n' "$(wc -c <"$output/rootfs.tar.gz" | tr -d ' ')"
printf 'rootfs.tar.gz.sha256=%s\n' "$(sha256sum "$output/rootfs.tar.gz" | awk '{print $1}')"
