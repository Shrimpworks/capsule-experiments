#!/bin/sh
set -eu

if [ "$#" -ne 3 ]; then
  echo "usage: $0 {prepare|build|test|all} DENO_STAGE RUNTIME_INPUT_DIRECTORY" >&2
  exit 2
fi

mode=$1
stage=$(CDPATH='' cd -- "$2" && pwd)
runtime_inputs=$(CDPATH='' cd -- "$3" && pwd)
experiment=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
builder='rust:1.95.0-bookworm@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1'

case "$stage" in
  /private/tmp/capsule-fork-native-deno-*) ;;
  *) echo "unexpected Deno stage path" >&2; exit 1 ;;
esac

prepare() {
  test -d "$stage/out/build-a"
  test ! -e "$stage/inputs/runtime"
  test ! -e "$stage/root-a"
  test ! -e "$stage/root-b"
  mkdir -p "$stage/inputs/runtime"
  for name in \
    libc6_2.36-9+deb12u14_arm64.deb \
    libgcc-s1_12.2.0-14+deb12u1_arm64.deb \
    gcc-12-base_12.2.0-14+deb12u1_arm64.deb \
    strace_6.1-0.1_arm64.deb \
    glibc_2.36-9+deb12u14.dsc \
    glibc_2.36.orig.tar.xz \
    glibc_2.36-9+deb12u14.debian.tar.xz \
    gcc-12_12.2.0-14+deb12u1.dsc \
    gcc-12_12.2.0.orig.tar.gz \
    gcc-12_12.2.0-14+deb12u1.debian.tar.xz
  do
    cp "$runtime_inputs/$name" "$stage/inputs/runtime/$name"
  done
  cp "$experiment/builder/manifest-root.sh" "$stage/scripts/manifest-root.sh"
  cp "$experiment/builder/build-root-offline.sh" "$stage/scripts/build-root-offline.sh"
  cp "$experiment/builder/test-root-mutations.sh" "$stage/scripts/test-root-mutations.sh"
  cp "$experiment/../gate-c-deno-core-runtime-root/scripts/analyze-trace.mjs" \
    "$stage/scripts/analyze-trace.mjs"
  chmod 0755 "$stage/scripts/"*.sh
}

build() {
  test -d "$stage/inputs/runtime"
  docker run --rm --platform linux/arm64 --network none --read-only \
    --cap-drop ALL --security-opt no-new-privileges --memory 4g --cpus 2 \
    --tmpfs /tmp:rw,nosuid,nodev -e GOVERNED_NETWORK_MODE=none \
    -v "$stage:/workspace" -w /workspace "$builder" \
    sh scripts/build-root-offline.sh
}

test_root() {
  test -f "$stage/root-a/rootfs.tar"
  image=$(docker import --platform linux/arm64 "$stage/root-a/rootfs.tar")
  mutated_image=
  cleanup() {
    docker image rm "$image" >/dev/null 2>&1 || true
    if [ -n "$mutated_image" ]; then docker image rm "$mutated_image" >/dev/null 2>&1 || true; fi
  }
  trap cleanup EXIT
  test "$(docker image inspect "$image" --format '{{json .Config}}')" = '{}'
  nominal=$(docker run --rm --platform linux/arm64 --network none --read-only \
    --cap-drop ALL --security-opt no-new-privileges --pids-limit 32 \
    --memory 512m --cpus 1 --entrypoint /lib/ld-linux-aarch64.so.1 "$image" \
    --inhibit-cache --library-path /lib/aarch64-linux-gnu \
    /bin/capsule-deno-core-physical-omission \
    --source /fixtures/nominal.js --input /fixtures/input.json)
  test "$nominal" = '{"count":3,"label":"capsule-owned","sum":6}'

  mutated_image=$(docker import --platform linux/arm64 \
    --change 'ENV LD_PRELOAD=/capsule/forbidden.so' "$stage/root-a/rootfs.tar")
  test "$(docker image inspect "$mutated_image" --format '{{json .Config.Env}}')" = \
    '["LD_PRELOAD=/capsule/forbidden.so"]'

  docker run --rm --platform linux/arm64 --network none --read-only \
    --cap-drop ALL --security-opt no-new-privileges --memory 2g --cpus 1 \
    --tmpfs /tmp:rw,nosuid,nodev -e GOVERNED_NETWORK_MODE=none \
    -v "$stage:/workspace" -w /workspace "$builder" \
    sh scripts/test-root-mutations.sh

  docker run --rm --platform linux/arm64 --network none --read-only \
    --cap-drop ALL --security-opt no-new-privileges --security-opt seccomp=unconfined \
    --pids-limit 32 --memory 512m --cpus 1 --tmpfs /tmp:rw,noexec,nosuid,nodev \
    -v "$stage:/workspace" -v "$stage/root-a/root:/candidate:ro" \
    --entrypoint /usr/bin/env "$builder" -i \
    /workspace/root-work/tracer/usr/bin/strace -f -yy -s 256 \
    -e 'trace=%file,%process,%network,mmap,mprotect,seccomp,setrlimit,prctl' \
    -o /workspace/out/file-open.trace /candidate/lib/ld-linux-aarch64.so.1 \
    --inhibit-cache --library-path /candidate/lib/aarch64-linux-gnu \
    /candidate/bin/capsule-deno-core-physical-omission \
    --source /candidate/fixtures/nominal.js --input /candidate/fixtures/input.json \
    >/dev/null
  node "$stage/scripts/analyze-trace.mjs" "$stage/out/file-open.trace" \
    "$stage/out/file-open-summary.json"
  printf 'scratchRootNominal=pass\n'
  printf 'callerEnvironmentMutation=refused-before-execution\n'
  printf 'loaderFileOpenClosure=pass\n'
}

case "$mode" in
  prepare) prepare ;;
  build) build ;;
  test) test_root ;;
  all) prepare; build; test_root ;;
  *) echo "usage: $0 {prepare|build|test|all} DENO_STAGE RUNTIME_INPUT_DIRECTORY" >&2; exit 2 ;;
esac
