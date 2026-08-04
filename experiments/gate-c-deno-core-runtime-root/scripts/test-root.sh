#!/bin/sh
set -eu

if [ "$#" -ne 4 ]; then
  echo "usage: $0 BUILD_DIR STRACE_DEB WORK_DIR EVIDENCE_DIR" >&2
  exit 2
fi

build=$1
strace_deb=$2
work=$3
evidence=$4
experiment=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
builder='rust:1.95.0-bookworm@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1'
expected_strace=751817724af91cb95df566a21a154f9a7dcdd938e700e5cb9a5a47eb19752ea2

test "$(sha256sum "$strace_deb" | awk '{print $1}')" = "$expected_strace"
test -d "$build/root"
if [ -e "$work" ]; then
  echo "refusing to replace mutation work directory: $work" >&2
  exit 1
fi
mkdir -p "$work" "$evidence"
work=$(CDPATH='' cd -- "$work" && pwd)
evidence=$(CDPATH='' cd -- "$evidence" && pwd)

image=$(docker import --platform linux/arm64 "$build/rootfs.tar")
mutated_image=
cleanup() {
  docker image rm "$image" >/dev/null 2>&1 || true
  if [ -n "$mutated_image" ]; then docker image rm "$mutated_image" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

config=$(docker image inspect "$image" --format '{{json .Config}}')
test "$config" = '{}'
nominal=$(docker run --rm --platform linux/arm64 --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 32 \
  --memory 512m --cpus 1 --entrypoint /lib/ld-linux-aarch64.so.1 "$image" \
  --inhibit-cache --library-path /lib/aarch64-linux-gnu \
  /bin/capsule-deno-core-physical-omission \
  --source /fixtures/nominal.js --input /fixtures/input.json)
test "$nominal" = '{"count":3,"label":"capsule-owned","sum":6}'

mutated_image=$(docker import --platform linux/arm64 \
  --change 'ENV LD_PRELOAD=/capsule/forbidden.so' "$build/rootfs.tar")
mutated_env=$(docker image inspect "$mutated_image" --format '{{json .Config.Env}}')
test "$mutated_env" = '["LD_PRELOAD=/capsule/forbidden.so"]'
printf 'caller-environment-injection\tpass\tmutated OCI environment rejected before execution\n' \
  >"$evidence/mutation-results.tsv"

docker run --rm --platform linux/arm64 --network none --cap-drop ALL \
  --security-opt no-new-privileges:true --tmpfs /tmp:rw,nosuid,nodev \
  -v "$work:/work" -v "$build/root:/source:ro" -v "$strace_deb:/inputs/strace.deb:ro" \
  --entrypoint /bin/sh "$builder" -ceu '
    dpkg-deb -x /inputs/strace.deb /work/tracer
    for name in missing-loader substituted-loader mutated-loader missing-library substituted-library mutated-library \
      missing-snapshot wrong-mode wrong-owner extra-file relocated-entry version-requirement
    do cp -a /source "/work/$name"; done
    rm /work/missing-loader/lib/ld-linux-aarch64.so.1
    cp /work/substituted-loader/lib/aarch64-linux-gnu/libc.so.6 \
      /work/substituted-loader/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1
    printf X | dd of=/work/mutated-loader/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1 \
      bs=1 seek=4096 conv=notrunc status=none
    rm /work/missing-library/lib/aarch64-linux-gnu/libm.so.6
    cp /work/substituted-library/lib/aarch64-linux-gnu/libc.so.6 \
      /work/substituted-library/lib/aarch64-linux-gnu/libm.so.6
    printf X | dd of=/work/mutated-library/lib/aarch64-linux-gnu/libgcc_s.so.1 \
      bs=1 seek=4096 conv=notrunc status=none
    rm /work/missing-snapshot/share/capsule-deno-core/capsule_core_snapshot.bin
    chmod 0777 /work/wrong-mode/bin/capsule-deno-core-physical-omission
    chown 1:1 /work/wrong-owner/lib/aarch64-linux-gnu/libm.so.6
    touch /work/extra-file/undeclared
    mkdir /work/relocated-entry/relocated
    mv /work/relocated-entry/fixtures/nominal.js /work/relocated-entry/relocated/nominal.js
    perl -0pi -e "s/GLIBC_2\\.34/GLIBC_X.34/g" \
      /work/version-requirement/bin/capsule-deno-core-physical-omission
  '

expect_manifest_failure() {
  name=$1
  if docker run --rm --platform linux/arm64 --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges:true --tmpfs /tmp:rw,noexec,nosuid,nodev \
    -v "$work/$name:/rootfs:ro" -v "$experiment:/experiment:ro" \
    --entrypoint /experiment/scripts/verify-root.sh "$builder" \
    /rootfs /experiment/manifests/runtime-root-files.tsv >/dev/null 2>&1
  then
    echo "mutation unexpectedly passed manifest verification: $name" >&2
    exit 1
  fi
  printf '%s\tpass\tclosed manifest rejected mutation\n' "$name" >>"$evidence/mutation-results.tsv"
}

for name in missing-loader substituted-loader mutated-loader missing-library substituted-library mutated-library \
  missing-snapshot wrong-mode wrong-owner extra-file relocated-entry version-requirement
do expect_manifest_failure "$name"; done

sed 's/597baba6b9f50fc619ce667a352e19686f8c73efc6819d137b3c4081450fd6f5/097baba6b9f50fc619ce667a352e19686f8c73efc6819d137b3c4081450fd6f5/' \
  "$experiment/manifests/runtime-root-files.tsv" >"$work/mutated-digest.tsv"
if docker run --rm --platform linux/arm64 --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true --tmpfs /tmp:rw,noexec,nosuid,nodev \
  -v "$build/root:/rootfs:ro" -v "$work/mutated-digest.tsv:/manifest.tsv:ro" \
  -v "$experiment:/experiment:ro" \
  --entrypoint /experiment/scripts/verify-root.sh "$builder" /rootfs /manifest.tsv \
  >/dev/null 2>&1
then
  echo "mutated manifest digest unexpectedly passed" >&2
  exit 1
fi
printf 'manifest-digest\tpass\tmutated expected digest rejected\n' \
  >>"$evidence/mutation-results.tsv"

version_output="$work/version-output.txt"
if docker run --rm --platform linux/arm64 --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true --pids-limit 32 --memory 512m --cpus 1 \
  -v "$work/version-requirement:/candidate:ro" \
  --entrypoint /candidate/lib/ld-linux-aarch64.so.1 "$builder" \
  --inhibit-cache --library-path /candidate/lib/aarch64-linux-gnu \
  /candidate/bin/capsule-deno-core-physical-omission \
  --source /candidate/fixtures/nominal.js --input /candidate/fixtures/input.json \
  >"$version_output" 2>&1
then
  echo "mutated GLIBC version unexpectedly executed" >&2
  exit 1
fi
grep -F "version \`GLIBC_X.34' not found" "$version_output" >/dev/null
printf 'version-runtime-link\tpass\tmutated GLIBC requirement rejected by packaged loader\n' \
  >>"$evidence/mutation-results.tsv"

docker run --rm --platform linux/arm64 --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true --security-opt seccomp=unconfined \
  --pids-limit 32 --memory 512m --cpus 1 --tmpfs /tmp:rw,noexec,nosuid,nodev \
  -v "$work:/work" -v "$build/root:/candidate:ro" \
  --entrypoint /usr/bin/env "$builder" -i /work/tracer/usr/bin/strace \
  -f -yy -s 256 -e 'trace=%file,%process,%network,mmap,mprotect,seccomp,setrlimit,prctl' \
  -o /work/file-open.trace /candidate/lib/ld-linux-aarch64.so.1 \
  --inhibit-cache --library-path /candidate/lib/aarch64-linux-gnu \
  /candidate/bin/capsule-deno-core-physical-omission \
  --source /candidate/fixtures/nominal.js --input /candidate/fixtures/input.json >/dev/null
node "$experiment/scripts/analyze-trace.mjs" "$work/file-open.trace" \
  "$evidence/file-open-summary.json"
cp "$work/file-open.trace" "$evidence/file-open.trace"

printf 'nominal-scratch-root\tpass\tfixed fixture, empty image config, read-only/network-none/capability-dropped\n' \
  >>"$evidence/mutation-results.tsv"
printf 'manifest-cap\tpass\t22 exact entries accepted; 23-entry extra-file rejected\n' \
  >>"$evidence/mutation-results.tsv"
printf 'rootMutationChecks=pass\n'
