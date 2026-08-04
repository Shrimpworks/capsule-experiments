#!/bin/bash
set -euo pipefail

# DEVELOPMENT-ONLY baseline builder for the exact retained Bun source. This
# compiles and runs only Capsule's owned fixture. It is not an isolation backend.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXPERIMENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_DIR="${1:-/private/tmp/capsule-gate-c-p0-0-bun-src-network}"
EXPECTED_COMMIT='0d9b296af33f2b851fcbf4df3e9ec89751734ba4'
BASE_IMAGE='docker.io/nixos/nix@sha256:377d4887aca98f0dfa12971c1ea6d6a625a435d8b610d4c95a436843da6fbfd1'
BUILDER_IMAGE='capsule-gate-c-p0-0-bun-builder:nix-2.35.1-arm64'
STORE_VOLUME='capsule-gate-c-p0-0-nix-store-v1'
BUILD_CACHE_VOLUME='capsule-gate-c-p0-0-bun-build-cache-v1'
COMPILER_CACHE_VOLUME='capsule-gate-c-p0-0-compiler-cache-v1'
BUILD_JOBS="${CAPSULE_BUILD_JOBS:-4}"
RUN_ID="${CAPSULE_RESUME_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
RUN_DIR="$EXPERIMENT_DIR/.runs/$RUN_ID"
WORK_DIR="$RUN_DIR/bun"
BUILD_LOG="$RUN_DIR/build.log"
SUMMARY_LOG="$RUN_DIR/summary.txt"

fail() {
  printf 'BLOCKED: %s\n' "$*" >&2
  exit 2
}

[[ "$(uname -s)" == 'Darwin' || "$(uname -s)" == 'Linux' ]] || \
  fail 'this development harness supports Docker hosts on macOS or Linux only'
[[ "$BUILD_JOBS" =~ ^[1-9][0-9]*$ ]] || fail 'CAPSULE_BUILD_JOBS must be a positive integer'
[[ "$RUN_ID" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9]+$ ]] || \
  fail 'CAPSULE_RESUME_RUN_ID has an invalid task-run format'
command -v docker >/dev/null 2>&1 || fail 'docker client is absent'
command -v git >/dev/null 2>&1 || fail 'git client is absent'
[[ -d "$SOURCE_DIR/.git" ]] || fail "exact retained source is absent: $SOURCE_DIR"

ACTUAL_COMMIT="$(git -C "$SOURCE_DIR" rev-parse HEAD)"
[[ "$ACTUAL_COMMIT" == "$EXPECTED_COMMIT" ]] || \
  fail "source commit is $ACTUAL_COMMIT, expected $EXPECTED_COMMIT"
[[ -z "$(git -C "$SOURCE_DIR" status --porcelain)" ]] || fail 'retained source checkout is dirty'
[[ "$(git -C "$SOURCE_DIR" describe --tags --exact-match)" == 'bun-v1.3.14' ]] || \
  fail 'retained source is not exactly tagged bun-v1.3.14'

docker info >/dev/null 2>&1 || fail 'Docker daemon is unavailable'
[[ "$(docker info --format '{{.OSType}}/{{.Architecture}}')" == 'linux/aarch64' ]] || \
  fail 'this evidence recipe requires a Linux/arm64 Docker daemon'
docker image inspect "$BASE_IMAGE" >/dev/null 2>&1 || {
  printf 'BLOCKED: pinned Nix base image is not cached: %s\n' "$BASE_IMAGE" >&2
  printf 'Fetch it deliberately with: docker pull %s\n' "$BASE_IMAGE" >&2
  exit 2
}

mkdir -p "$RUN_DIR"
if [[ -d "$WORK_DIR/.git" ]]; then
  [[ "$(git -C "$WORK_DIR" rev-parse HEAD)" == "$EXPECTED_COMMIT" ]] || \
    fail 'resumed build checkout has the wrong commit'
  git -C "$WORK_DIR" diff --quiet || fail 'resumed build checkout has tracked source changes'
else
  git clone --shared --no-checkout "$SOURCE_DIR" "$WORK_DIR" >"$RUN_DIR/clone.log" 2>&1
  git -C "$WORK_DIR" checkout --detach "$EXPECTED_COMMIT" >>"$RUN_DIR/clone.log" 2>&1
fi

if ! docker volume inspect "$STORE_VOLUME" >/dev/null 2>&1; then
  docker volume create --label io.capsule.spike=gate-c-p0-0 "$STORE_VOLUME" >/dev/null
fi
if ! docker volume inspect "$BUILD_CACHE_VOLUME" >/dev/null 2>&1; then
  docker volume create --label io.capsule.spike=gate-c-p0-0 "$BUILD_CACHE_VOLUME" >/dev/null
fi
if ! docker volume inspect "$COMPILER_CACHE_VOLUME" >/dev/null 2>&1; then
  docker volume create --label io.capsule.spike=gate-c-p0-0 "$COMPILER_CACHE_VOLUME" >/dev/null
fi

docker build --pull=false --platform linux/arm64 --tag "$BUILDER_IMAGE" "$SCRIPT_DIR" \
  >"$RUN_DIR/image-build.log" 2>&1

{
  printf 'run.id=%s\n' "$RUN_ID"
  printf 'source.path=%s\n' "$SOURCE_DIR"
  printf 'source.commit=%s\n' "$ACTUAL_COMMIT"
  printf 'source.tag=bun-v1.3.14\n'
  printf 'container.base=%s\n' "$BASE_IMAGE"
  printf 'container.builder=%s\n' "$BUILDER_IMAGE"
  printf 'container.platform=%s\n' "$(docker info --format '{{.OSType}}/{{.Architecture}}')"
  printf 'container.storeVolume=%s\n' "$STORE_VOLUME"
  printf 'container.buildCacheVolume=%s\n' "$BUILD_CACHE_VOLUME"
  printf 'container.compilerCacheVolume=%s\n' "$COMPILER_CACHE_VOLUME"
  printf 'container.clangCompressionOverride=zlib\n'
  printf 'build.driver=node --experimental-strip-types\n'
  printf 'build.jobs=%s\n' "$BUILD_JOBS"
  printf 'build.networkAuthorized=%s\n' "${CAPSULE_ALLOW_BUILD_NETWORK:-0}"
} >"$RUN_DIR/inputs.txt"

