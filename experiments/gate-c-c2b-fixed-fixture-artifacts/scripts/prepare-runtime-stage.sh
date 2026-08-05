#!/bin/sh
set -eu

if [ "$#" -ne 4 ]; then
  echo "usage: $0 DENO_CHECKOUT RUSTY_V8_BUNDLE STAGE LABEL" >&2
  exit 2
fi

deno=$(CDPATH='' cd -- "$1" && pwd)
rusty_bundle=$(CDPATH='' cd -- "$2" && pwd)
stage=$3
label=$4
experiment=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
prior=$(CDPATH='' cd -- "$experiment/../gate-c-fork-native-deno-runtime-bundle" && pwd)
expected_head=29b71f06c2df5ab06721ccbb7bc744fb8104356e
expected_tree=172e57551fe5a6683f11c886a81f9634023a5514

case "$label:$stage" in
  v2-a:/private/tmp/capsule-c2b-fixed-fixture-runtime-v2-a) ;;
  v2-b:/private/tmp/capsule-c2b-fixed-fixture-runtime-v2-b) ;;
  *) echo "stage and label must be the exact task-owned v2-a or v2-b path" >&2; exit 1 ;;
esac

test ! -e "$stage"
test "$(git -C "$deno" rev-parse HEAD)" = "$expected_head"
test "$(git -C "$deno" rev-parse 'HEAD^{tree}')" = "$expected_tree"
test -z "$(git -C "$deno" status --porcelain)"
test "$(shasum -a 256 "$deno/tools/capsule/governed-deno-core/c2b-fixture/binding.json" | awk '{print $1}')" = \
  41350bcfc854338ded5e62f77475daf86486351356104dbbf647a8f8b5f11946
test "$(shasum -a 256 "$rusty_bundle/librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz" | awk '{print $1}')" = \
  1ae209c9e4ba5803d010d2c79ee4cc0af0126c5a7ebcca211c7e41deaede4cd2
test "$(shasum -a 256 "$rusty_bundle/src_binding_simdutf_release_aarch64-unknown-linux-gnu.rs" | awk '{print $1}')" = \
  8603f09ab95e79620ea29f73933c09ae3618c6f924472c0ce36d5c614d1ceba4
grep -F '"sourceCommit": "80e863ddb942a4aa2b384e794fc23e35b9d2bb15"' \
  "$rusty_bundle/release-manifest.json" >/dev/null

mkdir -p "$stage/inputs/rusty-v8" "$stage/probe/src/fixtures" "$stage/scripts"
git clone --quiet --no-local "$deno" "$stage/deno"
git -C "$stage/deno" checkout --quiet --detach "$expected_head"
test "$(git -C "$stage/deno" rev-parse 'HEAD^{tree}')" = "$expected_tree"
test -z "$(git -C "$stage/deno" status --porcelain)"

for name in \
  artifact-sha256sums.txt \
  librusty_v8_simdutf_release_aarch64-unknown-linux-gnu.a.gz \
  release-manifest.json \
  src_binding_simdutf_release_aarch64-unknown-linux-gnu.rs
do
  cp "$rusty_bundle/$name" "$stage/inputs/rusty-v8/$name"
done

cp "$prior/builder/Cargo.lock" "$stage/probe/Cargo.lock"
cp "$prior/builder/Cargo.toml" "$stage/probe/Cargo.toml"
cp "$stage/deno/tools/capsule/governed-deno-core/c2b-fixture/runtime-build.rs" \
  "$stage/probe/build.rs"
cp "$stage/deno/tools/capsule/governed-deno-core/c2b-fixture/runtime-main.rs" \
  "$stage/probe/src/main.rs"
cp "$stage/deno/tools/capsule/governed-deno-core/c2b-fixture/binding.rs" \
  "$stage/probe/src/binding.rs"
cp "$stage/deno/tools/capsule/governed-deno-core/c2b-fixture/fixtures/"* \
  "$stage/probe/src/fixtures/"
cp "$experiment/builder/prefetch-runtime.sh" "$stage/scripts/prefetch-runtime.sh"
cp "$experiment/builder/build-runtime-offline.sh" "$stage/scripts/build-runtime-offline.sh"
chmod 0755 "$stage/scripts/"*.sh

git -C "$stage/deno" archive --format=tar \
  --prefix=Shrimpworks-deno-29b71f06c2df/ "$expected_head" \
  | gzip -n -9 > "$stage/inputs/Shrimpworks-deno-29b71f06c2df-source.tar.gz"

cat > "$stage/inputs/source-ref.txt" <<EOF
repository=https://github.com/Shrimpworks/deno.git
commit=$expected_head
tree=$expected_tree
bindingSha256=41350bcfc854338ded5e62f77475daf86486351356104dbbf647a8f8b5f11946
rustyV8ArchiveSha256=1ae209c9e4ba5803d010d2c79ee4cc0af0126c5a7ebcca211c7e41deaede4cd2
rustyV8BindingSha256=8603f09ab95e79620ea29f73933c09ae3618c6f924472c0ce36d5c614d1ceba4
label=$label
EOF

printf 'stage=%s\n' "$stage"
printf 'deno.head=%s\n' "$expected_head"
printf 'deno.tree=%s\n' "$expected_tree"
printf 'deno.sourceArchive.sha256=%s\n' \
  "$(shasum -a 256 "$stage/inputs/Shrimpworks-deno-29b71f06c2df-source.tar.gz" | awk '{print $1}')"
