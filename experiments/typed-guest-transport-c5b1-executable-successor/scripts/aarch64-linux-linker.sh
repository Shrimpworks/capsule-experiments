#!/bin/sh
set -eu
exec /opt/homebrew/opt/llvm/bin/clang --target=aarch64-unknown-linux-musl -fuse-ld=lld "$@"
