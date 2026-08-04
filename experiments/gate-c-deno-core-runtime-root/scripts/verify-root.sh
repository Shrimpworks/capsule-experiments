#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: $0 ROOT EXPECTED_MANIFEST_TSV" >&2
  exit 2
fi

root=$1
expected=$2
cap=22

test -d "$root"
test -f "$expected"
observed=$(mktemp "${TMPDIR:-/tmp}/capsule-deno-root-manifest.XXXXXX")
trap 'rm -f "$observed"' EXIT

printf 'path\ttype\tmode\tuid\tgid\tsize\tsha256\tlinkTarget\n' >"$observed"
(
  cd "$root"
  find . -mindepth 1 -print | LC_ALL=C sort | while IFS= read -r path; do
    clean=${path#./}
    mode=$(stat -c %a "$path")
    uid=$(stat -c %u "$path")
    gid=$(stat -c %g "$path")
    if [ -L "$path" ]; then
      type=symlink
      size=$(stat -c %s "$path")
      target=$(readlink "$path")
      digest=$(printf %s "$target" | sha256sum | awk '{print $1}')
    elif [ -d "$path" ]; then
      type=directory
      size=-
      target=-
      digest=-
    elif [ -f "$path" ]; then
      type=file
      size=$(stat -c %s "$path")
      target=-
      digest=$(sha256sum "$path" | awk '{print $1}')
    else
      echo "unsupported root entry: $clean" >&2
      exit 1
    fi
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$clean" "$type" "$mode" "$uid" "$gid" "$size" "$digest" "$target"
  done
) >>"$observed"

entries=$(($(wc -l <"$observed") - 1))
test "$entries" -eq "$cap" || {
  echo "runtime-root manifest entry cap mismatch: observed=$entries cap=$cap" >&2
  exit 1
}
cmp "$expected" "$observed"
printf 'runtimeRootManifest.entries=%s\nruntimeRootManifest.cap=%s\n' "$entries" "$cap"
