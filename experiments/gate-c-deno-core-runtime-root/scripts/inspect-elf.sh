#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: $0 BINARY ROOT" >&2
  exit 2
fi

binary=$1
root=$2
for subject in \
  "$binary" \
  "$root/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1" \
  "$root/lib/aarch64-linux-gnu/libc.so.6" \
  "$root/lib/aarch64-linux-gnu/libgcc_s.so.1" \
  "$root/lib/aarch64-linux-gnu/libm.so.6"
do
  printf '\n===== %s =====\n' "${subject##*/}"
  readelf -h -l -d -V "$subject"
done
