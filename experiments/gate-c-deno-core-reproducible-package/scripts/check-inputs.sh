#!/bin/sh
set -eu

if [ "$#" -ne 4 ]; then
  echo "usage: $0 DENO_CORE_CRATE DENO_SOURCE_ARCHIVE RUSTY_V8_ARCHIVE CARGO_SOURCE_BUNDLE" >&2
  exit 2
fi

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

check() {
  path=$1
  expected=$2
  actual=$(sha256 "$path")
  if [ "$actual" != "$expected" ]; then
    echo "sha256 mismatch for $path: expected $expected, got $actual" >&2
    exit 1
  fi
}

check "$1" 16b44f6f84139c39ec2f8d1b838412eb84ecaa9837103f7b12169896fd8778b4
check "$2" 95f9d8361809f2d2f3ee2d8a6955951dcf96c2f4bbeb540c2d6fdd9363e6dc94
check "$3" 8d91df74c8a671c23f880e64038023f49e07ca85c96e15d76a87e2aac9b20595
check "$4" 912ee37b7735efc7412abf9a34c66ecf970fc8335f14d6b21202a0c7964df58c

echo "exact deno_core, Deno, rusty_v8, and 191-crate source-bundle inputs verified"
