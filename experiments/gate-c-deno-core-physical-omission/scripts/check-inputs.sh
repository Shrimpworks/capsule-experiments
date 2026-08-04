#!/bin/sh
set -eu

if [ "$#" -ne 3 ]; then
  echo "usage: $0 DENO_CORE_CRATE DENO_SOURCE_ARCHIVE RUSTY_V8_ARCHIVE" >&2
  exit 2
fi

core_crate=$1
deno_source=$2
v8_archive=$3

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

check_sha256() {
  file=$1
  expected=$2
  actual=$(sha256 "$file")
  if [ "$actual" != "$expected" ]; then
    echo "sha256 mismatch for $file: expected $expected, got $actual" >&2
    exit 1
  fi
}

check_sha256 "$core_crate" 16b44f6f84139c39ec2f8d1b838412eb84ecaa9837103f7b12169896fd8778b4
check_sha256 "$deno_source" 95f9d8361809f2d2f3ee2d8a6955951dcf96c2f4bbeb540c2d6fdd9363e6dc94
check_sha256 "$v8_archive" 8d91df74c8a671c23f880e64038023f49e07ca85c96e15d76a87e2aac9b20595

echo "exact deno_core 0.409.0, Deno v2.9.4 source, and rusty_v8 150.2.0 inputs verified"
