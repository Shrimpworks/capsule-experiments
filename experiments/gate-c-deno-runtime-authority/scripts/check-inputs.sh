#!/bin/sh
set -eu

if [ "$#" -ne 3 ]; then
  echo "usage: $0 DENO_BINARY DENO_SOURCE_ARCHIVE RUSTY_V8_ARCHIVE" >&2
  exit 2
fi

deno_binary=$1
deno_source=$2
v8_archive=$3

check_sha256() {
  file=$1
  expected=$2
  actual=$(shasum -a 256 "$file" | awk '{print $1}')
  if [ "$actual" != "$expected" ]; then
    echo "sha256 mismatch for $file: expected $expected, got $actual" >&2
    exit 1
  fi
}

check_sha256 "$deno_binary" 7d87b8a5225485ddea1786024f875b2b3422c31100ba11cb2e36b6125959e218
check_sha256 "$deno_source" 95f9d8361809f2d2f3ee2d8a6955951dcf96c2f4bbeb540c2d6fdd9363e6dc94
check_sha256 "$v8_archive" 8d91df74c8a671c23f880e64038023f49e07ca85c96e15d76a87e2aac9b20595

echo "exact Deno v2.9.4, source, and V8 inputs verified"
