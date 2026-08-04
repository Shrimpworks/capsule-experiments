#!/bin/sh
set -eu

test "$(pwd)" = /workspace
test "${GOVERNED_NETWORK_MODE:-}" = none
test ! -e root-a
test ! -e root-b
test ! -e root-work
test -f out/build-a/bundle/bin/capsule-deno-core-physical-omission
test -f out/build-a/bundle/share/capsule-deno-core/capsule_core_snapshot.bin
if awk 'NR > 1 && $2 == "00000000" { found=1 } END { exit found ? 0 : 1 }' /proc/net/route; then
  echo "default route exists in network-disabled root build" >&2
  exit 1
fi

inputs=inputs/runtime
libc_deb=$inputs/libc6_2.36-9+deb12u14_arm64.deb
libgcc_deb=$inputs/libgcc-s1_12.2.0-14+deb12u1_arm64.deb
gcc_base_deb=$inputs/gcc-12-base_12.2.0-14+deb12u1_arm64.deb
test "$(sha256sum "$libc_deb" | awk '{print $1}')" = 01f4330719fd4f65580e16ea5a0527f372fca750e8f588d26deaf09f2d3b1cf4
test "$(sha256sum "$libgcc_deb" | awk '{print $1}')" = 576926b283613db80168ddf76380a3bd877602778cf0d226caa7bfbfa71eacf3
test "$(sha256sum "$gcc_base_deb" | awk '{print $1}')" = 674cf6cba6d432bd200c45fe866c1652c7a53523cc2e7a613e05bc4abf7b5440

build_one() {
  label=$1
  output=/workspace/root-$label
  mkdir -p "$output/extract/libc" "$output/extract/libgcc" "$output/extract/gcc-base"
  dpkg-deb -x "$libc_deb" "$output/extract/libc"
  dpkg-deb -x "$libgcc_deb" "$output/extract/libgcc"
  dpkg-deb -x "$gcc_base_deb" "$output/extract/gcc-base"
  root=$output/root
  mkdir -p "$root/bin" "$root/fixtures" "$root/lib/aarch64-linux-gnu" \
    "$root/share/capsule-deno-core" "$root/usr/share/doc/libc6" \
    "$root/usr/share/doc/gcc-12-base"
  install -m 0755 out/build-a/bundle/bin/capsule-deno-core-physical-omission \
    "$root/bin/capsule-deno-core-physical-omission"
  install -m 0644 out/build-a/bundle/share/capsule-deno-core/capsule_core_snapshot.bin \
    "$root/share/capsule-deno-core/capsule_core_snapshot.bin"
  install -m 0755 "$output/extract/libc/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1" \
    "$root/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1"
  install -m 0644 "$output/extract/libc/lib/aarch64-linux-gnu/libc.so.6" \
    "$root/lib/aarch64-linux-gnu/libc.so.6"
  install -m 0644 "$output/extract/libc/lib/aarch64-linux-gnu/libm.so.6" \
    "$root/lib/aarch64-linux-gnu/libm.so.6"
  install -m 0644 "$output/extract/libgcc/lib/aarch64-linux-gnu/libgcc_s.so.1" \
    "$root/lib/aarch64-linux-gnu/libgcc_s.so.1"
  ln -s aarch64-linux-gnu/ld-linux-aarch64.so.1 "$root/lib/ld-linux-aarch64.so.1"
  install -m 0644 fixtures/input.json "$root/fixtures/input.json"
  install -m 0644 fixtures/nominal.js "$root/fixtures/nominal.js"
  install -m 0644 "$output/extract/libc/usr/share/doc/libc6/copyright" \
    "$root/usr/share/doc/libc6/copyright"
  install -m 0644 "$output/extract/gcc-base/usr/share/doc/gcc-12-base/copyright" \
    "$root/usr/share/doc/gcc-12-base/copyright"
  find "$root" -exec touch -h -d @0 {} +
  /workspace/scripts/manifest-root.sh "$root" "$output/runtime-root-files.tsv"
  (
    cd "$root"
    tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner --format=posix \
      --pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime \
      -cf "$output/rootfs.tar" .
    gzip -n -9 < "$output/rootfs.tar" > "$output/rootfs.tar.gz"
  )
  rm -rf "$output/extract"
}

build_one a
build_one b
cmp root-a/runtime-root-files.tsv root-b/runtime-root-files.tsv
cmp root-a/rootfs.tar root-b/rootfs.tar
cmp root-a/rootfs.tar.gz root-b/rootfs.tar.gz
cp root-a/runtime-root-files.tsv out/runtime-root-files.tsv

regular_bytes=$(awk -F '\t' '$2 == "file" {sum += $6} END {print sum}' out/runtime-root-files.tsv)
test "$regular_bytes" -le 104857600
test "$(stat -c %s root-a/rootfs.tar)" -le 134217728
test "$(stat -c %s root-a/rootfs.tar.gz)" -le 67108864
printf 'root.entries=22\n'
printf 'root.regularFileBytes=%s\n' "$regular_bytes"
printf 'root.tar.size=%s\n' "$(stat -c %s root-a/rootfs.tar)"
printf 'root.tar.sha256=%s\n' "$(sha256sum root-a/rootfs.tar | awk '{print $1}')"
printf 'root.gzip.size=%s\n' "$(stat -c %s root-a/rootfs.tar.gz)"
printf 'root.gzip.sha256=%s\n' "$(sha256sum root-a/rootfs.tar.gz | awk '{print $1}')"
printf 'sameHostRootAB=byte-equal\n'
