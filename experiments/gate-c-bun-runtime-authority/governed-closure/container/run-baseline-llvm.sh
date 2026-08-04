#!/bin/bash
set -euo pipefail

# DEVELOPMENT-ONLY exact-LLVM baseline builder. It compiles and runs only
# Capsule's owned fixture and is not an isolation backend.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXPERIMENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_DIR="${1:-/private/tmp/capsule-gate-c-p0-0-bun-src-network}"
EXPECTED_COMMIT='0d9b296af33f2b851fcbf4df3e9ec89751734ba4'
BASE_IMAGE='docker.io/oven/bun@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04'
BUILDER_IMAGE='capsule-gate-c-p0-0-bun-builder:llvm-21.1.8-arm64'
BUILD_CACHE_VOLUME='capsule-gate-c-p0-0-bun-build-cache-v1'
COMPILER_CACHE_VOLUME='capsule-gate-c-p0-0-compiler-cache-v1'
BUILD_JOBS="${CAPSULE_BUILD_JOBS:-4}"
BUILD_PROFILE="${CAPSULE_BUILD_PROFILE:-release}"
RUN_ID="${CAPSULE_RESUME_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
RUN_DIR="$EXPERIMENT_DIR/.runs/$RUN_ID"
WORK_DIR="$RUN_DIR/bun"
BUILD_LOG="$RUN_DIR/llvm-build.log"
SUMMARY_LOG="$RUN_DIR/llvm-summary.txt"

fail() {
  printf 'BLOCKED: %s\n' "$*" >&2
  exit 2
}

case "$BUILD_PROFILE" in
release)
  BINARY_PATH='build/release/bun'
  ;;
debug-no-asan)
  BINARY_PATH='build/debug/bun-debug'
  ;;
*)
  fail 'CAPSULE_BUILD_PROFILE must be release or debug-no-asan'
  ;;
esac

[[ "$BUILD_JOBS" =~ ^[1-9][0-9]*$ ]] || fail 'CAPSULE_BUILD_JOBS must be a positive integer'
[[ "$RUN_ID" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9]+$ ]] || \
  fail 'CAPSULE_RESUME_RUN_ID has an invalid task-run format'
command -v docker >/dev/null 2>&1 || fail 'docker client is absent'
command -v git >/dev/null 2>&1 || fail 'git client is absent'
[[ -d "$SOURCE_DIR/.git" ]] || fail "exact retained source is absent: $SOURCE_DIR"
[[ "$(git -C "$SOURCE_DIR" rev-parse HEAD)" == "$EXPECTED_COMMIT" ]] || \
  fail 'retained source has the wrong commit'
[[ -z "$(git -C "$SOURCE_DIR" status --porcelain)" ]] || fail 'retained source checkout is dirty'
[[ "$(git -C "$SOURCE_DIR" describe --tags --exact-match)" == 'bun-v1.3.14' ]] || \
  fail 'retained source is not exactly tagged bun-v1.3.14'

docker info >/dev/null 2>&1 || fail 'Docker daemon is unavailable'
[[ "$(docker info --format '{{.OSType}}/{{.Architecture}}')" == 'linux/aarch64' ]] || \
  fail 'this evidence recipe requires a Linux/arm64 Docker daemon'
docker image inspect "$BASE_IMAGE" >/dev/null 2>&1 || {
  printf 'BLOCKED: pinned Bun base image is not cached: %s\n' "$BASE_IMAGE" >&2
  printf 'Fetch it deliberately with: docker pull %s\n' "$BASE_IMAGE" >&2
  exit 2
}
[[ "${CAPSULE_ALLOW_BUILD_NETWORK:-0}" == '1' ]] || \
  fail 'review TOOLCHAIN.md, then explicitly set CAPSULE_ALLOW_BUILD_NETWORK=1'

mkdir -p "$RUN_DIR"
if [[ -d "$WORK_DIR/.git" ]]; then
  [[ "$(git -C "$WORK_DIR" rev-parse HEAD)" == "$EXPECTED_COMMIT" ]] || \
    fail 'resumed build checkout has the wrong commit'
  git -C "$WORK_DIR" diff --quiet || fail 'resumed build checkout has tracked source changes'
else
  git clone --shared --no-checkout "$SOURCE_DIR" "$WORK_DIR" >"$RUN_DIR/clone.log" 2>&1
  git -C "$WORK_DIR" checkout --detach "$EXPECTED_COMMIT" >>"$RUN_DIR/clone.log" 2>&1
fi

for volume in "$BUILD_CACHE_VOLUME" "$COMPILER_CACHE_VOLUME"; do
  if ! docker volume inspect "$volume" >/dev/null 2>&1; then
    docker volume create --label io.capsule.spike=gate-c-p0-0 "$volume" >/dev/null
  fi
done

docker build --pull=false --platform linux/arm64 --tag "$BUILDER_IMAGE" "$SCRIPT_DIR/llvm" \
  2>&1 | tee "$RUN_DIR/llvm-image-build.log"

