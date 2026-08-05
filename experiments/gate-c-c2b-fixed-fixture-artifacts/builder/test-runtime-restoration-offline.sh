#!/bin/sh
set -eu

test "$(pwd)" = /workspace
test "${GOVERNED_NETWORK_MODE:-}" = none
test "$(nproc)" = 1
test -d target
test -d out/runtime/evidence
test "$(sha256sum out/runtime/bundle/bin/capsule-deno-core-c2b-fixed-fixture | awk '{print $1}')" = \
  e781a90236cdf1272a9a16189c6be033164fa25a5aa9e52376ef998982ec0a77

if awk 'NR > 1 && $2 == "00000000" { found=1 } END { exit found ? 0 : 1 }' /proc/net/route; then
  echo "default route exists in network-disabled restoration test" >&2
  exit 1
fi

export CARGO_HOME=/workspace/cache/cargo-home
export CARGO_NET_OFFLINE=true
export RUSTY_V8_ARCHIVE=/workspace/inputs/rusty-v8/librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz
export RUSTY_V8_SRC_BINDING_PATH=/workspace/inputs/rusty-v8/src_binding_simdutf_release_aarch64-unknown-linux-gnu.rs
export SOURCE_DATE_EPOCH=0
export TZ=UTC
export LC_ALL=C
export LANG=C
export CARGO_TARGET_DIR=/workspace/target
export TMPDIR=/workspace/target/tmp
unset SCCACHE CCACHE RUSTC_WRAPPER

: > out/runtime/evidence/restoration-results.jsonl
: > out/runtime/evidence/restoration-manifests.txt
for mutation in socket clone execve exec-mmap; do
  CAPSULE_BUILD_RESTORATION_SYSCALL=$mutation \
    /usr/bin/setarch aarch64 -R cargo build --manifest-path probe/Cargo.toml \
      --locked --offline --release -j1
  env -i target/release/capsule-deno-core-physical-omission \
    >> out/runtime/evidence/restoration-results.jsonl \
    2>> out/runtime/evidence/restoration-manifests.txt
done

test "$(wc -l < out/runtime/evidence/restoration-results.jsonl | tr -d ' ')" = 4
for mutation in socket clone execve exec-mmap; do
  grep -F "\"mutation\":\"$mutation\"" \
    out/runtime/evidence/restoration-results.jsonl >/dev/null
done
test "$(grep -c 'CAPSULE_HOST_SEAL_ACTIVE' out/runtime/evidence/restoration-manifests.txt)" = 4
test "$(grep -c '"result":"denied"' out/runtime/evidence/restoration-results.jsonl)" = 4

# The mutation builds live only in the disposable target directory. The retained
# canonical output must remain the exact clean-build artifact.
test "$(sha256sum out/runtime/bundle/bin/capsule-deno-core-c2b-fixed-fixture | awk '{print $1}')" = \
  e781a90236cdf1272a9a16189c6be033164fa25a5aa9e52376ef998982ec0a77
printf 'restorationMutations=4\n'
printf 'canonicalOutput=unchanged\n'