if [[ "${CAPSULE_ALLOW_BUILD_NETWORK:-0}" != '1' ]]; then
  printf 'BLOCKED: the first build may fetch only Bun-pinned flake, package, Zig, WebKit, and dependency inputs.\n' >&2
  printf 'Review TOOLCHAIN.md, then rerun with CAPSULE_ALLOW_BUILD_NETWORK=1.\n' >&2
  printf 'Prepared run directory: %s\n' "$RUN_DIR" >&2
  exit 2
fi

printf 'Building exact stock Bun 1.3.14 in %s; full log: %s\n' "$BUILDER_IMAGE" "$BUILD_LOG"
docker run --rm \
  --platform linux/arm64 \
  --label io.capsule.spike=gate-c-p0-0 \
  --mount "type=volume,src=$STORE_VOLUME,dst=/nix" \
  --mount "type=volume,src=$BUILD_CACHE_VOLUME,dst=/root/.bun" \
  --mount "type=volume,src=$COMPILER_CACHE_VOLUME,dst=/root/.cache" \
  --mount "type=bind,src=$WORK_DIR,dst=/work" \
  --mount "type=bind,src=$SOURCE_DIR,dst=$SOURCE_DIR,readonly" \
  --mount "type=bind,src=$SCRIPT_DIR,dst=/capsule-fixture,readonly" \
  --workdir /work \
  --entrypoint /bin/sh \
  "$BUILDER_IMAGE" -lc \
  "nix --extra-experimental-features 'nix-command flakes' develop . --command sh -lc '
    set -eu
    printf \"tool.nix=%s\\n\" \"\$(nix --version)\"
    printf \"tool.bun.bootstrap=%s\\n\" \"\$(bun --revision)\"
    printf \"tool.clang=%s\\n\" \"\$(clang --version | head -n 1)\"
    printf \"tool.llvm=%s\\n\" \"\$(llvm-config --version)\"
    printf \"tool.lld=%s\\n\" \"\$(ld.lld --version | head -n 1)\"
    printf \"tool.cmake=%s\\n\" \"\$(cmake --version | head -n 1)\"
    printf \"tool.ninja=%s\\n\" \"\$(ninja --version)\"
    printf \"tool.go=%s\\n\" \"\$(go version)\"
    printf \"tool.rustc=%s\\n\" \"\$(rustc --version)\"
    printf \"tool.cargo=%s\\n\" \"\$(cargo --version)\"
    printf \"tool.ruby=%s\\n\" \"\$(ruby --version)\"
    printf \"tool.node=%s\\n\" \"\$(node --version)\"
    printf \"tool.python=%s\\n\" \"\$(python3 --version)\"
    printf \"tool.perl=%s\\n\" \"\$(perl -e '\''print \$^V'\'')\"
    export CAPSULE_REAL_CC=\"\$CC\"
    export CAPSULE_REAL_CXX=\"\$CXX\"
    export PATH=/capsule-fixture/toolchain-bin:\$PATH
    printf \"tool.cc.real=%s\\n\" \"\$CAPSULE_REAL_CC\"
    printf \"tool.cxx.real=%s\\n\" \"\$CAPSULE_REAL_CXX\"
    printf \"tool.wrapper.path=%s\\n\" /capsule-fixture/toolchain-bin
    node --experimental-strip-types scripts/build.ts --profile=debug-no-asan -j$BUILD_JOBS
    test -x build/debug/bun-debug
    build/debug/bun-debug --version
    build/debug/bun-debug --revision
    build/debug/bun-debug /capsule-fixture/baseline.ts
    sha256sum build/debug/bun-debug
  '" 2>&1 | tee -a "$BUILD_LOG"

docker run --rm \
  --platform linux/arm64 \
  --network none \
  --mount "type=volume,src=$STORE_VOLUME,dst=/nix" \
  --mount "type=volume,src=$BUILD_CACHE_VOLUME,dst=/root/.bun" \
  --mount "type=volume,src=$COMPILER_CACHE_VOLUME,dst=/root/.cache" \
  --mount "type=bind,src=$WORK_DIR,dst=/work" \
  --mount "type=bind,src=$SOURCE_DIR,dst=$SOURCE_DIR,readonly" \
  --mount "type=bind,src=$SCRIPT_DIR,dst=/capsule-fixture,readonly" \
  --workdir /work \
  --entrypoint /bin/sh \
  "$BUILDER_IMAGE" -lc \
  "nix --offline --extra-experimental-features 'nix-command flakes' develop . --command sh -lc '
    set -eu
    test -x build/debug/bun-debug
    printf \"binary.version=%s\\n\" \"\$(build/debug/bun-debug --version)\"
    printf \"binary.revision=%s\\n\" \"\$(build/debug/bun-debug --revision)\"
    printf \"binary.sha256=%s\\n\" \"\$(sha256sum build/debug/bun-debug | cut -d\" \" -f1)\"
    printf \"fixture.output=%s\\n\" \"\$(build/debug/bun-debug /capsule-fixture/baseline.ts)\"
  '" | tee "$SUMMARY_LOG"

printf 'PASS: exact stock baseline built; retained raw run: %s\n' "$RUN_DIR"