{
  printf 'run.id=%s\n' "$RUN_ID"
  printf 'source.path=%s\n' "$SOURCE_DIR"
  printf 'source.commit=%s\n' "$EXPECTED_COMMIT"
  printf 'source.tag=bun-v1.3.14\n'
  printf 'container.base=%s\n' "$BASE_IMAGE"
  printf 'container.builder=%s\n' "$BUILDER_IMAGE"
  printf 'container.builder.id=%s\n' "$(docker image inspect --format '{{.Id}}' "$BUILDER_IMAGE")"
  printf 'container.builder.bytes=%s\n' "$(docker image inspect --format '{{.Size}}' "$BUILDER_IMAGE")"
  printf 'container.platform=linux/aarch64\n'
  printf 'container.docker.server=%s\n' "$(docker version --format '{{.Server.Version}}')"
  printf 'container.memory.bytes=%s\n' "$(docker info --format '{{.MemTotal}}')"
  printf 'container.llvmInstaller.sha256=%s\n' \
    '9474ecd78b52aba6e923976b1e9773f5613027cc7e237b9956986cb536e02a36'
  printf 'container.rustupInstaller.sha256=%s\n' \
    '6c30b75a75b28a96fd913a037c8581b580080b6ee9b8169a3c0feb1af7fe8caf'
  printf 'tool.llvm.required=21.1.8\n'
  printf 'tool.rust.required=nightly-2025-12-10+rust-src+declared-targets\n'
  printf 'build.driver=bun 1.3.14 exact base image\n'
  printf 'build.profile=%s\n' "$BUILD_PROFILE"
  printf 'build.binary=%s\n' "$BINARY_PATH"
  printf 'build.jobs=%s\n' "$BUILD_JOBS"
  printf 'build.networkAuthorized=1\n'
} >"$RUN_DIR/llvm-inputs.txt"

printf 'Building exact stock Bun with LLVM 21.1.8; full log: %s\n' "$BUILD_LOG"
docker run --rm \
  --platform linux/arm64 \
  --label io.capsule.spike=gate-c-p0-0 \
  --mount "type=volume,src=$BUILD_CACHE_VOLUME,dst=/root/.bun" \
  --mount "type=volume,src=$COMPILER_CACHE_VOLUME,dst=/root/.cache" \
  --mount "type=bind,src=$WORK_DIR,dst=/work" \
  --mount "type=bind,src=$SOURCE_DIR,dst=$SOURCE_DIR,readonly" \
  --mount "type=bind,src=$SCRIPT_DIR,dst=/capsule-fixture,readonly" \
  --workdir /work \
  --entrypoint /bin/bash \
  "$BUILDER_IMAGE" -c "
    set -eu
    printf 'tool.bun.bootstrap=%s\\n' \"\$(bun --revision)\"
    printf 'tool.clang=%s\\n' \"\$(clang-21 --version | head -n 1)\"
    printf 'tool.llvm=%s\\n' \"\$(llvm-config-21 --version)\"
    printf 'tool.lld=%s\\n' \"\$(ld.lld-21 --version | head -n 1)\"
    printf 'tool.cmake=%s\\n' \"\$(cmake --version | head -n 1)\"
    printf 'tool.ninja=%s\\n' \"\$(ninja --version)\"
    printf 'tool.go=%s\\n' \"\$(go version)\"
    printf 'tool.rustc=%s\\n' \"\$(rustc --version)\"
    printf 'tool.cargo=%s\\n' \"\$(cargo --version)\"
    printf 'tool.ruby=%s\\n' \"\$(ruby --version)\"
    printf 'tool.python=%s\\n' \"\$(python3 --version)\"
    printf 'tool.perl=%s\\n' \"\$(perl -e 'print \$^V')\"
    bun scripts/build.ts --profile=$BUILD_PROFILE -j$BUILD_JOBS
    test -x $BINARY_PATH
    $BINARY_PATH --version
    $BINARY_PATH --revision
    $BINARY_PATH /capsule-fixture/baseline.ts
    sha256sum $BINARY_PATH
  " 2>&1 | tee -a "$BUILD_LOG"

docker run --rm \
  --platform linux/arm64 \
  --network none \
  --mount "type=bind,src=$WORK_DIR,dst=/work,readonly" \
  --mount "type=bind,src=$SCRIPT_DIR,dst=/capsule-fixture,readonly" \
  --workdir /work \
  --entrypoint /bin/bash \
  "$BUILDER_IMAGE" -c "
    set -eu
    printf 'binary.version=%s\\n' \"\$($BINARY_PATH --version)\"
    printf 'binary.revision=%s\\n' \"\$($BINARY_PATH --revision)\"
    printf 'binary.sha256=%s\\n' \"\$(sha256sum $BINARY_PATH | cut -d' ' -f1)\"
    printf 'fixture.output=%s\\n' \"\$($BINARY_PATH /capsule-fixture/baseline.ts)\"
  " | tee "$SUMMARY_LOG"

printf 'PASS: exact-LLVM stock baseline built; retained raw run: %s\n' "$RUN_DIR"
