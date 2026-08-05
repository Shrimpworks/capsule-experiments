#!/bin/sh
set -eu

test "$(pwd)" = /workspace
test "${GOVERNED_NETWORK_MODE:-}" = none
test "$(nproc)" = 1
test "$(sed -n 's/^commit=//p' inputs/source-ref.txt)" = \
  29b71f06c2df5ab06721ccbb7bc744fb8104356e
test "$(git -C deno rev-parse HEAD)" = \
  29b71f06c2df5ab06721ccbb7bc744fb8104356e
test "$(git -C deno rev-parse 'HEAD^{tree}')" = \
  172e57551fe5a6683f11c886a81f9634023a5514
test -z "$(git -C deno status --porcelain)"
test ! -e target
test ! -e out
test -d cache/vendor
test -f cache/cargo-home/config.toml
test -f cache/cargo-source-bundle.tar.gz
test ! -e cache/sccache
test ! -e cache/ccache

if command -v sccache >/dev/null 2>&1 || command -v ccache >/dev/null 2>&1; then
  echo "compiler object cache executable is forbidden" >&2
  exit 1
fi
if awk 'NR > 1 && $2 == "00000000" { found=1 } END { exit found ? 0 : 1 }' /proc/net/route; then
  echo "default route exists in network-disabled runtime build" >&2
  exit 1
fi

archive=inputs/rusty-v8/librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz
binding=inputs/rusty-v8/src_binding_simdutf_release_aarch64-unknown-linux-gnu.rs
test "$(sha256sum "$archive" | awk '{print $1}')" = \
  1ae209c9e4ba5803d010d2c79ee4cc0af0126c5a7ebcca211c7e41deaede4cd2
test "$(sha256sum "$binding" | awk '{print $1}')" = \
  8603f09ab95e79620ea29f73933c09ae3618c6f924472c0ce36d5c614d1ceba4

export CARGO_HOME=/workspace/cache/cargo-home
export CARGO_NET_OFFLINE=true
export RUSTY_V8_ARCHIVE=/workspace/$archive
export RUSTY_V8_SRC_BINDING_PATH=/workspace/$binding
export SOURCE_DATE_EPOCH=0
export TZ=UTC
export LC_ALL=C
export LANG=C
export CARGO_TARGET_DIR=/workspace/target
export TMPDIR=/workspace/target/tmp
unset SCCACHE CCACHE RUSTC_WRAPPER
mkdir -p "$TMPDIR"

/usr/bin/setarch aarch64 -R cargo build --manifest-path probe/Cargo.toml \
  --locked --offline --release -j1

binary=target/release/capsule-deno-core-physical-omission
snapshot=$(find target/release/build \
  -path '*/out/capsule_core_snapshot.bin' -type f -print | LC_ALL=C sort | sed -n '1p')
test -f "$binary"
test -f "$snapshot"

mkdir -p out/runtime/bundle/bin out/runtime/bundle/share/capsule-deno-core \
  out/runtime/evidence
install -m 0755 "$binary" \
  out/runtime/bundle/bin/capsule-deno-core-c2b-fixed-fixture
install -m 0644 "$snapshot" \
  out/runtime/bundle/share/capsule-deno-core/capsule_core_snapshot.bin
touch -d @0 out/runtime/bundle/bin/capsule-deno-core-c2b-fixed-fixture \
  out/runtime/bundle/share/capsule-deno-core/capsule_core_snapshot.bin
(
  cd out/runtime/bundle
  tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner --format=posix \
    --pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime \
    -cf - bin share | gzip -n -9 > ../capsule-deno-core-c2b-runtime-bundle.tar.gz
  find bin share -type f -print | LC_ALL=C sort | while IFS= read -r file; do
    printf '%s\t%s\t%s\t%s\n' \
      "$(stat -c %a "$file")" "$(stat -c %s "$file")" \
      "$(sha256sum "$file" | awk '{print $1}')" "$file"
  done > ../bundle-manifest.tsv
)

