#!/bin/sh
set -eu

if [ "$#" -ne 3 ]; then
  echo "usage: $0 ACTIVE_RECORD IDENTITY_HELPER OUTPUT_DIRECTORY" >&2
  exit 64
fi
active=$1
identity_helper=$2
output=$3
test -s "$active"
test -x "$identity_helper"
mkdir -p "$output"
timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
pid=$(plutil -extract identity.pid raw -o - "$active")
cp "$active" "$output/active-$timestamp.json"
"$identity_helper" "$pid" > "$output/identity-$timestamp.txt"
sysctl kern.boottime > "$output/boot-$timestamp.txt"
id > "$output/session-$timestamp.txt"
stat -f 'path=%N device=%d inode=%i mode=%Lp size=%z mtime=%m' \
  "$(plutil -extract identity.path raw -o - "$active")" \
  > "$output/path-$timestamp.txt"
pmset -g assertions > "$output/power-assertions-$timestamp.txt"
pmset -g batt > "$output/power-source-$timestamp.txt"
printf 'manualStateCollection=PASS timestamp=%s pid=%s output=%s\n' "$timestamp" "$pid" "$output"
