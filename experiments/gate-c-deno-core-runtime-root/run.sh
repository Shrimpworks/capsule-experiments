#!/bin/sh
set -eu

if [ "$#" -ne 7 ]; then
  echo "usage: $0 BINARY SNAPSHOT LIBC6_DEB LIBGCC_DEB GCC_BASE_DEB STRACE_DEB WORK_DIR" >&2
  exit 2
fi

experiment=$(CDPATH='' cd -- "$(dirname "$0")" && pwd)
binary=$1
snapshot=$2
libc_deb=$3
libgcc_deb=$4
gcc_base_deb=$5
strace_deb=$6
work=$7

if [ -e "$work" ]; then
  echo "refusing to replace work directory: $work" >&2
  exit 1
fi
mkdir -p "$work"
work=$(CDPATH='' cd -- "$work" && pwd)

"$experiment/scripts/build-root.sh" "$binary" "$snapshot" "$libc_deb" \
  "$libgcc_deb" "$gcc_base_deb" "$work/build-a" build-a
"$experiment/scripts/build-root.sh" "$binary" "$snapshot" "$libc_deb" \
  "$libgcc_deb" "$gcc_base_deb" "$work/nested/path/build-b" build-b-relocated
cmp "$work/build-a/rootfs.tar" "$work/nested/path/build-b/rootfs.tar"
cmp "$work/build-a/rootfs.tar.gz" "$work/nested/path/build-b/rootfs.tar.gz"
"$experiment/scripts/test-root.sh" "$work/build-a" "$strace_deb" \
  "$work/mutations" "$work/evidence"
node "$experiment/generate-evidence.mjs" "$work/build-a" "$work/nested/path/build-b" \
  "$work/evidence" "$experiment/manifests/runtime-root-files.tsv"
printf 'runtimeRootExperiment=pass\nretainedOutput=%s\n' "$work/evidence"
