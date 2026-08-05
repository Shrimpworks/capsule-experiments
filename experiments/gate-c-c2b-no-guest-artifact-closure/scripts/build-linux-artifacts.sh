#!/bin/sh
set -eu

test "$(pwd)" = /workspace
test "${CAPSULE_BUILD_NETWORK_MODE:-}" = none
test ! -e target-linux
test ! -e out/linux

if awk 'NR > 1 && $2 == "00000000" { found=1 } END { exit found ? 0 : 1 }' /proc/net/route; then
  echo "default route exists in network-disabled builder" >&2
  exit 1
fi

export CARGO_HOME=/workspace/cargo-home-linux
export CARGO_NET_OFFLINE=true
export CARGO_TARGET_DIR=/workspace/target-linux
export SOURCE_DATE_EPOCH=0
export TZ=UTC
export LC_ALL=C
export LANG=C
export RUSTFLAGS='-Ctarget-feature=+crt-static -Cdebuginfo=0 -Clink-arg=-Wl,--build-id=none --remap-path-prefix=/workspace/harness=/usr/src/capsule-c2b-no-guest-artifact-closure'
unset SCCACHE CCACHE RUSTC_WRAPPER
mkdir -p "$CARGO_HOME" out/linux/evidence

cargo build \
  --manifest-path harness/Cargo.toml \
  --release \
  --locked \
  --offline

install -m 0755 \
  target-linux/release/capsule-init-krun \
  out/linux/capsule-init.krun
install -m 0755 \
  target-linux/release/capsule-launcher \
  out/linux/capsule-launcher

for binary in out/linux/capsule-init.krun out/linux/capsule-launcher; do
  file "$binary"
  readelf -h -l -d -n "$binary"
  if readelf -d "$binary" | grep -q '(NEEDED)'; then
    echo "trusted guest artifact is dynamically linked: $binary" >&2
    exit 1
  fi
done > out/linux/evidence/elf.txt

mkdir -p root-input
dpkg-deb -x inputs/root/libc6_2.36-9+deb12u14_arm64.deb root-input
dpkg-deb -x inputs/root/libgcc-s1_12.2.0-14+deb12u1_arm64.deb root-input

root=out/linux/root
mkdir -p \
  "$root/dev" \
  "$root/proc" \
  "$root/tmp" \
  "$root/lib/aarch64-linux-gnu" \
  "$root/usr/local/bin" \
  "$root/usr/local/libexec" \
  "$root/usr/local/share/capsule-deno-core"
install -m 0755 out/linux/capsule-init.krun \
  "$root/usr/local/libexec/capsule-init.krun"
install -m 0755 out/linux/capsule-launcher \
  "$root/usr/local/libexec/capsule-launcher"
install -m 0755 inputs/runtime/capsule-deno-core-c2b-fixed-fixture \
  "$root/usr/local/bin/capsule-deno-core-c2b-fixed-fixture"
install -m 0644 inputs/runtime/capsule_core_snapshot.bin \
  "$root/usr/local/share/capsule-deno-core/capsule_core_snapshot.bin"
install -m 0755 root-input/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1 \
  "$root/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1"
install -m 0755 root-input/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1 \
  "$root/lib/ld-linux-aarch64.so.1"
install -m 0644 root-input/lib/aarch64-linux-gnu/libc.so.6 \
  "$root/lib/aarch64-linux-gnu/libc.so.6"
install -m 0644 root-input/lib/aarch64-linux-gnu/libm.so.6 \
  "$root/lib/aarch64-linux-gnu/libm.so.6"
install -m 0644 root-input/lib/aarch64-linux-gnu/libgcc_s.so.1 \
  "$root/lib/aarch64-linux-gnu/libgcc_s.so.1"
chmod 0555 "$root/tmp"
find "$root" -exec touch -h -d @0 {} +

(
  cd "$root"
  find . -mindepth 1 -print | LC_ALL=C sort | while IFS= read -r path; do
    if test -f "$path"; then
      printf 'file\t%s\t%s\t%s\t%s\n' \
        "$(stat -c %a "$path")" \
        "$(stat -c %s "$path")" \
        "$(sha256sum "$path" | awk '{print $1}')" \
        "$path"
    elif test -d "$path"; then
      printf 'directory\t%s\t0\t-\t%s\n' "$(stat -c %a "$path")" "$path"
    else
      echo "unexpected root entry type: $path" >&2
      exit 1
    fi
  done > ../runtime-root-files.tsv
)

export E2FSPROGS_FAKE_TIME=946684800
truncate -s 134217728 out/linux/capsule-c2b-runtime-root.ext4
mke2fs -F -q \
  -t ext4 \
  -b 4096 \
  -m 0 \
  -L CAPSULE_C2B_V1 \
  -U c2b00000-0000-4000-8000-000000000001 \
  -O '^has_journal,^dir_index,^orphan_file' \
  -E 'root_owner=0:0,lazy_itable_init=0,lazy_journal_init=0,hash_seed=c2b00000-0000-4000-8000-000000000001' \
  -d "$root" \
  out/linux/capsule-c2b-runtime-root.ext4
debugfs -w -R 'set_inode_field / ctime 946684800' \
  out/linux/capsule-c2b-runtime-root.ext4 \
  > out/linux/evidence/ext4-deterministic-inodes.txt 2>&1
while IFS="$(printf '\t')" read -r kind mode size digest path; do
  test -n "$kind"
  image_path=${path#.}
  debugfs -w -R "set_inode_field $image_path ctime 946684800" \
    out/linux/capsule-c2b-runtime-root.ext4 \
    >> out/linux/evidence/ext4-deterministic-inodes.txt 2>&1
done < out/linux/runtime-root-files.tsv
e2fsck -fn out/linux/capsule-c2b-runtime-root.ext4 \
  > out/linux/evidence/e2fsck.txt 2>&1
dumpe2fs -h out/linux/capsule-c2b-runtime-root.ext4 \
  > out/linux/evidence/ext4-superblock.txt 2>&1
debugfs -R 'ls -l -p /usr/local/libexec' \
  out/linux/capsule-c2b-runtime-root.ext4 \
  > out/linux/evidence/ext4-libexec.txt 2>&1
debugfs -R 'ls -l -p /usr/local/bin' \
  out/linux/capsule-c2b-runtime-root.ext4 \
  > out/linux/evidence/ext4-bin.txt 2>&1

if grep -q 'has_journal' out/linux/evidence/ext4-superblock.txt; then
  echo "raw root unexpectedly has a journal" >&2
  exit 1
fi
for forbidden in bin sbin etc var home root opt; do
  if test -e "$root/$forbidden"; then
    echo "forbidden general-purpose root entry present: /$forbidden" >&2
    exit 1
  fi
done

(
  cd out/linux
  find . -maxdepth 1 -type f ! -name SHA256SUMS -print \
    | LC_ALL=C sort \
    | while IFS= read -r file; do
        printf '%s  %s\n' "$(sha256sum "$file" | awk '{print $1}')" "$file"
      done > SHA256SUMS
)
