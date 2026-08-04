#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: $0 ROOT OUTPUT_MANIFEST" >&2
  exit 2
fi

root=$1
output=$2
test -d "$root"
test ! -e "$output"

printf 'path\ttype\tmode\tuid\tgid\tsize\tsha256\tlinkTarget\n' > "$output"
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
      type='file'
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
) >> "$output"

entries=$(($(wc -l < "$output") - 1))
test "$entries" -eq 22
printf 'runtimeRootManifest.entries=%s\n' "$entries"
printf 'runtimeRootManifest.cap=22\n'