candidate=out/runtime/bundle/bin/capsule-deno-core-c2b-fixed-fixture
env -i "$candidate" > out/runtime/evidence/completion.json \
  2> out/runtime/evidence/runtime-manifest.txt
cmp out/runtime/evidence/completion.json probe/src/fixtures/completion.json
grep -F 'CAPSULE_HOST_SEAL_ACTIVE' out/runtime/evidence/runtime-manifest.txt >/dev/null
grep -F '"fixedFixtureOnly":true' out/runtime/evidence/runtime-manifest.txt >/dev/null
grep -F '"callerArguments":false' out/runtime/evidence/runtime-manifest.txt >/dev/null
grep -F '"callerEnvironment":false' out/runtime/evidence/runtime-manifest.txt >/dev/null

if env -i "$candidate" --source /caller/path \
  > out/runtime/evidence/argument-injection.txt 2>&1; then
  echo "caller argument injection unexpectedly passed" >&2
  exit 1
fi
grep -F 'caller arguments are not accepted' \
  out/runtime/evidence/argument-injection.txt >/dev/null

if env -i CAPSULE_CALLER_INJECTION=1 "$candidate" \
  > out/runtime/evidence/environment-injection.txt 2>&1; then
  echo "caller environment injection unexpectedly passed" >&2
  exit 1
fi
grep -F 'caller environment is not accepted' \
  out/runtime/evidence/environment-injection.txt >/dev/null

if /bin/bash -c 'exec 3</dev/null; exec -c "$1"' _ "$candidate" \
  > out/runtime/evidence/descriptor-injection.txt 2>&1; then
  echo "caller descriptor injection unexpectedly passed" >&2
  exit 1
fi
grep -F 'unexpected inherited descriptors: [0, 1, 2, 3]' \
  out/runtime/evidence/descriptor-injection.txt >/dev/null

nm -C --defined-only "$candidate" \
  | grep -oE 'deno_core::ops_builtin(_types|_v8)?::op_[A-Za-z0-9_]+' \
  | sort -u > out/runtime/evidence/final-link-symbols.txt
expected='deno_core::ops_builtin_v8::op_get_ext_import_meta_proto
deno_core::ops_builtin_v8::op_get_extras_binding_object
deno_core::ops_builtin_v8::op_set_captured_bootstrap'
test "$(cat out/runtime/evidence/final-link-symbols.txt)" = "$expected"
readelf -h -l -d -V "$candidate" > out/runtime/evidence/elf-proof.txt
rustc -Vv > out/runtime/evidence/rustc-version.txt
cargo -Vv > out/runtime/evidence/cargo-version.txt

cat > out/runtime/evidence/build-boundary.txt <<'EOF'
networkMode=none
compilerCache=absent
snapshotBuilderLogicalCpus=1
snapshotBuilderCpuSet=0
targetExistedBeforeBuild=false
outputExistedBeforeBuild=false
guestExecution=NOT_RUN
runtimeAdmission=false
EOF

printf 'binary.size=%s\n' "$(stat -c %s "$candidate")"
printf 'binary.sha256=%s\n' "$(sha256sum "$candidate" | awk '{print $1}')"
printf 'snapshot.size=%s\n' "$(stat -c %s out/runtime/bundle/share/capsule-deno-core/capsule_core_snapshot.bin)"
printf 'snapshot.sha256=%s\n' "$(sha256sum out/runtime/bundle/share/capsule-deno-core/capsule_core_snapshot.bin | awk '{print $1}')"
printf 'bundle.size=%s\n' "$(stat -c %s out/runtime/capsule-deno-core-c2b-runtime-bundle.tar.gz)"
printf 'bundle.sha256=%s\n' "$(sha256sum out/runtime/capsule-deno-core-c2b-runtime-bundle.tar.gz | awk '{print $1}')"
