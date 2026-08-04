#!/bin/sh
set -eu

test "$(pwd)" = /workspace
test "${GOVERNED_NETWORK_MODE:-}" = none
test -d root-a/root
test ! -e root-work
if awk 'NR > 1 && $2 == "00000000" { found=1 } END { exit found ? 0 : 1 }' /proc/net/route; then
  echo "default route exists in network-disabled root test" >&2
  exit 1
fi
test "$(sha256sum inputs/runtime/strace_6.1-0.1_arm64.deb | awk '{print $1}')" = \
  751817724af91cb95df566a21a154f9a7dcdd938e700e5cb9a5a47eb19752ea2

mkdir -p root-work/tracer root-work/mutations
dpkg-deb -x inputs/runtime/strace_6.1-0.1_arm64.deb root-work/tracer

for name in missing-loader substituted-loader mutated-loader missing-library \
  substituted-library mutated-library missing-snapshot wrong-mode wrong-owner \
  extra-file relocated-entry version-requirement
do
  cp -a root-a/root "root-work/mutations/$name"
done

rm root-work/mutations/missing-loader/lib/ld-linux-aarch64.so.1
cp root-work/mutations/substituted-loader/lib/aarch64-linux-gnu/libc.so.6 \
  root-work/mutations/substituted-loader/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1
printf X | dd of=root-work/mutations/mutated-loader/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1 \
  bs=1 seek=4096 conv=notrunc status=none
rm root-work/mutations/missing-library/lib/aarch64-linux-gnu/libm.so.6
cp root-work/mutations/substituted-library/lib/aarch64-linux-gnu/libc.so.6 \
  root-work/mutations/substituted-library/lib/aarch64-linux-gnu/libm.so.6
printf X | dd of=root-work/mutations/mutated-library/lib/aarch64-linux-gnu/libgcc_s.so.1 \
  bs=1 seek=4096 conv=notrunc status=none
rm root-work/mutations/missing-snapshot/share/capsule-deno-core/capsule_core_snapshot.bin
chmod 0777 root-work/mutations/wrong-mode/bin/capsule-deno-core-physical-omission
chown 1:1 root-work/mutations/wrong-owner/lib/aarch64-linux-gnu/libm.so.6
touch root-work/mutations/extra-file/undeclared
mkdir root-work/mutations/relocated-entry/relocated
mv root-work/mutations/relocated-entry/fixtures/nominal.js \
  root-work/mutations/relocated-entry/relocated/nominal.js
sed -i 's/GLIBC_2\.34/GLIBC_X.34/g' \
  root-work/mutations/version-requirement/bin/capsule-deno-core-physical-omission

printf 'mutation\tresult\treason\n' > out/root-mutation-results.tsv
for name in missing-loader substituted-loader mutated-loader missing-library \
  substituted-library mutated-library missing-snapshot wrong-mode wrong-owner \
  extra-file relocated-entry version-requirement
do
  observed="root-work/$name.tsv"
  /workspace/scripts/manifest-root.sh "root-work/mutations/$name" "$observed" >/dev/null 2>&1 || true
  if [ -f "$observed" ] && cmp -s out/runtime-root-files.tsv "$observed"; then
    echo "root mutation unexpectedly matched closed manifest: $name" >&2
    exit 1
  fi
  printf '%s\tpass\tclosed manifest rejected mutation\n' "$name" \
    >> out/root-mutation-results.tsv
done

cp out/runtime-root-files.tsv root-work/mutated-digest.tsv
awk -F '\t' 'BEGIN {OFS="\t"} NR == 3 {$7 = "0" substr($7, 2)} {print}' \
  out/runtime-root-files.tsv > root-work/mutated-digest.tsv
if cmp -s out/runtime-root-files.tsv root-work/mutated-digest.tsv; then
  echo "mutated expected digest unexpectedly equal" >&2
  exit 1
fi
printf 'manifest-digest\tpass\tmutated expected digest rejected\n' \
  >> out/root-mutation-results.tsv

if root-work/mutations/version-requirement/lib/ld-linux-aarch64.so.1 \
  --inhibit-cache --library-path root-work/mutations/version-requirement/lib/aarch64-linux-gnu \
  root-work/mutations/version-requirement/bin/capsule-deno-core-physical-omission \
  --source root-work/mutations/version-requirement/fixtures/nominal.js \
  --input root-work/mutations/version-requirement/fixtures/input.json \
  > root-work/version-output.txt 2>&1
then
  echo "mutated GLIBC version unexpectedly executed" >&2
  exit 1
fi
grep -F "version \`GLIBC_X.34' not found" root-work/version-output.txt >/dev/null
printf 'version-runtime-link\tpass\tmutated GLIBC requirement rejected by packaged loader\n' \
  >> out/root-mutation-results.tsv

readelf -h -l -d -V root-a/root/bin/capsule-deno-core-physical-omission \
  > out/elf-root-proof.txt
for subject in ld-linux-aarch64.so.1 libc.so.6 libgcc_s.so.1 libm.so.6; do
  readelf -h -l -d -V "root-a/root/lib/aarch64-linux-gnu/$subject" \
    >> out/elf-root-proof.txt
done
needed=$(readelf -d root-a/root/bin/capsule-deno-core-physical-omission \
  | sed -n 's/.*Shared library: \[\(.*\)\]/\1/p' | sort)
expected='ld-linux-aarch64.so.1
libc.so.6
libgcc_s.so.1
libm.so.6'
test "$needed" = "$expected"
printf 'rootMutationChecks=pass\n'
printf 'elfDynamicClosure=pass\n'
