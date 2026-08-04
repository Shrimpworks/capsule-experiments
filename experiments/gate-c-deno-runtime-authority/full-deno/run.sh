#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: $0 /absolute/path/to/exact/linux-arm64/deno" >&2
  exit 2
fi

deno_binary=$1
expected=7d87b8a5225485ddea1786024f875b2b3422c31100ba11cb2e36b6125959e218
actual=$(shasum -a 256 "$deno_binary" | awk '{print $1}')
if [ "$actual" != "$expected" ]; then
  echo "Deno binary mismatch: expected $expected, got $actual" >&2
  exit 1
fi

experiment=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
fixtures="$experiment/fixtures"
image=capsule-deno-measure:2026-08-02

run_deno() {
  fixture=$1
  shift
  docker run --rm \
    --platform linux/arm64 \
    --network none \
    --read-only \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --pids-limit 64 \
    --memory 256m \
    --cpus 1 \
    --user 65534:65534 \
    --workdir /empty \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16m \
    --tmpfs /state:rw,noexec,nosuid,nodev,size=16m \
    --mount "type=bind,src=$deno_binary,dst=/opt/deno,readonly" \
    --mount "type=bind,src=$fixtures,dst=/fixtures,readonly" \
    --entrypoint /usr/bin/env \
    "$image" -i HOME=/state DENO_DIR=/state/deno NO_COLOR=1 \
    DENO_CACHE_DB_MODE=memory DENO_KV_DB_MODE=memory \
    DENO_NO_PACKAGE_JSON=1 DENO_NO_PROMPT=1 DENO_NO_UPDATE_CHECK=1 \
    /opt/deno run \
      --no-config --no-lock --no-npm --no-remote --cached-only \
      --node-modules-dir=none --no-code-cache --no-prompt \
      --deny-read --deny-write --deny-net --deny-env --deny-sys \
      --deny-run --deny-ffi --deny-import \
      "$@" "/fixtures/$fixture"
}

run_deno full-deno-authority.ts
run_deno full-deno-node.ts
run_deno full-deno-import-routes.ts
run_deno full-deno-blob-worker.ts
run_deno full-deno-static-entry.ts
run_deno full-deno-sigusr1-inspector.ts

inherited_command='exec 9</fixtures/dot-env
exec /usr/bin/env -i \
  HOME=/state \
  DENO_DIR=/state/deno \
  NO_COLOR=1 \
  DENO_CACHE_DB_MODE=memory \
  DENO_KV_DB_MODE=memory \
  DENO_NO_PACKAGE_JSON=1 \
  DENO_NO_PROMPT=1 \
  DENO_NO_UPDATE_CHECK=1 \
  /opt/deno run \
    --no-config --no-lock --no-npm --no-remote --cached-only \
    --node-modules-dir=none --no-code-cache --no-prompt \
    --deny-read --deny-write --deny-net --deny-env --deny-sys \
    --deny-run --deny-ffi --deny-import \
    /fixtures/full-deno-inherited-fd.ts'

docker run --rm \
  --platform linux/arm64 \
  --network none \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 64 \
  --memory 256m \
  --cpus 1 \
  --user 65534:65534 \
  --workdir /empty \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16m \
  --tmpfs /state:rw,noexec,nosuid,nodev,size=16m \
  --mount "type=bind,src=$deno_binary,dst=/opt/deno,readonly" \
  --mount "type=bind,src=$fixtures,dst=/fixtures,readonly" \
  --entrypoint /bin/sh \
  "$image" -c "$inherited_command"
