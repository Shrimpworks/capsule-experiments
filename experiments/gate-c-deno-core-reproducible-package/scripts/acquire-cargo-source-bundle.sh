#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: $0 DENO_CORE_CRATE EMPTY_OUTPUT_DIRECTORY" >&2
  exit 2
fi

experiment=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
physical=$(CDPATH='' cd -- "$experiment/../gate-c-deno-core-physical-omission" && pwd)
core_crate=$1
output=$2
builder=rust:1.95.0-bookworm@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1
expected=912ee37b7735efc7412abf9a34c66ecf970fc8335f14d6b21202a0c7964df58c

test "$(shasum -a 256 "$core_crate" | awk '{print $1}')" = \
  16b44f6f84139c39ec2f8d1b838412eb84ecaa9837103f7b12169896fd8778b4

if [ -e "$output" ]; then
  echo "refusing to replace output: $output" >&2
  exit 1
fi
mkdir -p "$output/tmp"
output=$(CDPATH='' cd -- "$output" && pwd)

# Acquisition may contact only Cargo's configured registry. Cargo.lock supplies
# every accepted package version and checksum. Retained builds never run this
# phase and have no network.
docker run --rm --platform linux/arm64 --read-only \
  --cap-drop ALL --security-opt no-new-privileges --memory 2g --cpus 2 \
  -e CARGO_HOME=/out/cargo-home -e TMPDIR=/out/tmp \
  -v "$physical:/physical:ro" -v "$core_crate:/inputs/deno_core.crate:ro" \
  -v "$output:/out" --entrypoint /bin/sh "$builder" -c '
    set -eu
    mkdir -p /out/workspace/.work
    cp -a /physical/probe /out/workspace/probe
    tar -xzf /inputs/deno_core.crate -C /out/workspace/.work
    git apply --unsafe-paths --directory=/out/workspace/.work/deno_core-0.409.0 \
      /physical/patches/0001-physically-allowlist-bootstrap-ops.patch
    git apply --unsafe-paths --directory=/out/workspace/.work/deno_core-0.409.0 \
      /physical/patches/0002-canonicalize-snapshot-module-order.patch
    cd /out/workspace/probe
    cargo fetch --locked
    cargo vendor --locked --offline --versioned-dirs /out/vendor
  '

docker run --rm --platform linux/arm64 --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges \
  -e TZ=UTC -e LC_ALL=C -e LANG=C \
  -v "$output/vendor:/input/vendor:ro" -v "$output:/out" \
  -w /input --entrypoint /bin/sh "$builder" \
  -c 'tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner --format=posix --pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime -cf - vendor | gzip -n -9 > /out/cargo-source-bundle.tar.gz'

actual=$(sha256sum "$output/cargo-source-bundle.tar.gz" | awk '{print $1}')
test "$actual" = "$expected"
test "$(find "$output/vendor" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')" = 191
printf 'cargoSourceBundle.sha256=%s\ncargoSourceBundle.packages=191\n' "$actual"
